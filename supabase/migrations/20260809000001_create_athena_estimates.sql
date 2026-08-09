-- Athena V26 L1 — Athena Estimate persistence foundation + durable generation jobs.
-- Additive only. Does not alter SEO/Ads/Deep Scrape/Discussion job contracts.
-- Estimates are Licensee-account scoped historical records with organization snapshots.
-- No FK to licensee_sub_accounts — relationship removal must not delete Estimate history.
-- Service-role control-plane lockdown: RLS enabled, no anon/authenticated table access.

-- ---------------------------------------------------------------------------
-- athena_estimates
-- ---------------------------------------------------------------------------
create table if not exists athena_estimates (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete restrict,

  requested_by uuid
    references auth.users(id) on delete set null,

  organization_name_snapshot text not null,

  request_json jsonb not null,

  status text not null
    check (status in ('Queued', 'Processing', 'Ready', 'Processing Failed')),

  generation_stage text,

  package_json jsonb,

  error_code text,
  error_message text,

  currency_code text,
  geography_label text,

  currency_resolution text
    check (
      currency_resolution is null
      or currency_resolution in ('derived', 'fallback')
    ),

  instruction_config_key text,
  instruction_revision_id uuid,
  instruction_configured boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_estimates_licensee_created_idx
  on athena_estimates (licensee_account_id, created_at desc);

create index if not exists athena_estimates_licensee_org_created_idx
  on athena_estimates (licensee_account_id, organization_id, created_at desc);

create index if not exists athena_estimates_licensee_status_idx
  on athena_estimates (licensee_account_id, status);

-- Operational index only — organization_id never implies Estimate authority.
create index if not exists athena_estimates_organization_id_idx
  on athena_estimates (organization_id);

comment on table athena_estimates is
  'V26 Athena Estimate historical records. Licensee-account scoped; organization_id is operational context only and never implies authority.';
comment on column athena_estimates.licensee_account_id is
  'Owning Licensee Master account. Cascade deletes Estimates when the Licensee account is removed.';
comment on column athena_estimates.organization_id is
  'Operational organization reference. ON DELETE RESTRICT preserves Estimate history; never use as sole authorization.';
comment on column athena_estimates.organization_name_snapshot is
  'Frozen organization display name at request time. Survives org rename or sub-account disconnect.';
comment on column athena_estimates.request_json is
  'Validated EstimateRequest JSON. Immutable once status is Ready.';
comment on column athena_estimates.package_json is
  'Complete validated AthenaEstimatePackage. Present only when status is Ready. Immutable once Ready.';
comment on column athena_estimates.status is
  'Queued | Processing | Ready | Processing Failed';
comment on column athena_estimates.currency_resolution is
  'derived | fallback | null (null before Ready package denormalization)';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_estimates enable row level security;

revoke all on table athena_estimates from public;
revoke all on table athena_estimates from anon;
revoke all on table athena_estimates from authenticated;

grant all on table athena_estimates to service_role;

-- ---------------------------------------------------------------------------
-- athena_estimate_generation_jobs
-- ---------------------------------------------------------------------------
create table if not exists athena_estimate_generation_jobs (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete restrict,

  estimate_id uuid not null
    references athena_estimates(id) on delete cascade,

  requested_by uuid
    references auth.users(id) on delete set null,

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

  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_estimate_generation_jobs_licensee_idx
  on athena_estimate_generation_jobs (licensee_account_id);

create index if not exists athena_estimate_generation_jobs_org_idx
  on athena_estimate_generation_jobs (organization_id);

create index if not exists athena_estimate_generation_jobs_estimate_idx
  on athena_estimate_generation_jobs (estimate_id, created_at desc);

create index if not exists athena_estimate_generation_jobs_claimable_idx
  on athena_estimate_generation_jobs (status, next_attempt_at, created_at);

create index if not exists athena_estimate_generation_jobs_lease_idx
  on athena_estimate_generation_jobs (status, claim_expires_at)
  where status = 'processing';

-- One active Estimate generation job per estimate
create unique index if not exists athena_estimate_generation_jobs_one_active_estimate
  on athena_estimate_generation_jobs (estimate_id)
  where status in ('queued', 'processing', 'retryable');

comment on table athena_estimate_generation_jobs is
  'Durable Licensee Estimate generation jobs. Mirrors SEO/Ads lease semantics; independent of athena_generation_jobs, SEO, Ads, and deep scrape jobs.';

alter table athena_estimate_generation_jobs enable row level security;

revoke all on table athena_estimate_generation_jobs from public;
revoke all on table athena_estimate_generation_jobs from anon;
revoke all on table athena_estimate_generation_jobs from authenticated;

grant all on table athena_estimate_generation_jobs to service_role;

-- ---------------------------------------------------------------------------
-- Claim / heartbeat / complete / fail RPCs (service-role only)
-- Mirrors claim_athena_seo_generation_job / ad equivalents — do not redesign leases.
-- ---------------------------------------------------------------------------
create or replace function claim_athena_estimate_generation_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_estimate_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_estimate_generation_jobs;
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
  from athena_estimate_generation_jobs j
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

  update athena_estimate_generation_jobs
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

  -- Ready Estimates are immutable. Claiming a stale job must not demote Ready
  -- or hide package_json from the executor Ready short-circuit.
  update athena_estimates
  set
    status = 'Processing',
    generation_stage = coalesce(v_job.generation_stage, 'assembling_context'),
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.estimate_id
    and status is distinct from 'Ready';

  return v_job;
end;
$$;

revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_estimate_generation_job(text, uuid, integer) to service_role;

create or replace function heartbeat_athena_estimate_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_stage text default null
)
returns athena_estimate_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_estimate_generation_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update athena_estimate_generation_jobs
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
    -- Never demote a Ready Estimate while a stale claim still heartbeats.
    update athena_estimates
    set
      generation_stage = coalesce(p_stage, generation_stage),
      status = 'Processing',
      updated_at = v_now
    where id = v_job.estimate_id
      and status is distinct from 'Ready';
  end if;

  return v_job;
end;
$$;

revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) to service_role;

create or replace function complete_athena_estimate_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_package_json jsonb
)
returns athena_estimate_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_estimate_generation_jobs;
  v_now timestamptz := now();
  v_currency_code text;
  v_geography_label text;
  v_currency_resolution text;
  v_instruction_config_key text;
  v_instruction_revision_id uuid;
  v_instruction_configured boolean;
begin
  if p_package_json is null then
    raise exception 'package_json required';
  end if;

  update athena_estimate_generation_jobs
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

  v_currency_code := nullif(
    trim(coalesce(p_package_json->'recommendedClientPrice'->>'currencyCode', '')),
    ''
  );

  if jsonb_typeof(p_package_json->'geographyLabel') = 'string' then
    v_geography_label := nullif(trim(p_package_json->>'geographyLabel'), '');
  else
    v_geography_label := null;
  end if;

  if p_package_json->>'currencyResolution' in ('derived', 'fallback') then
    v_currency_resolution := p_package_json->>'currencyResolution';
  else
    v_currency_resolution := null;
  end if;

  v_instruction_config_key := nullif(
    trim(coalesce(p_package_json->'instructionProvenance'->>'configKey', '')),
    ''
  );

  begin
    v_instruction_revision_id := nullif(
      trim(coalesce(p_package_json->'instructionProvenance'->>'revisionId', '')),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      v_instruction_revision_id := null;
  end;

  v_instruction_configured := coalesce(
    (p_package_json->'instructionProvenance'->>'configured')::boolean,
    false
  );

  -- Ready packages are immutable. Stale-job reconciliation may complete with the
  -- existing package, but must never replace a Ready package with different JSON.
  update athena_estimates
  set
    status = 'Ready',
    generation_stage = 'completed',
    package_json = case
      when status = 'Ready' and package_json is not null then package_json
      else p_package_json
    end,
    currency_code = case
      when status = 'Ready' and package_json is not null then currency_code
      else v_currency_code
    end,
    geography_label = case
      when status = 'Ready' and package_json is not null then geography_label
      else v_geography_label
    end,
    currency_resolution = case
      when status = 'Ready' and package_json is not null then currency_resolution
      else v_currency_resolution
    end,
    instruction_config_key = case
      when status = 'Ready' and package_json is not null then instruction_config_key
      else v_instruction_config_key
    end,
    instruction_revision_id = case
      when status = 'Ready' and package_json is not null then instruction_revision_id
      else v_instruction_revision_id
    end,
    instruction_configured = case
      when status = 'Ready' and package_json is not null then instruction_configured
      else v_instruction_configured
    end,
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.estimate_id;

  return v_job;
end;
$$;

revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb) from public;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb) from anon;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_athena_estimate_generation_job(uuid, uuid, jsonb) to service_role;

create or replace function fail_athena_estimate_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_estimate_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_estimate_generation_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_estimate_generation_jobs
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

  update athena_estimate_generation_jobs
  set
    status = v_status,
    generation_stage = coalesce(p_failed_stage, generation_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Estimate generation failed'), 1000),
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
    -- Never demote or clear a Ready Estimate (Ready packages are immutable).
    update athena_estimates
    set
      status = 'Processing Failed',
      generation_stage = 'failed',
      package_json = null,
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.estimate_id
      and status is distinct from 'Ready';
  else
    -- retryable: keep Estimate Processing so clients continue polling
    update athena_estimates
    set
      status = 'Processing',
      generation_stage = coalesce(p_failed_stage, generation_stage),
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.estimate_id
      and status is distinct from 'Ready';
  end if;

  return v_job;
end;
$$;

revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;
