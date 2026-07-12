-- Athena V3.2 — worker leases, atomic claim, and durable follow-up markers.
-- Additive forward migration. Does not modify 20260713000001.

-- ---------------------------------------------------------------------------
-- Lease / ownership columns
-- ---------------------------------------------------------------------------
alter table athena_generation_jobs
  add column if not exists claimed_by text,
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists published_version_id uuid;

comment on column athena_generation_jobs.claimed_by is
  'Worker identity that currently owns the lease.';
comment on column athena_generation_jobs.claim_token is
  'Opaque token required for heartbeat/complete/fail while owning the job.';
comment on column athena_generation_jobs.claim_expires_at is
  'Lease expiry. Expired processing jobs are reclaimable.';
comment on column athena_generation_jobs.published_version_id is
  'Executive Intelligence Version published for this job (idempotency).';
comment on column athena_generation_jobs.next_attempt_at is
  'Earliest time a retryable job may be claimed again.';

-- Backfill published_version_id from existing executive_version_id where present.
update athena_generation_jobs
set published_version_id = executive_version_id
where published_version_id is null
  and executive_version_id is not null;

-- ---------------------------------------------------------------------------
-- Durable follow-up marker on discussions (coalesced reprocess request)
-- ---------------------------------------------------------------------------
alter table discussions
  add column if not exists pending_generation_follow_up boolean not null default false;

comment on column discussions.pending_generation_follow_up is
  'When true, worker must enqueue exactly one follow-up generation job after the active job completes.';

-- ---------------------------------------------------------------------------
-- Indexes for claimable jobs
-- ---------------------------------------------------------------------------
create index if not exists athena_generation_jobs_claimable_idx
  on athena_generation_jobs (status, next_attempt_at, created_at);

create index if not exists athena_generation_jobs_lease_expiry_idx
  on athena_generation_jobs (status, claim_expires_at)
  where status = 'processing';

create index if not exists athena_generation_jobs_regeneration_run_id_idx
  on athena_generation_jobs (regeneration_run_id);

-- Expand active uniqueness to include retryable (prevents duplicate enqueue while waiting).
drop index if exists athena_generation_jobs_one_active_per_discussion;
create unique index if not exists athena_generation_jobs_one_active_per_discussion
  on athena_generation_jobs (discussion_id)
  where status in ('queued', 'processing', 'retryable');

-- ---------------------------------------------------------------------------
-- Atomic claim (FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
create or replace function claim_athena_generation_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
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
  from athena_generation_jobs j
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

  update athena_generation_jobs
  set
    status = 'processing',
    claimed_by = trim(p_worker_id),
    claim_token = p_claim_token,
    claimed_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    heartbeat_at = v_now,
    started_at = coalesce(started_at, v_now),
    attempt_count = attempt_count + 1,
    current_stage = coalesce(nullif(current_stage, 'completed'), 'preparing'),
    updated_at = v_now,
    error_code = null,
    error_message = null
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function claim_athena_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_generation_job(text, uuid, integer) from authenticated;

-- ---------------------------------------------------------------------------
-- Heartbeat / lease renewal (token-gated)
-- ---------------------------------------------------------------------------
create or replace function heartbeat_athena_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_stage text default null,
  p_progress jsonb default null
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update athena_generation_jobs
  set
    heartbeat_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    current_stage = coalesce(p_stage, current_stage),
    progress = coalesce(p_progress, progress),
    updated_at = v_now
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from public;
revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from anon;
revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- Complete job (token-gated)
-- ---------------------------------------------------------------------------
create or replace function complete_athena_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_analysis_id uuid default null,
  p_opportunity_id uuid default null,
  p_review_id uuid default null,
  p_blueprint_id uuid default null,
  p_executive_version_id uuid default null,
  p_published_version_id uuid default null
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
  v_now timestamptz := now();
begin
  update athena_generation_jobs
  set
    status = 'completed',
    current_stage = 'completed',
    analysis_id = coalesce(p_analysis_id, analysis_id),
    opportunity_id = coalesce(p_opportunity_id, opportunity_id),
    review_id = coalesce(p_review_id, review_id),
    blueprint_id = coalesce(p_blueprint_id, blueprint_id),
    executive_version_id = coalesce(p_executive_version_id, executive_version_id),
    published_version_id = coalesce(p_published_version_id, published_version_id, p_executive_version_id, executive_version_id),
    completed_at = v_now,
    updated_at = v_now,
    claim_expires_at = null,
    error_code = null,
    error_message = null
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Fail / retry job (token-gated)
-- ---------------------------------------------------------------------------
create or replace function fail_athena_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_generation_jobs
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

  update athena_generation_jobs
  set
    status = v_status,
    current_stage = coalesce(p_failed_stage, current_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Generation failed'), 1000),
    error_metadata = p_error_metadata,
    next_attempt_at = case
      when v_status = 'retryable' then coalesce(p_next_attempt_at, v_now + interval '30 seconds')
      else null
    end,
    completed_at = case when v_status = 'failed' then v_now else null end,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
