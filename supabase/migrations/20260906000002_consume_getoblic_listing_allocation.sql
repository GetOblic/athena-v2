-- Athena V2 Phase 2C1 — atomic GetOblic listing allocation consumption RPC.
-- Additive only. Does not alter 20260906000001_create_athena_getoblic_directory.sql,
-- Prospects, Personas, WordPress, billing, or claim-reservation tables.
--
-- Server-only mutation primitive. Application-level organization authorization,
-- Prospect ownership, and global listing exclusivity remain in Athena service
-- code and are NOT replaced by this function.
--
-- Serialization:
--   SELECT monthly_allowance FROM athena_getoblic_directory_settings
--   WHERE organization_id = p_organization_id
--   FOR UPDATE
-- is the serialization primitive for ALL first-time allocation decisions in
-- that organization. The row lock is held for the rest of this function
-- (lifetime check, period count, insert) because the function runs in one
-- PostgreSQL transaction.
--
-- Two simultaneous first-time claims for DIFFERENT listings in the SAME
-- organization therefore cannot evaluate monthly_allowance concurrently.
-- The second transaction waits on the same settings row, then sees the first
-- inserted event, and cannot oversubscribe monthly_allowance.
--
-- Different organizations lock different settings rows and do not share
-- allowance locks or pools.
--
-- UNIQUE (organization_id, wordpress_listing_id) and UNIQUE (idempotency_key)
-- remain additional protection only. Monthly quota serialization must not
-- rely on those constraints.
--
-- monthly_allowance is read from athena_getoblic_directory_settings.
-- Callers must not supply allowance, event_kind, or organization settings.
-- event_kind is frozen as allocate_existing.
-- period_start is supplied by Athena as the first day of the UTC calendar
-- month. This function does not derive a timezone-local period.

create or replace function consume_getoblic_listing_allocation(
  p_organization_id uuid,
  p_prospect_id uuid,
  p_listing_link_id uuid,
  p_wordpress_listing_id bigint,
  p_period_start date,
  p_idempotency_key text,
  p_actor_user_id uuid default null,
  p_actor_licensee_account_id uuid default null
)
returns table (
  consumed boolean,
  already boolean,
  exceeded boolean,
  not_configured boolean,
  allocation_event_id uuid,
  period_start date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monthly_allowance integer;
  v_existing_id uuid;
  v_existing_period date;
  v_used integer;
  v_new_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_prospect_id is null then
    raise exception 'prospect_id required';
  end if;

  if p_listing_link_id is null then
    raise exception 'listing_link_id required';
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

  -- Serialization primitive: one first-time allocation decision at a time
  -- per organization. Held through count and insert below.
  select s.monthly_allowance
    into v_monthly_allowance
  from athena_getoblic_directory_settings s
  where s.organization_id = p_organization_id
  for update;

  if not found then
    consumed := false;
    already := false;
    exceeded := false;
    not_configured := true;
    allocation_event_id := null;
    period_start := p_period_start;
    return next;
    return;
  end if;

  -- Lifetime allocation first. One wordpress_listing_id per organization
  -- over the life of this accounting model.
  select e.id, e.period_start
    into v_existing_id, v_existing_period
  from athena_getoblic_listing_allocation_events e
  where e.organization_id = p_organization_id
    and e.wordpress_listing_id = p_wordpress_listing_id
  limit 1;

  if found then
    consumed := false;
    already := true;
    exceeded := false;
    not_configured := false;
    allocation_event_id := v_existing_id;
    period_start := v_existing_period;
    return next;
    return;
  end if;

  select count(*)
    into v_used
  from athena_getoblic_listing_allocation_events e
  where e.organization_id = p_organization_id
    and e.period_start = p_period_start;

  if v_used >= v_monthly_allowance then
    consumed := false;
    already := false;
    exceeded := true;
    not_configured := false;
    allocation_event_id := null;
    period_start := p_period_start;
    return next;
    return;
  end if;

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
      p_listing_link_id,
      p_wordpress_listing_id,
      'allocate_existing',
      p_period_start,
      p_idempotency_key,
      p_actor_user_id,
      p_actor_licensee_account_id
    )
    returning id into v_new_id;
  exception
    when unique_violation then
      -- Additional protection only. Quota serialization is the settings
      -- row lock above, not these uniqueness constraints.
      select e.id, e.period_start
        into v_existing_id, v_existing_period
      from athena_getoblic_listing_allocation_events e
      where (
        e.organization_id = p_organization_id
        and e.wordpress_listing_id = p_wordpress_listing_id
      )
      or e.idempotency_key = p_idempotency_key
      limit 1;

      if found then
        consumed := false;
        already := true;
        exceeded := false;
        not_configured := false;
        allocation_event_id := v_existing_id;
        period_start := v_existing_period;
        return next;
        return;
      end if;

      raise;
  end;

  consumed := true;
  already := false;
  exceeded := false;
  not_configured := false;
  allocation_event_id := v_new_id;
  period_start := p_period_start;
  return next;
end;
$$;

revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from public;
revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from anon;
revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from authenticated;
grant execute on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) to service_role;

comment on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) is
  'Server-only atomic GetOblic allocation consumption. Locks athena_getoblic_directory_settings for the organization, then lifetime-checks, counts the UTC month, and inserts at most one allocate_existing event. Executable by service_role only.';
