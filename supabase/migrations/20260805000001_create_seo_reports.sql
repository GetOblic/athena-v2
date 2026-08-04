-- Athena V19 — Organization-level SEO Intelligence reports + durable SEO generation jobs.
-- Additive only. Does not alter existing tables, job contracts, or foreign keys.
-- SEO reports belong to organizations; never to discussions, prospects, personas, or executive versions.
-- Does not alter Website Deep Scrape, Ads, Brain, Personas, Discussions, or Opportunities.

-- ---------------------------------------------------------------------------
-- seo_reports
-- ---------------------------------------------------------------------------
create table if not exists seo_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  brief_json jsonb not null default '{}'::jsonb,
  status text not null
    check (status in ('Queued', 'Processing', 'Ready', 'Processing Failed')),
  generation_stage text,
  package_json jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_reports_org_created_idx
  on seo_reports (organization_id, created_at desc);

create index if not exists seo_reports_org_status_idx
  on seo_reports (organization_id, status);

comment on table seo_reports is
  'Organization-level SEO Intelligence reports. Owned by organization only — not discussions, prospects, personas, or executive versions.';
comment on column seo_reports.organization_id is
  'Trusted organization owner. SEO reports are organization-scoped, never discussion-scoped.';
comment on column seo_reports.brief_json is
  'Optional operator guidance. Empty object means inferred SEO report mode.';
comment on column seo_reports.package_json is
  'Complete validated SeoIntelligencePackage. Present only when status is Ready.';
comment on column seo_reports.status is
  'Queued | Processing | Ready | Processing Failed';

-- ---------------------------------------------------------------------------
-- athena_seo_generation_jobs
-- ---------------------------------------------------------------------------
create table if not exists athena_seo_generation_jobs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references organizations(id) on delete cascade,
  report_id uuid not null references seo_reports(id) on delete cascade,

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

  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_seo_generation_jobs_org_idx
  on athena_seo_generation_jobs (organization_id);

create index if not exists athena_seo_generation_jobs_report_idx
  on athena_seo_generation_jobs (report_id, created_at desc);

create index if not exists athena_seo_generation_jobs_claimable_idx
  on athena_seo_generation_jobs (status, next_attempt_at, created_at);

create index if not exists athena_seo_generation_jobs_lease_idx
  on athena_seo_generation_jobs (status, claim_expires_at)
  where status = 'processing';

-- One active SEO generation job per report
create unique index if not exists athena_seo_generation_jobs_one_active_report
  on athena_seo_generation_jobs (report_id)
  where status in ('queued', 'processing', 'retryable');

comment on table athena_seo_generation_jobs is
  'Durable organization-level SEO Intelligence generation jobs. Independent of athena_generation_jobs, Ads jobs, and deep scrape jobs.';

-- ---------------------------------------------------------------------------
-- Claim / heartbeat / complete / fail RPCs (service-role only)
-- ---------------------------------------------------------------------------
create or replace function claim_athena_seo_generation_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_seo_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_seo_generation_jobs;
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
  from athena_seo_generation_jobs j
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

  update athena_seo_generation_jobs
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

  -- Mirror report processing state (organization-scoped via report FK)
  update seo_reports
  set
    status = 'Processing',
    generation_stage = coalesce(v_job.generation_stage, 'assembling_context'),
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.report_id;

  return v_job;
end;
$$;

revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from authenticated;

create or replace function heartbeat_athena_seo_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_stage text default null
)
returns athena_seo_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_seo_generation_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update athena_seo_generation_jobs
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
    update seo_reports
    set
      generation_stage = coalesce(p_stage, generation_stage),
      status = 'Processing',
      updated_at = v_now
    where id = v_job.report_id;
  end if;

  return v_job;
end;
$$;

revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from authenticated;

create or replace function complete_athena_seo_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_package_json jsonb
)
returns athena_seo_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_seo_generation_jobs;
  v_now timestamptz := now();
  v_campaign_name text;
begin
  if p_package_json is null then
    raise exception 'package_json required';
  end if;

  update athena_seo_generation_jobs
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

  v_campaign_name := nullif(
    trim(coalesce(p_package_json->>'reportName', '')),
    ''
  );

  update seo_reports
  set
    status = 'Ready',
    generation_stage = 'completed',
    package_json = p_package_json,
    name = coalesce(v_campaign_name, name),
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.report_id;

  return v_job;
end;
$$;

revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from public;
revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from anon;
revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from authenticated;

create or replace function fail_athena_seo_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_seo_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_seo_generation_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_seo_generation_jobs
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

  update athena_seo_generation_jobs
  set
    status = v_status,
    generation_stage = coalesce(p_failed_stage, generation_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'SEO generation failed'), 1000),
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
    update seo_reports
    set
      status = 'Processing Failed',
      generation_stage = 'failed',
      package_json = null,
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.report_id;
  else
    -- retryable: keep campaign Processing so UI continues polling
    update seo_reports
    set
      status = 'Processing',
      generation_stage = coalesce(p_failed_stage, generation_stage),
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.report_id;
  end if;

  return v_job;
end;
$$;

revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
