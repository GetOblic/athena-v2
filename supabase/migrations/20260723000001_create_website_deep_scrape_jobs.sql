-- Athena V6 — independent Deep Website Scrape durable jobs.
-- Additive. Does not alter Executive Versions or Master Profile schema.
-- Does NOT execute homepage learning during Train Athena / Prospect import / Refresh.

-- ---------------------------------------------------------------------------
-- Brain: structured Deep Website Intelligence (keep homepage_learning compat)
-- ---------------------------------------------------------------------------
alter table athena_identity
  add column if not exists website_intelligence jsonb,
  add column if not exists last_deep_scrape_at timestamptz,
  add column if not exists last_deep_scrape_pages integer;

comment on column athena_identity.website_intelligence is
  'Structured Deep Website Intelligence from autonomous deep scrape. Separate from master_profile.homepage_learning.';
comment on column athena_identity.last_deep_scrape_at is
  'Timestamp of last successfully completed deep scrape (Phase A+B).';
comment on column athena_identity.last_deep_scrape_pages is
  'Meaningful pages analyzed in the last successful deep scrape.';

-- ---------------------------------------------------------------------------
-- Prospect follow-on trigger (semantic; same full pipeline as manual_refresh)
-- Additive constraint replacement: preserve historical trigger values that may
-- already exist in production (including rolled-back partial-refresh types)
-- while adding prospect_deep_scrape. Does not rewrite historical job rows.
-- ---------------------------------------------------------------------------
alter table athena_generation_jobs
  drop constraint if exists athena_generation_jobs_trigger_type_check;

alter table athena_generation_jobs
  add constraint athena_generation_jobs_trigger_type_check
  check (
    trigger_type in (
      'manual_refresh',
      'discussion_import',
      'discussion_update',
      'deployment_assets_refresh',
      'strategic_assets_refresh',
      'prospect_deep_scrape'
    )
  );

-- ---------------------------------------------------------------------------
-- Deep scrape jobs
-- ---------------------------------------------------------------------------
create table if not exists athena_website_deep_scrape_jobs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references organizations(id) on delete cascade,
  source_type text not null
    check (source_type in ('brain', 'prospect')),

  identity_id uuid references athena_identity(id) on delete cascade,
  prospect_id uuid references prospects(id) on delete cascade,
  discussion_id uuid references discussions(id) on delete set null,

  root_url text not null,
  normalized_domain text not null,

  status text not null default 'queued'
    check (status in ('queued', 'processing', 'awaiting_follow_on', 'completed', 'failed', 'retryable')),

  current_stage text not null default 'queued'
    check (
      current_stage in (
        'queued',
        'discovering',
        'crawling',
        'synthesizing',
        'persisting',
        'retraining',
        'regenerating',
        'completed',
        'failed'
      )
    ),

  progress jsonb not null default '{}'::jsonb,
  crawl_result jsonb,
  crawl_summary jsonb,

  pages_discovered integer not null default 0
    check (pages_discovered >= 0),
  pages_crawled integer not null default 0
    check (pages_crawled >= 0),
  pages_analyzed integer not null default 0
    check (pages_analyzed >= 0),

  promoted_at timestamptz,
  follow_on_generation_job_id uuid references athena_generation_jobs(id) on delete set null,
  result_executive_version_id uuid,
  brain_retrained_at timestamptz,

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
  updated_at timestamptz not null default now(),

  constraint athena_website_deep_scrape_jobs_source_ck check (
    (source_type = 'brain' and identity_id is not null and prospect_id is null)
    or
    (source_type = 'prospect' and prospect_id is not null and identity_id is null)
  )
);

create index if not exists athena_website_deep_scrape_jobs_org_idx
  on athena_website_deep_scrape_jobs (organization_id);

create index if not exists athena_website_deep_scrape_jobs_claimable_idx
  on athena_website_deep_scrape_jobs (status, next_attempt_at, created_at);

create index if not exists athena_website_deep_scrape_jobs_lease_idx
  on athena_website_deep_scrape_jobs (status, claim_expires_at)
  where status = 'processing';

create index if not exists athena_website_deep_scrape_jobs_identity_idx
  on athena_website_deep_scrape_jobs (identity_id, created_at desc)
  where identity_id is not null;

create index if not exists athena_website_deep_scrape_jobs_prospect_idx
  on athena_website_deep_scrape_jobs (prospect_id, created_at desc)
  where prospect_id is not null;

-- One active deep-scrape job per Brain identity
create unique index if not exists athena_website_deep_scrape_jobs_one_active_brain
  on athena_website_deep_scrape_jobs (identity_id)
  where source_type = 'brain'
    and identity_id is not null
    and status in ('queued', 'processing', 'awaiting_follow_on', 'retryable');

-- One active deep-scrape job per Prospect
create unique index if not exists athena_website_deep_scrape_jobs_one_active_prospect
  on athena_website_deep_scrape_jobs (prospect_id)
  where source_type = 'prospect'
    and prospect_id is not null
    and status in ('queued', 'processing', 'awaiting_follow_on', 'retryable');

comment on table athena_website_deep_scrape_jobs is
  'Independent durable Deep Website Scrape jobs (Phase A crawl + Phase B Brain retrain / Prospect generation).';

-- ---------------------------------------------------------------------------
-- Claim / heartbeat / complete / fail RPCs
-- ---------------------------------------------------------------------------
create or replace function claim_athena_website_deep_scrape_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_website_deep_scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_website_deep_scrape_jobs;
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
  from athena_website_deep_scrape_jobs j
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

  update athena_website_deep_scrape_jobs
  set
    status = 'processing',
    claimed_by = trim(p_worker_id),
    claim_token = p_claim_token,
    claimed_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    heartbeat_at = v_now,
    started_at = coalesce(started_at, v_now),
    attempt_count = attempt_count + 1,
    current_stage = case
      when promoted_at is not null and source_type = 'brain' then 'retraining'
      when promoted_at is not null and source_type = 'prospect' then 'regenerating'
      when current_stage in ('completed', 'failed') then 'discovering'
      when current_stage = 'queued' then 'discovering'
      else current_stage
    end,
    updated_at = v_now,
    error_code = null,
    error_message = null
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from public;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from anon;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from authenticated;

create or replace function heartbeat_athena_website_deep_scrape_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_stage text default null,
  p_progress jsonb default null
)
returns athena_website_deep_scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_website_deep_scrape_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update athena_website_deep_scrape_jobs
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

revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from public;
revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from anon;
revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from authenticated;

create or replace function complete_athena_website_deep_scrape_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_pages_analyzed integer default null,
  p_result_executive_version_id uuid default null,
  p_brain_retrained_at timestamptz default null,
  p_crawl_summary jsonb default null
)
returns athena_website_deep_scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_website_deep_scrape_jobs;
  v_now timestamptz := now();
begin
  update athena_website_deep_scrape_jobs
  set
    status = 'completed',
    current_stage = 'completed',
    pages_analyzed = coalesce(p_pages_analyzed, pages_analyzed),
    result_executive_version_id = coalesce(p_result_executive_version_id, result_executive_version_id),
    brain_retrained_at = coalesce(p_brain_retrained_at, brain_retrained_at),
    crawl_summary = coalesce(p_crawl_summary, crawl_summary),
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

revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from public;
revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from anon;
revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from authenticated;

create or replace function fail_athena_website_deep_scrape_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_website_deep_scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_website_deep_scrape_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_website_deep_scrape_jobs
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

  update athena_website_deep_scrape_jobs
  set
    status = v_status,
    current_stage = coalesce(p_failed_stage, current_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Deep scrape failed'), 1000),
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

revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
