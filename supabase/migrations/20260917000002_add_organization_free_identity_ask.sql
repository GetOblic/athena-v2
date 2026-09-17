-- Athena V2 FREE-8 — organization-scoped Free Identity Ask allowance.
-- Additive organization product state only. Not a quota table, entitlement
-- engine, or conversation transcript store.
-- Do not apply this migration from application code.
--
-- Invariant:
--   A successful Free Identity Ask exchange is organization-scoped.
--   Reservation is acquired with SELECT ... FOR UPDATE before the provider.
--   consumed + reserved >= limit denies a new reservation.
--   consume moves reserved - 1 / consumed + 1 after a valid non-empty reply.
--   release moves reserved - 1 and never decrements consumed.
--   consumed is historical and is never cleared by product plan changes.
--   The commercial limit lives in application policy, not this schema.
--
-- Crash window:
--   reserved_count > 0 after process death before consume / release.
--   Recovery happens only inside reserve_athena_free_identity_ask after
--   free_identity_ask_reserved_at is older than 2 minutes.
--   No worker or cleanup cron.

alter table organizations
  add column if not exists free_identity_ask_consumed_count integer not null default 0;

alter table organizations
  add column if not exists free_identity_ask_reserved_count integer not null default 0;

alter table organizations
  add column if not exists free_identity_ask_reserved_at timestamptz;

alter table organizations
  drop constraint if exists organizations_free_identity_ask_consumed_count_check;

alter table organizations
  add constraint organizations_free_identity_ask_consumed_count_check
  check (free_identity_ask_consumed_count >= 0);

alter table organizations
  drop constraint if exists organizations_free_identity_ask_reserved_count_check;

alter table organizations
  add constraint organizations_free_identity_ask_reserved_count_check
  check (free_identity_ask_reserved_count >= 0);

alter table organizations
  drop constraint if exists organizations_free_identity_ask_state_check;

alter table organizations
  add constraint organizations_free_identity_ask_state_check
  check (
    (
      free_identity_ask_reserved_count = 0
      and free_identity_ask_reserved_at is null
    )
    or (
      free_identity_ask_reserved_count > 0
      and free_identity_ask_reserved_at is not null
    )
  );

comment on column organizations.free_identity_ask_consumed_count is
  'Successful Free Identity Ask exchanges consumed for this organization. Historical and never cleared by plan change.';
comment on column organizations.free_identity_ask_reserved_count is
  'In-flight Free Identity Ask reservations held for this organization.';
comment on column organizations.free_identity_ask_reserved_at is
  'Most recent reservation timestamp. Used only to recover a crash before consume/release.';

create or replace function consume_athena_free_identity_ask(
  p_organization_id uuid
)
returns table (
  consumed boolean,
  ignored boolean,
  consumed_count integer,
  reserved_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed integer;
  v_reserved integer;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_identity_ask_consumed_count,
    o.free_identity_ask_reserved_count
    into v_consumed, v_reserved
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if v_reserved <= 0 then
    consumed := false;
    ignored := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  update organizations
  set
    free_identity_ask_reserved_count = v_reserved - 1,
    free_identity_ask_consumed_count = v_consumed + 1,
    free_identity_ask_reserved_at = case
      when v_reserved - 1 = 0 then null
      else free_identity_ask_reserved_at
    end,
    updated_at = now()
  where id = p_organization_id
    and free_identity_ask_reserved_count = v_reserved;

  if not found then
    consumed := false;
    ignored := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  consumed := true;
  ignored := false;
  consumed_count := v_consumed + 1;
  reserved_count := v_reserved - 1;
  return next;
end;
$$;

create or replace function release_athena_free_identity_ask(
  p_organization_id uuid
)
returns table (
  released boolean,
  ignored boolean,
  consumed_count integer,
  reserved_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed integer;
  v_reserved integer;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_identity_ask_consumed_count,
    o.free_identity_ask_reserved_count
    into v_consumed, v_reserved
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if v_reserved <= 0 then
    released := false;
    ignored := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  update organizations
  set
    free_identity_ask_reserved_count = v_reserved - 1,
    free_identity_ask_reserved_at = case
      when v_reserved - 1 = 0 then null
      else free_identity_ask_reserved_at
    end,
    updated_at = now()
  where id = p_organization_id
    and free_identity_ask_reserved_count = v_reserved;

  if not found then
    released := false;
    ignored := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  released := true;
  ignored := false;
  consumed_count := v_consumed;
  reserved_count := v_reserved - 1;
  return next;
end;
$$;

create or replace function reserve_athena_free_identity_ask(
  p_organization_id uuid,
  p_limit integer
)
returns table (
  reserved boolean,
  recovered boolean,
  denied boolean,
  consumed_count integer,
  reserved_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed integer;
  v_reserved integer;
  v_reserved_at timestamptz;
  v_stale interval := interval '2 minutes';
  v_recovered boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'limit required';
  end if;

  select
    o.free_identity_ask_consumed_count,
    o.free_identity_ask_reserved_count,
    o.free_identity_ask_reserved_at
    into v_consumed, v_reserved, v_reserved_at
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if v_reserved > 0
     and (v_reserved_at is null or v_reserved_at <= now() - v_stale) then
    update organizations
    set
      free_identity_ask_reserved_count = 0,
      free_identity_ask_reserved_at = null,
      updated_at = now()
    where id = p_organization_id
      and free_identity_ask_reserved_count = v_reserved;

    v_reserved := 0;
    v_reserved_at := null;
    v_recovered := true;
  end if;

  if v_consumed + v_reserved >= p_limit then
    reserved := false;
    recovered := v_recovered;
    denied := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  update organizations
  set
    free_identity_ask_reserved_count = v_reserved + 1,
    free_identity_ask_reserved_at = now(),
    updated_at = now()
  where id = p_organization_id
    and free_identity_ask_reserved_count = v_reserved
    and free_identity_ask_consumed_count = v_consumed;

  if not found then
    reserved := false;
    recovered := v_recovered;
    denied := true;
    consumed_count := v_consumed;
    reserved_count := v_reserved;
    return next;
    return;
  end if;

  reserved := true;
  recovered := v_recovered;
  denied := false;
  consumed_count := v_consumed;
  reserved_count := v_reserved + 1;
  return next;
end;
$$;

revoke all on function consume_athena_free_identity_ask(uuid) from public;
revoke all on function consume_athena_free_identity_ask(uuid) from anon;
revoke all on function consume_athena_free_identity_ask(uuid) from authenticated;
grant execute on function consume_athena_free_identity_ask(uuid) to service_role;

revoke all on function release_athena_free_identity_ask(uuid) from public;
revoke all on function release_athena_free_identity_ask(uuid) from anon;
revoke all on function release_athena_free_identity_ask(uuid) from authenticated;
grant execute on function release_athena_free_identity_ask(uuid) to service_role;

revoke all on function reserve_athena_free_identity_ask(uuid, integer) from public;
revoke all on function reserve_athena_free_identity_ask(uuid, integer) from anon;
revoke all on function reserve_athena_free_identity_ask(uuid, integer) from authenticated;
grant execute on function reserve_athena_free_identity_ask(uuid, integer) to service_role;

comment on function consume_athena_free_identity_ask(uuid) is
  'Server-only. reserved - 1 / consumed + 1 after a valid non-empty Free Identity Ask reply. Never decrements consumed.';
comment on function release_athena_free_identity_ask(uuid) is
  'Server-only. Releases one in-flight Free Identity Ask reservation. Never decrements consumed.';
comment on function reserve_athena_free_identity_ask(uuid, integer) is
  'Server-only organization-row reservation for Free Identity Ask. Recovers stale crash-window reservations. Never clears consumed.';
