-- Athena V2 FREE-11 — one-time Free Convert Opportunities researched prospect.
-- Additive organization product state only. Not a quota table, entitlement
-- engine, or prospect-count heuristic.
-- Do not apply this migration from application code.
--
-- Invariant:
--   A Free Convert reservation is organization-scoped.
--   Acquisition is a single-row compare-and-swap on organizations
--   (SELECT ... FOR UPDATE). At most one reserved Free prospect exists.
--   Reservation is acquired BEFORE a second request can create another
--   prospects row or enqueue intelligence.
--   Worker retryable failures stay reserved.
--   Ready consumes only when free_convert_prospect_id matches.
--   Terminal Processing Failed releases only that exact reservation
--   and keeps the bound prospect id so retry is same-prospect only.
--   Bound Saved (Find add without generate) is never recovered into a
--   new unbound prospect.
--   Existing Ready prospects evidence is lazily marked consumed so a
--   Full -> Free organization cannot obtain an additional Free-funded run.
--   consumed is historical and is never cleared by product plan changes
--   or by deleting the consumed prospect.
--
-- Crash window:
--   reserved + prospect_id IS NULL, or reserved + in-flight prospect with
--   no active generation job, after process death before bind/enqueue.
--   Recovery happens only inside reserve_athena_free_convert after
--   free_convert_reserved_at is older than 2 minutes.
--   Bound Saved / Processing Failed is never recovered into a new prospect.
--   Page load never acquires, binds, consumes, or releases.

alter table organizations
  add column if not exists free_convert_status text;

alter table organizations
  add column if not exists free_convert_prospect_id uuid;

alter table organizations
  add column if not exists free_convert_reserved_at timestamptz;

alter table organizations
  add column if not exists free_convert_reservation_token uuid;

alter table organizations
  drop constraint if exists organizations_free_convert_status_check;

alter table organizations
  add constraint organizations_free_convert_status_check
  check (
    free_convert_status is null
    or free_convert_status in ('reserved', 'consumed')
  );

alter table organizations
  drop constraint if exists organizations_free_convert_state_check;

alter table organizations
  add constraint organizations_free_convert_state_check
  check (
    (
      free_convert_status is null
      and free_convert_reserved_at is null
      and free_convert_reservation_token is null
    )
    or (
      free_convert_status = 'reserved'
      and free_convert_reserved_at is not null
      and free_convert_reservation_token is not null
    )
    or (
      free_convert_status = 'consumed'
      and free_convert_prospect_id is not null
      and free_convert_reserved_at is null
      and free_convert_reservation_token is null
    )
  );

comment on column organizations.free_convert_status is
  'One-time Free Convert Opportunities authority: null (available), reserved, consumed. Historical consumed is never cleared by plan change or prospect delete.';
comment on column organizations.free_convert_prospect_id is
  'Prospect bound to the current reserved starter, the consumed starter, or the last released failed attempt. Not a count heuristic.';
comment on column organizations.free_convert_reserved_at is
  'Reservation timestamp used only to recover a crash before bind/enqueue. Not a page-load lock.';
comment on column organizations.free_convert_reservation_token is
  'Compare-and-swap token for the active reservation. Bind and unbound release must match it.';

create or replace function consume_athena_free_convert(
  p_organization_id uuid,
  p_prospect_id uuid
)
returns table (
  consumed boolean,
  already boolean,
  ignored boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_prospect_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_prospect_id is null then
    raise exception 'prospect_id required';
  end if;

  select o.free_convert_status, o.free_convert_prospect_id
    into v_status, v_prospect_id
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  if v_status = 'consumed' and v_prospect_id = p_prospect_id then
    consumed := false;
    already := true;
    ignored := false;
    return next;
    return;
  end if;

  if v_status is distinct from 'reserved' or v_prospect_id is distinct from p_prospect_id then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_convert_status = 'consumed',
    free_convert_prospect_id = p_prospect_id,
    free_convert_reserved_at = null,
    free_convert_reservation_token = null,
    updated_at = now()
  where id = p_organization_id
    and free_convert_status = 'reserved'
    and free_convert_prospect_id = p_prospect_id;

  consumed := found;
  already := false;
  ignored := not found;
  return next;
end;
$$;

create or replace function release_athena_free_convert(
  p_organization_id uuid,
  p_prospect_id uuid default null,
  p_reservation_token uuid default null
)
returns table (
  released boolean,
  ignored boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_prospect_id uuid;
  v_token uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_convert_status,
    o.free_convert_prospect_id,
    o.free_convert_reservation_token
    into v_status, v_prospect_id, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found or v_status is distinct from 'reserved' then
    released := false;
    ignored := true;
    return next;
    return;
  end if;

  if not (
    (p_prospect_id is not null and v_prospect_id = p_prospect_id)
    or (
      v_prospect_id is null
      and p_reservation_token is not null
      and v_token = p_reservation_token
    )
  ) then
    released := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_convert_status = null,
    free_convert_reserved_at = null,
    free_convert_reservation_token = null,
    free_convert_prospect_id = coalesce(p_prospect_id, v_prospect_id),
    updated_at = now()
  where id = p_organization_id
    and free_convert_status = 'reserved';

  released := found;
  ignored := not found;
  return next;
end;
$$;

create or replace function bind_athena_free_convert_prospect(
  p_organization_id uuid,
  p_reservation_token uuid,
  p_prospect_id uuid
)
returns table (
  bound boolean,
  conflicted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_reservation_token is null then
    raise exception 'reservation_token required';
  end if;

  if p_prospect_id is null then
    raise exception 'prospect_id required';
  end if;

  perform 1
  from organizations o
  where o.id = p_organization_id
  for update;

  update organizations
  set
    free_convert_prospect_id = p_prospect_id,
    updated_at = now()
  where id = p_organization_id
    and free_convert_status = 'reserved'
    and free_convert_reservation_token = p_reservation_token
    and free_convert_prospect_id is null;

  if found then
    bound := true;
    conflicted := false;
    return next;
    return;
  end if;

  bound := false;
  conflicted := true;
  return next;
end;
$$;

create or replace function reserve_athena_free_convert(
  p_organization_id uuid
)
returns table (
  reserved boolean,
  recovered boolean,
  already_reserved boolean,
  already_consumed boolean,
  reservation_token uuid,
  prospect_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_prospect_id uuid;
  v_reserved_at timestamptz;
  v_token uuid;
  v_prospect_status text;
  v_ready_id uuid;
  v_has_active_job boolean := false;
  v_has_in_flight boolean := false;
  v_stale interval := interval '2 minutes';
  v_can_recover boolean := false;
  v_reuse_failed boolean := false;
  v_new_token uuid := gen_random_uuid();
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_convert_status,
    o.free_convert_prospect_id,
    o.free_convert_reserved_at,
    o.free_convert_reservation_token
    into v_status, v_prospect_id, v_reserved_at, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := false;
    reservation_token := null;
    prospect_id := null;
    return next;
    return;
  end if;

  if v_status = 'consumed' then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    prospect_id := v_prospect_id;
    return next;
    return;
  end if;

  if v_status = 'reserved' then
    if v_prospect_id is not null then
      select p.status
        into v_prospect_status
      from prospects p
      where p.id = v_prospect_id
        and p.organization_id = p_organization_id;

      if v_prospect_status = 'Ready' then
        perform consume_athena_free_convert(p_organization_id, v_prospect_id);
        reserved := false;
        recovered := false;
        already_reserved := false;
        already_consumed := true;
        reservation_token := null;
        prospect_id := v_prospect_id;
        return next;
        return;
      end if;

      select exists(
        select 1
        from athena_generation_jobs j
        join prospects p
          on p.linked_discussion_id = j.discussion_id
         and p.organization_id = j.organization_id
        where j.organization_id = p_organization_id
          and p.id = v_prospect_id
          and j.status in ('queued', 'processing', 'retryable')
      ) into v_has_active_job;
    end if;

    -- Never mint a second prospect from a bound Saved or Processing Failed
    -- reservation. Generate / retry must reuse the same prospect.
    if v_prospect_status in ('Saved', 'Processing Failed') then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      prospect_id := v_prospect_id;
      return next;
      return;
    end if;

    v_can_recover :=
      (
        v_prospect_id is null
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      )
      or (
        v_prospect_id is not null
        and not v_has_active_job
        and v_prospect_status is distinct from 'Ready'
        and v_prospect_status is distinct from 'Processing Failed'
        and v_prospect_status is distinct from 'Saved'
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      );

    if not v_can_recover then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      prospect_id := v_prospect_id;
      return next;
      return;
    end if;

    -- Bound enqueue-crash: refresh the token and keep the same prospect.
    if v_prospect_id is not null then
      update organizations
      set
        free_convert_status = 'reserved',
        free_convert_prospect_id = v_prospect_id,
        free_convert_reserved_at = now(),
        free_convert_reservation_token = v_new_token,
        updated_at = now()
      where id = p_organization_id
        and free_convert_status = 'reserved'
        and free_convert_prospect_id = v_prospect_id;

      if found then
        reserved := true;
        recovered := true;
        already_reserved := false;
        already_consumed := false;
        reservation_token := v_new_token;
        prospect_id := v_prospect_id;
        return next;
        return;
      end if;
    end if;
  end if;

  -- Historical Ready evidence: lazily mark consumed. Never fund another run.
  select p.id
    into v_ready_id
  from prospects p
  where p.organization_id = p_organization_id
    and p.status = 'Ready'
  order by p.updated_at desc nulls last
  limit 1;

  if v_ready_id is not null then
    update organizations
    set
      free_convert_status = 'consumed',
      free_convert_prospect_id = v_ready_id,
      free_convert_reserved_at = null,
      free_convert_reservation_token = null,
      updated_at = now()
    where id = p_organization_id
      and free_convert_status is distinct from 'consumed';

    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    prospect_id := v_ready_id;
    return next;
    return;
  end if;

  -- Historical in-flight during Full -> Free: do not cancel, do not mint another.
  select exists(
    select 1
    from prospects p
    where p.organization_id = p_organization_id
      and p.status in (
        'Queued',
        'Processing',
        'Learning from Website',
        'Generating Executive Intelligence'
      )
  ) into v_has_in_flight;

  if v_has_in_flight then
    reserved := false;
    recovered := false;
    already_reserved := true;
    already_consumed := false;
    reservation_token := null;
    prospect_id := v_prospect_id;
    return next;
    return;
  end if;

  -- Released failed starter: re-reserve the exact same prospect. Never mint another.
  if v_prospect_id is not null then
    select p.status
      into v_prospect_status
    from prospects p
    where p.id = v_prospect_id
      and p.organization_id = p_organization_id;

    v_reuse_failed := v_prospect_status = 'Processing Failed';
  end if;

  update organizations
  set
    free_convert_status = 'reserved',
    free_convert_prospect_id = case
      when v_reuse_failed then v_prospect_id
      else null
    end,
    free_convert_reserved_at = now(),
    free_convert_reservation_token = v_new_token,
    updated_at = now()
  where id = p_organization_id
    and (
      free_convert_status is null
      or free_convert_status = 'reserved'
    )
    and free_convert_status is distinct from 'consumed';

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    prospect_id := v_prospect_id;
    return next;
    return;
  end if;

  reserved := true;
  recovered := v_status = 'reserved' or v_reuse_failed;
  already_reserved := false;
  already_consumed := false;
  reservation_token := v_new_token;
  prospect_id := case when v_reuse_failed then v_prospect_id else null end;
  return next;
end;
$$;

revoke all on function consume_athena_free_convert(uuid, uuid) from public;
revoke all on function consume_athena_free_convert(uuid, uuid) from anon;
revoke all on function consume_athena_free_convert(uuid, uuid) from authenticated;
grant execute on function consume_athena_free_convert(uuid, uuid) to service_role;

revoke all on function release_athena_free_convert(uuid, uuid, uuid) from public;
revoke all on function release_athena_free_convert(uuid, uuid, uuid) from anon;
revoke all on function release_athena_free_convert(uuid, uuid, uuid) from authenticated;
grant execute on function release_athena_free_convert(uuid, uuid, uuid) to service_role;

revoke all on function bind_athena_free_convert_prospect(uuid, uuid, uuid) from public;
revoke all on function bind_athena_free_convert_prospect(uuid, uuid, uuid) from anon;
revoke all on function bind_athena_free_convert_prospect(uuid, uuid, uuid) from authenticated;
grant execute on function bind_athena_free_convert_prospect(uuid, uuid, uuid) to service_role;

revoke all on function reserve_athena_free_convert(uuid) from public;
revoke all on function reserve_athena_free_convert(uuid) from anon;
revoke all on function reserve_athena_free_convert(uuid) from authenticated;
grant execute on function reserve_athena_free_convert(uuid) to service_role;

comment on function consume_athena_free_convert(uuid, uuid) is
  'Server-only. reserved -> consumed only when free_convert_prospect_id matches. Never clears consumed.';
comment on function release_athena_free_convert(uuid, uuid, uuid) is
  'Server-only. Releases reserved only for the matching prospect or unbound reservation token.';
comment on function bind_athena_free_convert_prospect(uuid, uuid, uuid) is
  'Server-only. Binds a newly created prospect to the exact reservation token.';
comment on function reserve_athena_free_convert(uuid) is
  'Server-only compare-and-swap Free Convert reservation. Recovers stale crash-window reservations. Lazily consumes historical Ready. Never clears consumed.';
