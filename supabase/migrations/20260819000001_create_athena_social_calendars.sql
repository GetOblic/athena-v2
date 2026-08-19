-- Athena V29 L1 — Social Calendar persistence foundation + durable generation jobs.
-- Additive only. Does not alter Ads, SEO, Estimate, Deep Scrape, Discussion,
-- Prospect, Persona, Blueprint, or GetOblic Links contracts.
-- Social Calendars are ordinary organization-owned historical artifacts.
-- One embedded seven-day package per calendar — not seven athena_asset_blueprints rows.
-- Ask Athena messages are deferred (L9). TENANT_TABLES registration is deferred to APIs.

-- ---------------------------------------------------------------------------
-- athena_social_calendars
-- ---------------------------------------------------------------------------
create table if not exists athena_social_calendars (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  user_id uuid
    references auth.users(id) on delete set null,

  period_start date not null,
  period_end date not null,

  user_guidance text,
  generation_mode text not null default 'standard',

  source_calendar_id uuid
    references athena_social_calendars(id) on delete restrict,
  root_calendar_id uuid
    references athena_social_calendars(id) on delete restrict,
  version_number integer not null default 1,

  status text not null
    check (status in ('Queued', 'Processing', 'Ready', 'Processing Failed')),

  generation_stage text,

  package_json jsonb,

  provenance_json jsonb not null default '{}'::jsonb,
  calendar_context_json jsonb not null default '{}'::jsonb,

  error_code text,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_social_calendars_period_seven_days_chk
    check (period_end = (period_start + 6)),

  constraint athena_social_calendars_user_guidance_chk
    check (
      user_guidance is null
      or (
        user_guidance = btrim(user_guidance)
        and char_length(user_guidance) >= 1
        and char_length(user_guidance) <= 4000
      )
    ),

  constraint athena_social_calendars_generation_mode_chk
    check (
      generation_mode in (
        'standard',
        'think_differently',
        'conversation_revision'
      )
    ),

  constraint athena_social_calendars_version_positive_chk
    check (version_number >= 1),

  constraint athena_social_calendars_lineage_pair_chk
    check (
      (source_calendar_id is null and root_calendar_id is null)
      or (source_calendar_id is not null and root_calendar_id is not null)
    ),

  constraint athena_social_calendars_derivative_source_chk
    check (
      generation_mode = 'standard'
      or source_calendar_id is not null
    ),

  constraint athena_social_calendars_provenance_object_chk
    check (jsonb_typeof(provenance_json) = 'object'),

  constraint athena_social_calendars_calendar_context_object_chk
    check (jsonb_typeof(calendar_context_json) = 'object')
);

create index if not exists athena_social_calendars_org_created_idx
  on athena_social_calendars (organization_id, created_at desc);

create index if not exists athena_social_calendars_source_idx
  on athena_social_calendars (source_calendar_id)
  where source_calendar_id is not null;

create index if not exists athena_social_calendars_root_version_idx
  on athena_social_calendars (root_calendar_id, version_number)
  where root_calendar_id is not null;

create unique index if not exists athena_social_calendars_root_version_unique
  on athena_social_calendars (root_calendar_id, version_number)
  where root_calendar_id is not null;

comment on table athena_social_calendars is
  'Organization-owned Social Calendar artifacts. Each row is one generated seven-day package. Ready rows are historical; regenerate / Think Differently / revision create a new row.';
comment on column athena_social_calendars.organization_id is
  'Trusted organization owner. Social Calendars are organization-scoped, never discussion-scoped or Licensee-owned.';
comment on column athena_social_calendars.period_start is
  'Inclusive first calendar date of the selected seven-day period. Date type — not inferred from created_at.';
comment on column athena_social_calendars.period_end is
  'Inclusive last calendar date. Invariant: period_end = period_start + 6.';
comment on column athena_social_calendars.user_guidance is
  'Optional generation-time operator direction. Frozen with the request. Null means no guidance.';
comment on column athena_social_calendars.generation_mode is
  'standard | think_differently | conversation_revision';
comment on column athena_social_calendars.source_calendar_id is
  'Immediate source calendar for Think Differently / revision / future lineage. ON DELETE RESTRICT so removing a derivative cannot drop the source.';
comment on column athena_social_calendars.root_calendar_id is
  'Original calendar in the lineage family. Null on originals. ON DELETE RESTRICT preserves historical families.';
comment on column athena_social_calendars.version_number is
  'Lineage version within a root family. Originals default to 1; descendants increment per family.';
comment on column athena_social_calendars.package_json is
  'Complete generated seven-day package. Present only when status is Ready. Immutable once Ready. Shape finalized in L4.';
comment on column athena_social_calendars.provenance_json is
  'Compact generation provenance envelope. Empty object until later layers populate it. Immutable once Ready.';
comment on column athena_social_calendars.calendar_context_json is
  'Frozen generation-time calendar / geography jurisdiction snapshot. Empty object until L2. Immutable once Ready.';
comment on column athena_social_calendars.status is
  'Queued | Processing | Ready | Processing Failed';

-- ---------------------------------------------------------------------------
-- athena_social_calendar_generation_jobs
-- ---------------------------------------------------------------------------
create table if not exists athena_social_calendar_generation_jobs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,
  calendar_id uuid not null
    references athena_social_calendars(id) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'retryable')),

  generation_stage text,

  attempt_count integer not null default 0
    check (attempt_count >= 0),
  max_attempts integer not null default 3
    check (max_attempts >= 1),

  claimed_by text,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  heartbeat_at timestamptz,
  next_attempt_at timestamptz,

  error_code text,
  error_message text,
  error_metadata jsonb,

  requested_by uuid
    references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_social_calendar_generation_jobs_org_idx
  on athena_social_calendar_generation_jobs (organization_id);

create index if not exists athena_social_calendar_generation_jobs_calendar_idx
  on athena_social_calendar_generation_jobs (calendar_id, created_at desc);

create index if not exists athena_social_calendar_generation_jobs_claimable_idx
  on athena_social_calendar_generation_jobs (status, next_attempt_at, created_at);

create index if not exists athena_social_calendar_generation_jobs_lease_idx
  on athena_social_calendar_generation_jobs (status, claim_expires_at)
  where status = 'processing';

-- One active Social Calendar generation job per calendar
create unique index if not exists athena_social_calendar_generation_jobs_one_active_calendar
  on athena_social_calendar_generation_jobs (calendar_id)
  where status in ('queued', 'processing', 'retryable');

comment on table athena_social_calendar_generation_jobs is
  'Durable organization-level Social Calendar generation jobs. Independent of athena_generation_jobs, Ads, SEO, Estimate, and deep scrape jobs.';

-- ---------------------------------------------------------------------------
-- Claim / heartbeat / complete / fail RPCs (service-role only)
-- Mirrors Ads/SEO lease semantics. Ready-immutability guards follow Estimate.
-- ---------------------------------------------------------------------------
create or replace function claim_athena_social_calendar_generation_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_social_calendar_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_social_calendar_generation_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker_id required';
  end if;

  if p_claim_token is null then
    raise exception 'claim_token required';
  end if;

  select j.*
  into v_job
  from athena_social_calendar_generation_jobs j
  where
    (
      j.status = 'queued'
      or (
        j.status = 'retryable'
        and (j.next_attempt_at is null or j.next_attempt_at <= v_now)
      )
      or (
        j.status = 'processing'
        and j.claim_expires_at is not null
        and j.claim_expires_at < v_now
      )
    )
  order by j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update athena_social_calendar_generation_jobs
  set
    status = 'processing',
    claimed_by = trim(p_worker_id),
    claim_token = p_claim_token,
    claimed_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    heartbeat_at = v_now,
    started_at = coalesce(started_at, v_now),
    attempt_count = attempt_count + 1,
    generation_stage = case
      when generation_stage is null or generation_stage in ('completed', 'failed')
        then 'assembling_context'
      else generation_stage
    end,
    updated_at = v_now,
    error_code = null,
    error_message = null
  where id = v_job.id
  returning * into v_job;

  -- Ready Social Calendars are immutable. Claiming a stale job must not demote Ready
  -- or hide package_json / provenance / calendar context from the executor.
  update athena_social_calendars
  set
    status = 'Processing',
    generation_stage = coalesce(v_job.generation_stage, 'assembling_context'),
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.calendar_id
    and status is distinct from 'Ready';

  return v_job;
end;
$$;

revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_social_calendar_generation_job(text, uuid, integer) to service_role;

create or replace function heartbeat_athena_social_calendar_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_stage text default null
)
returns athena_social_calendar_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_social_calendar_generation_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update athena_social_calendar_generation_jobs
  set
    heartbeat_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    generation_stage = coalesce(p_stage, generation_stage),
    updated_at = v_now
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  if found then
    -- Never demote a Ready Social Calendar while a stale claim still heartbeats.
    update athena_social_calendars
    set
      generation_stage = coalesce(p_stage, generation_stage),
      status = 'Processing',
      updated_at = v_now
    where id = v_job.calendar_id
      and status is distinct from 'Ready';
  end if;

  return v_job;
end;
$$;

revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) to service_role;

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
