-- Athena V2 FREE-5 — one-time Free starter Daily Social Planner authority.
-- Additive organization product state only. Not a quota table, entitlement
-- engine, or calendar-count heuristic.
-- Do not apply this migration from application code.
--
-- Invariant:
--   A Free starter reservation is organization-scoped.
--   Acquisition is a single-row compare-and-swap on organizations
--   (SELECT ... FOR UPDATE). At most one reserved starter exists.
--   Reservation is acquired BEFORE a second request can create another
--   starter calendar or generation job.
--   Worker retryable failures stay reserved.
--   Ready consumes only when free_starter_calendar_id matches.
--   Terminal Processing Failed releases only that exact reservation.
--   consumed is historical and is never cleared by product plan changes.
--
-- Crash window:
--   reserved + calendar_id IS NULL, or reserved + Queued calendar with no
--   active generation job, after process death before bind/enqueue.
--   Recovery happens only inside reserve_athena_free_starter after
--   free_starter_reserved_at is older than 2 minutes, or immediately when
--   the bound calendar is already Processing Failed.
--   Home page load never acquires, binds, consumes, or releases.

alter table organizations
  add column if not exists free_starter_status text;

alter table organizations
  add column if not exists free_starter_calendar_id uuid;

alter table organizations
  add column if not exists free_starter_reserved_at timestamptz;

alter table organizations
  add column if not exists free_starter_reservation_token uuid;

alter table organizations
  drop constraint if exists organizations_free_starter_status_check;

alter table organizations
  add constraint organizations_free_starter_status_check
  check (
    free_starter_status is null
    or free_starter_status in ('reserved', 'consumed')
  );

alter table organizations
  drop constraint if exists organizations_free_starter_state_check;

alter table organizations
  add constraint organizations_free_starter_state_check
  check (
    (
      free_starter_status is null
      and free_starter_reserved_at is null
      and free_starter_reservation_token is null
    )
    or (
      free_starter_status = 'reserved'
      and free_starter_reserved_at is not null
      and free_starter_reservation_token is not null
    )
    or (
      free_starter_status = 'consumed'
      and free_starter_calendar_id is not null
      and free_starter_reserved_at is null
      and free_starter_reservation_token is null
    )
  );

comment on column organizations.free_starter_status is
  'One-time Free starter Daily authority: null (available), reserved, consumed. Historical consumed is never cleared by plan change.';
comment on column organizations.free_starter_calendar_id is
  'Calendar bound to the current reserved starter, the consumed starter, or the last released failed attempt. Not a count heuristic.';
comment on column organizations.free_starter_reserved_at is
  'Reservation timestamp used only to recover a crash before bind/enqueue. Not a page-load lock.';
comment on column organizations.free_starter_reservation_token is
  'Compare-and-swap token for the active reservation. Bind and unbound release must match it.';

create or replace function consume_athena_free_starter(
  p_organization_id uuid,
  p_calendar_id uuid
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
  v_calendar_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_calendar_id is null then
    raise exception 'calendar_id required';
  end if;

  select o.free_starter_status, o.free_starter_calendar_id
    into v_status, v_calendar_id
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

  if v_status = 'consumed' and v_calendar_id = p_calendar_id then
    consumed := false;
    already := true;
    ignored := false;
    return next;
    return;
  end if;

  if v_status is distinct from 'reserved' or v_calendar_id is distinct from p_calendar_id then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_starter_status = 'consumed',
    free_starter_calendar_id = p_calendar_id,
    free_starter_reserved_at = null,
    free_starter_reservation_token = null,
    updated_at = now()
  where id = p_organization_id
    and free_starter_status = 'reserved'
    and free_starter_calendar_id = p_calendar_id;

  consumed := found;
  already := false;
  ignored := not found;
  return next;
end;
$$;

create or replace function release_athena_free_starter(
  p_organization_id uuid,
  p_calendar_id uuid default null,
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
  v_calendar_id uuid;
  v_token uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_starter_status,
    o.free_starter_calendar_id,
    o.free_starter_reservation_token
    into v_status, v_calendar_id, v_token
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
    (p_calendar_id is not null and v_calendar_id = p_calendar_id)
    or (
      v_calendar_id is null
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
    free_starter_status = null,
    free_starter_reserved_at = null,
    free_starter_reservation_token = null,
    free_starter_calendar_id = coalesce(p_calendar_id, v_calendar_id),
    updated_at = now()
  where id = p_organization_id
    and free_starter_status = 'reserved';

  released := found;
  ignored := not found;
  return next;
end;
$$;

create or replace function bind_athena_free_starter_calendar(
  p_organization_id uuid,
  p_reservation_token uuid,
  p_calendar_id uuid
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

  if p_calendar_id is null then
    raise exception 'calendar_id required';
  end if;

  perform 1
  from organizations o
  where o.id = p_organization_id
  for update;

  update organizations
  set
    free_starter_calendar_id = p_calendar_id,
    updated_at = now()
  where id = p_organization_id
    and free_starter_status = 'reserved'
    and free_starter_reservation_token = p_reservation_token
    and free_starter_calendar_id is null;

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

create or replace function reserve_athena_free_starter(
  p_organization_id uuid
)
returns table (
  reserved boolean,
  recovered boolean,
  already_reserved boolean,
  already_consumed boolean,
  reservation_token uuid,
  calendar_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_calendar_id uuid;
  v_reserved_at timestamptz;
  v_token uuid;
  v_calendar_status text;
  v_has_active_job boolean := false;
  v_stale interval := interval '2 minutes';
  v_can_recover boolean := false;
  v_new_token uuid := gen_random_uuid();
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_starter_status,
    o.free_starter_calendar_id,
    o.free_starter_reserved_at,
    o.free_starter_reservation_token
    into v_status, v_calendar_id, v_reserved_at, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := false;
    reservation_token := null;
    calendar_id := null;
    return next;
    return;
  end if;

  if v_status = 'consumed' then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    calendar_id := v_calendar_id;
    return next;
    return;
  end if;

  if v_status = 'reserved' then
    if v_calendar_id is not null then
      select c.status
        into v_calendar_status
      from athena_social_calendars c
      where c.id = v_calendar_id
        and c.organization_id = p_organization_id;

      if v_calendar_status = 'Ready' then
        perform consume_athena_free_starter(p_organization_id, v_calendar_id);
        reserved := false;
        recovered := false;
        already_reserved := false;
        already_consumed := true;
        reservation_token := null;
        calendar_id := v_calendar_id;
        return next;
        return;
      end if;

      select exists(
        select 1
        from athena_social_calendar_generation_jobs j
        where j.organization_id = p_organization_id
          and j.calendar_id = v_calendar_id
          and j.status in ('queued', 'processing', 'retryable')
      ) into v_has_active_job;
    end if;

    v_can_recover :=
      v_calendar_status = 'Processing Failed'
      or (
        v_calendar_id is null
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      )
      or (
        v_calendar_id is not null
        and not v_has_active_job
        and v_calendar_status is distinct from 'Ready'
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      );

    if not v_can_recover then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      calendar_id := v_calendar_id;
      return next;
      return;
    end if;
  end if;

  update organizations
  set
    free_starter_status = 'reserved',
    free_starter_calendar_id = null,
    free_starter_reserved_at = now(),
    free_starter_reservation_token = v_new_token,
    updated_at = now()
  where id = p_organization_id
    and (
      free_starter_status is null
      or free_starter_status = 'reserved'
    )
    and free_starter_status is distinct from 'consumed';

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    calendar_id := v_calendar_id;
    return next;
    return;
  end if;

  reserved := true;
  recovered := v_status = 'reserved';
  already_reserved := false;
  already_consumed := false;
  reservation_token := v_new_token;
  calendar_id := null;
  return next;
end;
$$;

revoke all on function consume_athena_free_starter(uuid, uuid) from public;
revoke all on function consume_athena_free_starter(uuid, uuid) from anon;
revoke all on function consume_athena_free_starter(uuid, uuid) from authenticated;
grant execute on function consume_athena_free_starter(uuid, uuid) to service_role;

revoke all on function release_athena_free_starter(uuid, uuid, uuid) from public;
revoke all on function release_athena_free_starter(uuid, uuid, uuid) from anon;
revoke all on function release_athena_free_starter(uuid, uuid, uuid) from authenticated;
grant execute on function release_athena_free_starter(uuid, uuid, uuid) to service_role;

revoke all on function bind_athena_free_starter_calendar(uuid, uuid, uuid) from public;
revoke all on function bind_athena_free_starter_calendar(uuid, uuid, uuid) from anon;
revoke all on function bind_athena_free_starter_calendar(uuid, uuid, uuid) from authenticated;
grant execute on function bind_athena_free_starter_calendar(uuid, uuid, uuid) to service_role;

revoke all on function reserve_athena_free_starter(uuid) from public;
revoke all on function reserve_athena_free_starter(uuid) from anon;
revoke all on function reserve_athena_free_starter(uuid) from authenticated;
grant execute on function reserve_athena_free_starter(uuid) to service_role;

comment on function consume_athena_free_starter(uuid, uuid) is
  'Server-only. reserved -> consumed only when free_starter_calendar_id matches. Never clears consumed.';
comment on function release_athena_free_starter(uuid, uuid, uuid) is
  'Server-only. Releases reserved only for the matching calendar or unbound reservation token.';
comment on function bind_athena_free_starter_calendar(uuid, uuid, uuid) is
  'Server-only. Binds a newly created Daily calendar to the exact reservation token.';
comment on function reserve_athena_free_starter(uuid) is
  'Server-only compare-and-swap Free starter reservation. Recovers stale crash-window reservations. Never clears consumed.';

create or replace function complete_athena_social_calendar_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_package_json jsonb,
  p_calendar_context_json jsonb,
  p_provenance_json jsonb
)
returns athena_social_calendar_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_social_calendar_generation_jobs;
  v_now timestamptz := now();
begin
  if p_package_json is null then
    raise exception 'package_json required';
  end if;

  if p_calendar_context_json is null
     or jsonb_typeof(p_calendar_context_json) <> 'object' then
    raise exception 'calendar_context_json required object';
  end if;

  if p_provenance_json is null
     or jsonb_typeof(p_provenance_json) <> 'object' then
    raise exception 'provenance_json required object';
  end if;

  update athena_social_calendar_generation_jobs
  set
    status = 'completed',
    generation_stage = 'completed',
    completed_at = v_now,
    updated_at = v_now,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    heartbeat_at = null,
    error_code = null,
    error_message = null
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  if not found then
    return null;
  end if;

  -- Ready packages, period, guidance, lineage, and provenance snapshots are
  -- immutable. Stale-job reconciliation may complete, but must never replace
  -- a Ready package or frozen provenance / calendar context.
  update athena_social_calendars
  set
    status = 'Ready',
    generation_stage = 'completed',
    package_json = case
      when status = 'Ready' and package_json is not null then package_json
      else p_package_json
    end,
    calendar_context_json = case
      when status = 'Ready' and package_json is not null then calendar_context_json
      else p_calendar_context_json
    end,
    provenance_json = case
      when status = 'Ready' and package_json is not null then provenance_json
      else p_provenance_json
    end,
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.calendar_id;

  -- Free starter consumption is a no-op unless this calendar is the reserved starter.
  perform consume_athena_free_starter(v_job.organization_id, v_job.calendar_id);

  return v_job;
end;
$$;

revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function fail_athena_social_calendar_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_social_calendar_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_social_calendar_generation_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_social_calendar_generation_jobs
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  for update;

  if not found then
    return null;
  end if;

  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_status := 'retryable';
  else
    v_status := 'failed';
  end if;

  update athena_social_calendar_generation_jobs
  set
    status = v_status,
    generation_stage = coalesce(p_failed_stage, generation_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Social Calendar generation failed'), 1000),
    error_metadata = p_error_metadata,
    next_attempt_at = case
      when v_status = 'retryable' then coalesce(p_next_attempt_at, v_now + interval '30 seconds')
      else null
    end,
    completed_at = case when v_status = 'failed' then v_now else null end,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    heartbeat_at = null,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  if v_status = 'failed' then
    -- Never demote or clear a Ready Social Calendar (Ready packages are immutable).
    update athena_social_calendars
    set
      status = 'Processing Failed',
      generation_stage = 'failed',
      package_json = null,
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.calendar_id
      and status is distinct from 'Ready';

    perform release_athena_free_starter(
      v_job.organization_id,
      v_job.calendar_id,
      null
    );
  else
    -- retryable: keep calendar Processing so clients continue polling
    update athena_social_calendars
    set
      status = 'Processing',
      generation_stage = coalesce(p_failed_stage, generation_stage),
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.calendar_id
      and status is distinct from 'Ready';
  end if;

  return v_job;
end;
$$;

revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;
