-- Athena V2 CO-3 — concurrent GetOblic listing capacity reservation RPC.
-- Additive only. Does not alter prior GetOblic migrations, Prospects,
-- Personas, WordPress, billing, or the allocation-event ledger history.
-- Do not apply this migration from application code.
--
-- monthly_allowance on athena_getoblic_directory_settings is legacy physical
-- naming. It now represents concurrent GetOblic listing capacity for the
-- organization. There is no monthly reset. Allocation events remain immutable
-- audit history and MUST NOT determine capacity.
--
-- consume_getoblic_listing_allocation cannot reserve capacity before WordPress
-- author assignment because the claiming row is inserted outside that function
-- and a historical event returns already without counting held listings.
-- This sibling RPC is the transaction-safe capacity contract:
--   1. lock the organization settings row FOR UPDATE
--   2. count active links (claiming, linked, remote_missing)
--   3. resume the same already-active relationship without another slot
--   4. reject a NEW active relationship that would exceed capacity
--   5. insert claiming only after capacity is secured
--   6. write the first-lifetime allocation event as audit history only
--
-- A historical allocation event does NOT bypass capacity for a new active
-- relationship. An origin Prospect does NOT bypass capacity.
-- Released rows do not count as held.

comment on column athena_getoblic_directory_settings.monthly_allowance is
  'Legacy physical naming. Concurrent GetOblic listing capacity for the organization. Zero blocks new claims. Not a monthly reset entitlement.';

comment on table athena_getoblic_directory_settings is
  'Per-organization GetOblic Directory entitlement. Missing row means not configured (fail closed). monthly_allowance is legacy physical naming for concurrent listing capacity. Super Admin is the only writer.';

comment on table athena_getoblic_listing_allocation_events is
  'Immutable GetOblic Directory allocation audit ledger. Events do not determine concurrent listing capacity and must not be deleted or refunded on release.';

create or replace function reserve_getoblic_listing_capacity(
  p_organization_id uuid,
  p_prospect_id uuid,
  p_wordpress_listing_id bigint,
  p_period_start date,
  p_idempotency_key text,
  p_actor_user_id uuid default null,
  p_actor_licensee_account_id uuid default null
)
returns table (
  reserved boolean,
  resumed boolean,
  exceeded boolean,
  not_configured boolean,
  conflicted boolean,
  listing_link_id uuid,
  allocation_event_id uuid,
  event_recorded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_capacity integer;
  v_held integer;
  v_existing_link_id uuid;
  v_new_link_id uuid;
  v_existing_event_id uuid;
  v_new_event_id uuid;
  v_event_recorded boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_prospect_id is null then
    raise exception 'prospect_id required';
  end if;

  if p_wordpress_listing_id is null or p_wordpress_listing_id <= 0 then
    raise exception 'wordpress_listing_id required';
  end if;

  if p_period_start is null
     or p_period_start <> (date_trunc('month', p_period_start))::date then
    raise exception 'period_start must be the first day of a month';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key required';
  end if;

  -- Serialization primitive: one capacity decision at a time per organization.
  -- Held through count, claiming insert, and first-lifetime audit insert.
  select s.monthly_allowance
    into v_listing_capacity
  from athena_getoblic_directory_settings s
  where s.organization_id = p_organization_id
  for update;

  if not found then
    reserved := false;
    resumed := false;
    exceeded := false;
    not_configured := true;
    conflicted := false;
    listing_link_id := null;
    allocation_event_id := null;
    event_recorded := false;
    return next;
    return;
  end if;

  -- Same already-active relationship may resume without consuming another slot.
  select l.id
    into v_existing_link_id
  from athena_getoblic_listing_links l
  where l.organization_id = p_organization_id
    and l.prospect_id = p_prospect_id
    and l.wordpress_listing_id = p_wordpress_listing_id
    and l.relationship_status in ('claiming', 'linked', 'remote_missing')
  limit 1;

  if found then
    select e.id
      into v_existing_event_id
    from athena_getoblic_listing_allocation_events e
    where e.organization_id = p_organization_id
      and e.wordpress_listing_id = p_wordpress_listing_id
    limit 1;

    if not found then
      begin
        insert into athena_getoblic_listing_allocation_events (
          organization_id,
          prospect_id,
          listing_link_id,
          wordpress_listing_id,
          event_kind,
          period_start,
          idempotency_key,
          actor_user_id,
          actor_licensee_account_id
        ) values (
          p_organization_id,
          p_prospect_id,
          v_existing_link_id,
          p_wordpress_listing_id,
          'allocate_existing',
          p_period_start,
          p_idempotency_key,
          p_actor_user_id,
          p_actor_licensee_account_id
        )
        returning id into v_new_event_id;
        v_event_recorded := true;
        v_existing_event_id := v_new_event_id;
      exception
        when unique_violation then
          select e.id
            into v_existing_event_id
          from athena_getoblic_listing_allocation_events e
          where (
            e.organization_id = p_organization_id
            and e.wordpress_listing_id = p_wordpress_listing_id
          )
          or e.idempotency_key = p_idempotency_key
          limit 1;
          v_event_recorded := false;
      end;
    end if;

    reserved := false;
    resumed := true;
    exceeded := false;
    not_configured := false;
    conflicted := false;
    listing_link_id := v_existing_link_id;
    allocation_event_id := v_existing_event_id;
    event_recorded := v_event_recorded;
    return next;
    return;
  end if;

  -- Authoritative held definition. Events are not counted.
  select count(*)
    into v_held
  from athena_getoblic_listing_links l
  where l.organization_id = p_organization_id
    and l.relationship_status in ('claiming', 'linked', 'remote_missing');

  -- Historical events and origin Prospects do not bypass this check.
  if v_held >= v_listing_capacity then
    reserved := false;
    resumed := false;
    exceeded := true;
    not_configured := false;
    conflicted := false;
    listing_link_id := null;
    allocation_event_id := null;
    event_recorded := false;
    return next;
    return;
  end if;

  begin
    insert into athena_getoblic_listing_links (
      organization_id,
      prospect_id,
      wordpress_listing_id,
      relationship_origin,
      relationship_status,
      created_by_user_id,
      created_via_licensee_account_id
    ) values (
      p_organization_id,
      p_prospect_id,
      p_wordpress_listing_id,
      'linked_existing',
      'claiming',
      p_actor_user_id,
      p_actor_licensee_account_id
    )
    returning id into v_new_link_id;
  exception
    when unique_violation then
      -- Additional protection only. Capacity serialization is the settings
      -- row lock above, not these uniqueness constraints.
      -- Resume only the exact requested relationship. Same Prospect +
      -- different listing, same listing + different Prospect/org, or any
      -- other active exclusivity conflict is conflicted, not resumed.
      select l.id
        into v_existing_link_id
      from athena_getoblic_listing_links l
      where l.organization_id = p_organization_id
        and l.prospect_id = p_prospect_id
        and l.wordpress_listing_id = p_wordpress_listing_id
        and l.relationship_status in ('claiming', 'linked', 'remote_missing');

      if found then
        select e.id
          into v_existing_event_id
        from athena_getoblic_listing_allocation_events e
        where e.organization_id = p_organization_id
          and e.wordpress_listing_id = p_wordpress_listing_id
        limit 1;

        reserved := false;
        resumed := true;
        exceeded := false;
        not_configured := false;
        conflicted := false;
        listing_link_id := v_existing_link_id;
        allocation_event_id := v_existing_event_id;
        event_recorded := false;
        return next;
        return;
      end if;

      reserved := false;
      resumed := false;
      exceeded := false;
      not_configured := false;
      conflicted := true;
      listing_link_id := null;
      allocation_event_id := null;
      event_recorded := false;
      return next;
      return;
  end;

  select e.id
    into v_existing_event_id
  from athena_getoblic_listing_allocation_events e
  where e.organization_id = p_organization_id
    and e.wordpress_listing_id = p_wordpress_listing_id
  limit 1;

  if not found then
    begin
      insert into athena_getoblic_listing_allocation_events (
        organization_id,
        prospect_id,
        listing_link_id,
        wordpress_listing_id,
        event_kind,
        period_start,
        idempotency_key,
        actor_user_id,
        actor_licensee_account_id
      ) values (
        p_organization_id,
        p_prospect_id,
        v_new_link_id,
        p_wordpress_listing_id,
        'allocate_existing',
        p_period_start,
        p_idempotency_key,
        p_actor_user_id,
        p_actor_licensee_account_id
      )
      returning id into v_new_event_id;
      v_event_recorded := true;
      v_existing_event_id := v_new_event_id;
    exception
      when unique_violation then
        -- Historical event remains. It does not refund or grant extra capacity.
        select e.id
          into v_existing_event_id
        from athena_getoblic_listing_allocation_events e
        where (
          e.organization_id = p_organization_id
          and e.wordpress_listing_id = p_wordpress_listing_id
        )
        or e.idempotency_key = p_idempotency_key
        limit 1;
        v_event_recorded := false;
    end;
  end if;

  reserved := true;
  resumed := false;
  exceeded := false;
  not_configured := false;
  conflicted := false;
  listing_link_id := v_new_link_id;
  allocation_event_id := v_existing_event_id;
  event_recorded := v_event_recorded;
  return next;
end;
$$;

revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from public;
revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from anon;
revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from authenticated;
grant execute on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) to service_role;

comment on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) is
  'Server-only atomic GetOblic listing capacity reservation. Locks athena_getoblic_directory_settings for the organization, counts active links, inserts claiming only when a new relationship is under capacity, and writes the first-lifetime allocation event as audit history. Executable by service_role only.';
