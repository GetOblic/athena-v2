-- Athena V2 FREE-13 — one-time Free Audience / Persona entitlement.
-- Additive organization product state only. Not a quota table, entitlement
-- engine, or persona-count heuristic.
-- Do not apply this migration from application code.
--
-- Invariant:
--   A Free Audience reservation is organization-scoped.
--   Acquisition is a single-row compare-and-swap on organizations
--   (SELECT ... FOR UPDATE). At most one reserved Free audience exists.
--   Reservation is acquired BEFORE a second request can invoke the
--   Suggest provider or persist another personas row.
--   Successful persist binds and consumes only when
--   free_audience_persona_id matches.
--   Provider / persist failure releases only that exact reservation.
--   Existing personas evidence is lazily marked consumed so a
--   Full -> Free organization cannot obtain an additional Free audience.
--   consumed is historical and is never cleared by product plan changes
--   or by deleting the consumed audience.
--
-- Crash window:
--   reserved + persona_id IS NULL after process death before bind/persist.
--   Recovery happens only inside reserve_athena_free_audience after
--   free_audience_reserved_at is older than 2 minutes.
--   Bound reservations are never recovered into a second audience.
--   Page load never acquires, binds, consumes, or releases.

alter table organizations
  add column if not exists free_audience_status text;

alter table organizations
  add column if not exists free_audience_persona_id uuid;

alter table organizations
  add column if not exists free_audience_reserved_at timestamptz;

alter table organizations
  add column if not exists free_audience_reservation_token uuid;

alter table organizations
  drop constraint if exists organizations_free_audience_status_check;

alter table organizations
  add constraint organizations_free_audience_status_check
  check (
    free_audience_status is null
    or free_audience_status in ('reserved', 'consumed')
  );

alter table organizations
  drop constraint if exists organizations_free_audience_state_check;

alter table organizations
  add constraint organizations_free_audience_state_check
  check (
    (
      free_audience_status is null
      and free_audience_reserved_at is null
      and free_audience_reservation_token is null
    )
    or (
      free_audience_status = 'reserved'
      and free_audience_reserved_at is not null
      and free_audience_reservation_token is not null
    )
    or (
      free_audience_status = 'consumed'
      and free_audience_persona_id is not null
      and free_audience_reserved_at is null
      and free_audience_reservation_token is null
    )
  );

comment on column organizations.free_audience_status is
  'One-time Free Audience authority: null (available), reserved, consumed. Historical consumed is never cleared by plan change or audience delete.';
comment on column organizations.free_audience_persona_id is
  'Persona bound to the current reserved starter, the consumed starter, or the last released failed attempt. Not a count heuristic.';
comment on column organizations.free_audience_reserved_at is
  'Reservation timestamp used only to recover a crash before persist/bind. Not a page-load lock.';
comment on column organizations.free_audience_reservation_token is
  'Compare-and-swap token for the active reservation. Bind and unbound release must match it.';

create or replace function consume_athena_free_audience(
  p_organization_id uuid,
  p_persona_id uuid
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
  v_persona_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_persona_id is null then
    raise exception 'persona_id required';
  end if;

  select o.free_audience_status, o.free_audience_persona_id
    into v_status, v_persona_id
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

  if v_status = 'consumed' and v_persona_id = p_persona_id then
    consumed := false;
    already := true;
    ignored := false;
    return next;
    return;
  end if;

  if v_status is distinct from 'reserved' or v_persona_id is distinct from p_persona_id then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_audience_status = 'consumed',
    free_audience_persona_id = p_persona_id,
    free_audience_reserved_at = null,
    free_audience_reservation_token = null,
    updated_at = now()
  where id = p_organization_id
    and free_audience_status = 'reserved'
    and free_audience_persona_id = p_persona_id;

  consumed := found;
  already := false;
  ignored := not found;
  return next;
end;
$$;

create or replace function release_athena_free_audience(
  p_organization_id uuid,
  p_persona_id uuid default null,
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
  v_persona_id uuid;
  v_token uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_audience_status,
    o.free_audience_persona_id,
    o.free_audience_reservation_token
    into v_status, v_persona_id, v_token
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
    (p_persona_id is not null and v_persona_id = p_persona_id)
    or (
      v_persona_id is null
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
    free_audience_status = null,
    free_audience_reserved_at = null,
    free_audience_reservation_token = null,
    free_audience_persona_id = coalesce(p_persona_id, v_persona_id),
    updated_at = now()
  where id = p_organization_id
    and free_audience_status = 'reserved';

  released := found;
  ignored := not found;
  return next;
end;
$$;

create or replace function bind_athena_free_audience_persona(
  p_organization_id uuid,
  p_reservation_token uuid,
  p_persona_id uuid
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

  if p_persona_id is null then
    raise exception 'persona_id required';
  end if;

  perform 1
  from organizations o
  where o.id = p_organization_id
  for update;

  update organizations
  set
    free_audience_persona_id = p_persona_id,
    updated_at = now()
  where id = p_organization_id
    and free_audience_status = 'reserved'
    and free_audience_reservation_token = p_reservation_token
    and free_audience_persona_id is null;

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

create or replace function reserve_athena_free_audience(
  p_organization_id uuid
)
returns table (
  reserved boolean,
  recovered boolean,
  already_reserved boolean,
  already_consumed boolean,
  reservation_token uuid,
  persona_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_persona_id uuid;
  v_reserved_at timestamptz;
  v_token uuid;
  v_existing_id uuid;
  v_stale interval := interval '2 minutes';
  v_can_recover boolean := false;
  v_new_token uuid := gen_random_uuid();
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_audience_status,
    o.free_audience_persona_id,
    o.free_audience_reserved_at,
    o.free_audience_reservation_token
    into v_status, v_persona_id, v_reserved_at, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := false;
    reservation_token := null;
    persona_id := null;
    return next;
    return;
  end if;

  if v_status = 'consumed' then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    persona_id := v_persona_id;
    return next;
    return;
  end if;

  if v_status = 'reserved' then
    if v_persona_id is not null then
      perform consume_athena_free_audience(p_organization_id, v_persona_id);
      reserved := false;
      recovered := false;
      already_reserved := false;
      already_consumed := true;
      reservation_token := null;
      persona_id := v_persona_id;
      return next;
      return;
    end if;

    v_can_recover :=
      v_persona_id is null
      and (v_reserved_at is null or v_reserved_at <= now() - v_stale);

    if not v_can_recover then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      persona_id := v_persona_id;
      return next;
      return;
    end if;
  end if;

  -- Historical persona evidence: lazily mark consumed. Never fund another.
  select p.id
    into v_existing_id
  from personas p
  where p.organization_id = p_organization_id
  order by p.created_at asc
  limit 1;

  if v_existing_id is not null then
    update organizations
    set
      free_audience_status = 'consumed',
      free_audience_persona_id = v_existing_id,
      free_audience_reserved_at = null,
      free_audience_reservation_token = null,
      updated_at = now()
    where id = p_organization_id
      and free_audience_status is distinct from 'consumed';

    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    persona_id := v_existing_id;
    return next;
    return;
  end if;

  update organizations
  set
    free_audience_status = 'reserved',
    free_audience_persona_id = null,
    free_audience_reserved_at = now(),
    free_audience_reservation_token = v_new_token,
    updated_at = now()
  where id = p_organization_id
    and (
      free_audience_status is null
      or free_audience_status = 'reserved'
    )
    and free_audience_status is distinct from 'consumed';

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    persona_id := v_persona_id;
    return next;
    return;
  end if;

  reserved := true;
  recovered := v_status = 'reserved';
  already_reserved := false;
  already_consumed := false;
  reservation_token := v_new_token;
  persona_id := null;
  return next;
end;
$$;

revoke all on function consume_athena_free_audience(uuid, uuid) from public;
revoke all on function consume_athena_free_audience(uuid, uuid) from anon;
revoke all on function consume_athena_free_audience(uuid, uuid) from authenticated;
grant execute on function consume_athena_free_audience(uuid, uuid) to service_role;

revoke all on function release_athena_free_audience(uuid, uuid, uuid) from public;
revoke all on function release_athena_free_audience(uuid, uuid, uuid) from anon;
revoke all on function release_athena_free_audience(uuid, uuid, uuid) from authenticated;
grant execute on function release_athena_free_audience(uuid, uuid, uuid) to service_role;

revoke all on function bind_athena_free_audience_persona(uuid, uuid, uuid) from public;
revoke all on function bind_athena_free_audience_persona(uuid, uuid, uuid) from anon;
revoke all on function bind_athena_free_audience_persona(uuid, uuid, uuid) from authenticated;
grant execute on function bind_athena_free_audience_persona(uuid, uuid, uuid) to service_role;

revoke all on function reserve_athena_free_audience(uuid) from public;
revoke all on function reserve_athena_free_audience(uuid) from anon;
revoke all on function reserve_athena_free_audience(uuid) from authenticated;
grant execute on function reserve_athena_free_audience(uuid) to service_role;

comment on function consume_athena_free_audience(uuid, uuid) is
  'Server-only. reserved -> consumed only when free_audience_persona_id matches. Never clears consumed.';
comment on function release_athena_free_audience(uuid, uuid, uuid) is
  'Server-only. Releases reserved only for the matching persona or unbound reservation token.';
comment on function bind_athena_free_audience_persona(uuid, uuid, uuid) is
  'Server-only. Binds a newly created persona to the exact reservation token.';
comment on function reserve_athena_free_audience(uuid) is
  'Server-only compare-and-swap Free Audience reservation. Recovers stale unbound crash-window reservations. Lazily consumes historical personas. Never clears consumed.';
