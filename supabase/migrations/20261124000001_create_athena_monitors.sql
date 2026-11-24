-- Athena V3 MONITOR-1 Gate 3B.1
-- Private monitors, jobs, and job observations, plus shared public website
-- intelligence. Shared tables have no organization id.
-- athena_monitor_discovery_coverage is the additional enumeration record:
-- a set of public product observations does not prove category or catalog coverage.
-- Organization ownership is enforced with composite foreign keys.
-- RLS is enabled. There are no client policies.
-- Direct table access is service_role only.
-- JSON documents use the camelCase Monitor configuration contract.
-- Entitlement stays in the application through resolveAthenaPlan.
-- This file does not alter organizations, generation jobs, workers, or quotas.
-- No backfill. No deletes. No production data changes.
-- Source migration only. Do not apply this file from application code.

create table if not exists athena_monitor_sources (
  id uuid primary key default gen_random_uuid(),
  normalized_host text not null,
  canonical_url text not null,
  registered_source_id text not null,
  platform text not null,
  adapter_id text not null,
  adapter_version text not null,
  extraction_config jsonb not null,
  discovery_status text not null default 'pending',
  last_discovered_at timestamptz,
  access_status text not null,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_monitor_sources_host_key unique (normalized_host),
  constraint athena_monitor_sources_registered_key unique (registered_source_id),

  constraint athena_monitor_sources_host_chk check (
    normalized_host = lower(normalized_host)
    and normalized_host !~ '^www\.'
    and canonical_url = 'https://' || normalized_host || '/'
  ),

  constraint athena_monitor_sources_identity_chk check (
    registered_source_id ~ '^[a-z0-9-]{1,64}$'
    and platform in ('solusquare', 'sfra')
    and adapter_id = platform
    and char_length(adapter_version) between 1 and 32
  ),

  constraint athena_monitor_sources_status_chk check (
    discovery_status in ('pending', 'current', 'failed')
    and access_status in ('feasible', 'blocked', 'cooldown')
    and (
      access_status <> 'cooldown'
      or retry_after is not null
    )
  ),

  constraint athena_monitor_sources_config_chk check (
    jsonb_typeof(extraction_config) = 'object'
    and extraction_config->>'version' = '1'
    and extraction_config->>'registrableDomain' = normalized_host
    and not (
      extraction_config ?| array[
        'organizationId',
        'organization_id',
        'objective',
        'criterion',
        'threshold',
        'userId',
        'monitorId',
        'code',
        'script',
        'scraper',
        'executable',
        'program',
        'eval',
        'html',
        'rawHtml'
      ]
    )
  )
);

comment on table athena_monitor_sources is
  'Canonical public website registry. No organization, customer objective, selected category, or search history. service_role only.';

create table if not exists athena_monitor_source_categories (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references athena_monitor_sources(id),
  category_key text not null,
  display_name text not null,
  canonical_url text not null,
  parent_category_id uuid,
  parent_category_key text,
  discovered_at timestamptz not null,
  discovery_status text not null,
  product_family_count integer,
  product_family_count_basis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_monitor_source_categories_source_key unique (id, source_id),
  constraint athena_monitor_source_categories_key unique (source_id, category_key),
  constraint athena_monitor_source_categories_url unique (source_id, canonical_url),

  constraint athena_monitor_source_categories_parent_fk
    foreign key (parent_category_id, source_id)
    references athena_monitor_source_categories (id, source_id),

  constraint athena_monitor_source_categories_shape_chk check (
    category_key ~ '^[a-z0-9][a-z0-9./_-]{0,199}$'
    and category_key <> 'whole_catalog'
    and char_length(display_name) between 1 and 200
    and canonical_url ~ '^https://'
    and discovery_status in ('current', 'removed', 'partial')
    and (
      product_family_count is null
      or product_family_count >= 0
    )
    and (
      product_family_count_basis is null
      or product_family_count_basis in ('verified', 'estimated')
    )
    and (
      (parent_category_id is null and parent_category_key is null)
      or (parent_category_id is not null and parent_category_key is not null)
    )
  )
);

comment on table athena_monitor_source_categories is
  'Shared discovered categories for one public website. Current discovery status can change. Enumeration completeness is not stored here. No organization id.';

create table if not exists athena_monitor_public_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references athena_monitor_sources(id),
  registered_source_id text not null,
  family_id text not null,
  adapter_id text not null,
  adapter_version text not null,
  schema_version integer not null,
  product_name text,
  canonical_url text not null,
  price_amount text,
  currency text,
  color_pattern_ids jsonb,
  color_pattern_names jsonb,
  distinct_variation_count integer,
  sizes jsonb,
  lengths jsonb,
  image_url text,
  category_name text,
  observed_at timestamptz not null,
  provenance jsonb not null,
  content_key text not null,
  created_at timestamptz not null default now(),

  constraint athena_monitor_public_observations_content_key
    unique (source_id, content_key),

  constraint athena_monitor_public_observations_shape_chk check (
    schema_version = 1
    and char_length(family_id) between 1 and 200
    and canonical_url ~ '^https://'
    and (price_amount is null or price_amount ~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$')
    and (currency is null or currency ~ '^[A-Z]{3}$')
    and (
      distinct_variation_count is null
      or distinct_variation_count between 0 and 500
    )
    and (image_url is null or image_url ~ '^https://')
    and (
      category_name is null
      or (
        char_length(category_name) between 1 and 200
        and category_name !~ '[[:cntrl:]]'
      )
    )
    and jsonb_typeof(provenance) = 'object'
    and not (
      provenance ?| array[
        'organizationId',
        'organization_id',
        'objective',
        'criterion',
        'html',
        'rawHtml',
        'imageBinary',
        'imageBytes',
        'script',
        'code'
      ]
    )
  )
);

comment on table athena_monitor_public_observations is
  'Immutable shared public product-family observations. A later extraction inserts a new row. No raw HTML, image binaries, or customer data. service_role only.';

create table if not exists athena_monitor_discovery_coverage (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references athena_monitor_sources(id),
  scope_kind text not null,
  category_id uuid,
  scope_key text not null,
  status text not null,
  adapter_id text not null,
  adapter_version text not null,
  schema_version integer not null,
  discovered_at timestamptz not null,
  family_ids jsonb not null,
  family_count integer not null,
  created_at timestamptz not null default now(),

  constraint athena_monitor_discovery_coverage_category_fk
    foreign key (category_id, source_id)
    references athena_monitor_source_categories (id, source_id),

  constraint athena_monitor_discovery_coverage_scope_chk check (
    status in ('completed', 'partial', 'failed')
    and schema_version = 1
    and jsonb_typeof(family_ids) = 'array'
    and jsonb_array_length(family_ids) <= 20000
    and family_count = jsonb_array_length(family_ids)
    and (
      (
        scope_kind = 'whole_catalog'
        and category_id is null
        and scope_key = 'whole_catalog'
      )
      or (
        scope_kind = 'category'
        and category_id is not null
        and scope_key <> 'whole_catalog'
        and char_length(scope_key) between 1 and 300
      )
    )
  )
);

comment on table athena_monitor_discovery_coverage is
  'Immutable shared enumeration coverage for one exact category or the whole catalog. Cached product observations are not a substitute for a completed row. No organization id.';

create table if not exists athena_monitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  configuration_version integer not null,
  configuration jsonb not null,
  last_successful_job_id uuid,
  last_successful_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_monitors_id_organization_key unique (id, organization_id),

  constraint athena_monitors_name_chk check (
    char_length(name) between 1 and 120
    and name = btrim(name)
    and name = configuration->>'name'
  ),

  constraint athena_monitors_configuration_chk check (
    configuration_version = 1
    and jsonb_typeof(configuration) = 'object'
    and configuration->>'version' = '1'
    and char_length(configuration->>'objective') between 1 and 4000
    and jsonb_typeof(configuration->'sources') = 'array'
    and jsonb_array_length(configuration->'sources') between 1 and 8
    and jsonb_typeof(configuration->'criterion') = 'object'
    and configuration->'criterion'->>'id' = 'distinctColorPatternCount'
    and configuration->'criterion'->>'operator' = 'gte'
    and case
      when (configuration->'criterion'->>'minimum') ~ '^[1-9][0-9]{0,2}$'
      then (configuration->'criterion'->>'minimum')::integer between 1 and 100
      else false
    end
    and not (
      configuration ?| array[
        'code',
        'script',
        'scraper',
        'executable',
        'program',
        'eval',
        'html',
        'rawHtml',
        'imageBinary',
        'imageBytes'
      ]
    )
  ),

  constraint athena_monitors_success_pair_chk check (
    (last_successful_job_id is null and last_successful_at is null)
    or (last_successful_job_id is not null and last_successful_at is not null)
  )
);

comment on table athena_monitors is
  'Saved Monitor configuration for one organization. service_role only. Current configuration edits do not rewrite historical job snapshots. last_successful_job_id changes only for a completed job of this monitor and organization.';

comment on column athena_monitors.organization_id is
  'Authoritative owning organization. Paired with id for composite foreign keys.';

comment on column athena_monitors.configuration is
  'Versioned camelCase Monitor configuration. The initial criterion is distinctColorPatternCount >= minimum. Executable scraping fields are rejected.';

comment on column athena_monitors.last_successful_job_id is
  'Pointer to the latest completed execution. Partial, failed, blocked, and cancelled jobs must not replace it.';

create table if not exists athena_monitor_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monitor_id uuid not null,
  status text not null default 'queued',
  configuration_version integer not null,
  configuration_snapshot jsonb not null,
  claimed_by text,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  heartbeat_at timestamptz,
  execution_deadline_at timestamptz,
  batch_deadline_at timestamptz,
  request_timeout_ms integer,
  batch_completed_at timestamptz,
  cancellation_requested_at timestamptz,
  progress jsonb not null default '{"version":1,"familiesDiscovered":0,"familiesAnalyzed":0,"familiesPersisted":0}'::jsonb,
  source_coverage jsonb not null default '[]'::jsonb,
  execution_cursor jsonb not null default '{"version":1,"sources":[]}'::jsonb,
  error_code text,
  error_message text,
  error_metadata jsonb,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_monitor_jobs_id_organization_key unique (id, organization_id),
  constraint athena_monitor_jobs_identity_key unique (id, monitor_id, organization_id),

  constraint athena_monitor_jobs_monitor_owner_fk
    foreign key (monitor_id, organization_id)
    references athena_monitors (id, organization_id)
    on delete cascade,

  constraint athena_monitor_jobs_status_chk check (
    status in (
      'queued',
      'processing',
      'completed',
      'partial',
      'failed',
      'blocked',
      'cancelled'
    )
  ),

  constraint athena_monitor_jobs_attempt_chk check (attempt_count >= 0),

  constraint athena_monitor_jobs_worker_chk check (
    claimed_by is null or char_length(btrim(claimed_by)) between 1 and 120
  ),

  constraint athena_monitor_jobs_error_code_chk check (
    error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),

  constraint athena_monitor_jobs_error_message_chk check (
    error_message is null or char_length(error_message) <= 500
  ),

  constraint athena_monitor_jobs_error_metadata_chk check (
    error_metadata is null or octet_length(error_metadata::text) <= 2000
  ),

  constraint athena_monitor_jobs_snapshot_chk check (
    configuration_version = 1
    and jsonb_typeof(configuration_snapshot) = 'object'
    and configuration_snapshot->>'version' = '1'
    and char_length(configuration_snapshot->>'name') between 1 and 120
    and char_length(configuration_snapshot->>'objective') between 1 and 4000
    and jsonb_typeof(configuration_snapshot->'sources') = 'array'
    and jsonb_array_length(configuration_snapshot->'sources') between 1 and 8
    and jsonb_typeof(configuration_snapshot->'criterion') = 'object'
    and configuration_snapshot->'criterion'->>'id' = 'distinctColorPatternCount'
    and configuration_snapshot->'criterion'->>'operator' = 'gte'
    and case
      when (configuration_snapshot->'criterion'->>'minimum') ~ '^[1-9][0-9]{0,2}$'
      then (configuration_snapshot->'criterion'->>'minimum')::integer between 1 and 100
      else false
    end
    and not (
      configuration_snapshot ?| array[
        'code',
        'script',
        'scraper',
        'executable',
        'program',
        'eval',
        'html',
        'rawHtml',
        'imageBinary',
        'imageBytes'
      ]
    )
  ),

  constraint athena_monitor_jobs_progress_chk check (
    jsonb_typeof(progress) = 'object'
    and jsonb_typeof(source_coverage) = 'array'
    and jsonb_typeof(execution_cursor) = 'object'
  ),

  constraint athena_monitor_jobs_request_timeout_chk check (
    request_timeout_ms is null or request_timeout_ms between 1000 and 120000
  ),

  constraint athena_monitor_jobs_batch_deadline_chk check (
    batch_deadline_at is null
    or execution_deadline_at is null
    or batch_deadline_at <= execution_deadline_at
  )
);

comment on table athena_monitor_jobs is
  'Durable Monitor execution. One active queued or processing job per monitor. configuration_snapshot is immutable. Expired processing leases are reclaimable unless cancellation was requested or the execution deadline passed. service_role only.';

comment on column athena_monitor_jobs.configuration_snapshot is
  'Immutable copy of the Monitor configuration at enqueue. Later edits to athena_monitors do not change this document.';

comment on column athena_monitor_jobs.claim_token is
  'Fence for heartbeat, observation publication, and finalization. A stale token cannot publish or finalize.';

comment on column athena_monitor_jobs.claim_expires_at is
  'Claim lease. It cannot extend past the current batch deadline or the overall execution deadline.';

comment on column athena_monitor_jobs.execution_deadline_at is
  'Overall execution deadline from the first claim. Batch yield and reclaim cannot move it later.';

comment on column athena_monitor_jobs.batch_deadline_at is
  'Current batch bound. Passing it yields the worker. It does not fail the job while the overall deadline remains open.';

comment on column athena_monitor_jobs.request_timeout_ms is
  'Single public-page request bound recorded for the worker. It is not a job-ending deadline.';

comment on column athena_monitor_jobs.batch_completed_at is
  'Last successful batch yield. Claim order uses it so a large catalog run does not stay ahead of other jobs.';

comment on column athena_monitor_jobs.cancellation_requested_at is
  'Explicit cancellation. The job must not automatically resume after this is set.';

comment on column athena_monitor_jobs.execution_cursor is
  'Resumable discovery and extraction cursor. Reclaim preserves it.';

create unique index if not exists athena_monitor_jobs_one_active_per_monitor
  on athena_monitor_jobs (organization_id, monitor_id)
  where status in ('queued', 'processing');

create index if not exists athena_monitor_jobs_claimable_idx
  on athena_monitor_jobs (status, created_at)
  where status in ('queued', 'processing');

create index if not exists athena_monitor_jobs_lease_idx
  on athena_monitor_jobs (status, claim_expires_at)
  where status = 'processing';

create index if not exists athena_monitor_jobs_organization_idx
  on athena_monitor_jobs (organization_id, monitor_id, created_at desc);

create table if not exists athena_monitor_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monitor_id uuid not null,
  job_id uuid not null,
  source_id text not null,
  family_id text not null,
  product_url text not null,
  observed_at timestamptz not null,
  threshold_match boolean,
  public_observation_id uuid not null references athena_monitor_public_observations(id) on delete restrict,
  reused boolean not null,
  category_ids jsonb not null default '[]'::jsonb,
  discovery_coverage_id uuid references athena_monitor_discovery_coverage(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint athena_monitor_observations_identity_key
    unique (job_id, source_id, family_id),

  constraint athena_monitor_observations_job_owner_fk
    foreign key (job_id, monitor_id, organization_id)
    references athena_monitor_jobs (id, monitor_id, organization_id)
    on delete cascade,

  constraint athena_monitor_observations_source_chk check (
    source_id ~ '^[a-z0-9-]{1,64}$'
  ),

  constraint athena_monitor_observations_family_chk check (
    char_length(family_id) between 1 and 200
    and family_id !~ '[[:cntrl:]]'
  ),

  constraint athena_monitor_observations_url_chk check (
    char_length(product_url) between 12 and 2000
    and product_url ~ '^https://'
  ),

  constraint athena_monitor_observations_categories_chk check (
    jsonb_typeof(category_ids) = 'array'
    and jsonb_array_length(category_ids) <= 50
  )
);

comment on table athena_monitor_observations is
  'Private job membership for one organization. The product payload lives on the immutable public observation. Threshold match, reuse, and category coverage stay private. service_role only.';

comment on column athena_monitor_observations.organization_id is
  'Must match the parent job organization. The composite foreign key rejects a cross-organization write.';

comment on column athena_monitor_observations.family_id is
  'Stable source-specific product family identity. Unique with job_id and source_id.';

comment on column athena_monitor_observations.public_observation_id is
  'Resolved by trusted server execution. Browser input cannot choose an arbitrary public observation id.';

comment on column athena_monitor_observations.reused is
  'False when this job created the public observation. True when an existing public observation was attached. Reuse keeps the original observed_at.';

create index if not exists athena_monitor_observations_organization_idx
  on athena_monitor_observations (organization_id, job_id, source_id);

create index if not exists athena_monitor_observations_result_page_idx
  on athena_monitor_observations (organization_id, job_id, observed_at desc, id);

create index if not exists athena_monitors_organization_idx
  on athena_monitors (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- Identity and history guards
-- ---------------------------------------------------------------------------

create or replace function public.reject_athena_monitor_job_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.monitor_id is distinct from old.monitor_id
     or new.configuration_version is distinct from old.configuration_version
     or new.configuration_snapshot is distinct from old.configuration_snapshot
     or new.created_at is distinct from old.created_at
  then
    raise exception 'monitor_job_snapshot_immutable';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'queued' and new.status in ('processing', 'cancelled'))
      or (
        old.status = 'processing'
        and new.status in (
          'processing',
          'completed',
          'partial',
          'failed',
          'blocked',
          'cancelled'
        )
      )
    ) then
      raise exception 'invalid_monitor_job_transition';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.reject_athena_monitor_job_mutation() is
  'BEFORE UPDATE guard. The configuration snapshot and organization pairing are immutable. Terminal jobs cannot return to an active state.';

drop trigger if exists athena_monitor_jobs_immutable on public.athena_monitor_jobs;

create trigger athena_monitor_jobs_immutable
  before update on public.athena_monitor_jobs
  for each row
  execute function public.reject_athena_monitor_job_mutation();

create or replace function public.reject_athena_monitor_observation_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'monitor_observation_immutable';
end;
$$;

comment on function public.reject_athena_monitor_observation_mutation() is
  'BEFORE UPDATE guard. A stored observation is historical and cannot be overwritten by a retry or a later search.';

drop trigger if exists athena_monitor_observations_immutable on public.athena_monitor_observations;

create trigger athena_monitor_observations_immutable
  before update on public.athena_monitor_observations
  for each row
  execute function public.reject_athena_monitor_observation_mutation();

drop trigger if exists athena_monitor_public_observations_immutable on public.athena_monitor_public_observations;

create trigger athena_monitor_public_observations_immutable
  before update on public.athena_monitor_public_observations
  for each row
  execute function public.reject_athena_monitor_observation_mutation();

drop trigger if exists athena_monitor_discovery_coverage_immutable on public.athena_monitor_discovery_coverage;

create trigger athena_monitor_discovery_coverage_immutable
  before update on public.athena_monitor_discovery_coverage
  for each row
  execute function public.reject_athena_monitor_observation_mutation();

create or replace function public.enforce_athena_monitor_last_successful_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_successful_job_id is null then
    if new.last_successful_at is not null then
      raise exception 'last_successful_at requires last_successful_job_id';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.athena_monitor_jobs job
    where job.id = new.last_successful_job_id
      and job.monitor_id = new.id
      and job.organization_id = new.organization_id
      and job.status = 'completed'
  ) then
    raise exception 'last_successful_job_must_be_completed_for_this_monitor';
  end if;

  return new;
end;
$$;

comment on function public.enforce_athena_monitor_last_successful_job() is
  'BEFORE INSERT OR UPDATE guard. The baseline pointer must be a completed job for the same monitor and organization.';

drop trigger if exists athena_monitors_last_successful on public.athena_monitors;

create trigger athena_monitors_last_successful
  before insert or update on public.athena_monitors
  for each row
  execute function public.enforce_athena_monitor_last_successful_job();

-- ---------------------------------------------------------------------------
-- Recovery. Explicit cancellation wins over the execution deadline.
-- A live lease is left to its claim holder.
-- ---------------------------------------------------------------------------

create or replace function public.recover_athena_monitor_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_cancelled integer := 0;
  v_deadline integer := 0;
begin
  update public.athena_monitor_jobs
  set
    status = 'cancelled',
    completed_at = coalesce(completed_at, v_now),
    updated_at = v_now,
    claim_expires_at = null,
    error_code = coalesce(error_code, 'CANCELLED'),
    error_message = coalesce(
      error_message,
      'Cancellation was requested and the processing lease expired.'
    )
  where status = 'processing'
    and cancellation_requested_at is not null
    and claim_expires_at is not null
    and claim_expires_at < v_now;
  get diagnostics v_cancelled = row_count;

  update public.athena_monitor_jobs
  set
    status = 'failed',
    completed_at = coalesce(completed_at, v_now),
    updated_at = v_now,
    claim_expires_at = null,
    error_code = coalesce(error_code, 'EXECUTION_DEADLINE'),
    error_message = coalesce(
      error_message,
      'Execution deadline passed before the job finished.'
    )
  where status = 'processing'
    and cancellation_requested_at is null
    and execution_deadline_at is not null
    and execution_deadline_at <= v_now
    and claim_expires_at is not null
    and claim_expires_at < v_now;
  get diagnostics v_deadline = row_count;

  return v_cancelled + v_deadline;
end;
$$;

comment on function public.recover_athena_monitor_jobs() is
  'Idempotent recovery. Expired processing jobs with an explicit cancellation become cancelled and are not resumed. Expired jobs past the execution deadline become failed. Neither path replaces last_successful_job_id.';

create or replace function public.claim_athena_monitor_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_deadline_seconds integer default 21600,
  p_batch_deadline_seconds integer default 600,
  p_request_timeout_ms integer default 20000
)
returns public.athena_monitor_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
  v_deadline_seconds integer := greatest(coalesce(p_deadline_seconds, 21600), 60);
  v_batch_seconds integer := greatest(coalesce(p_batch_deadline_seconds, 600), 30);
  v_request_timeout_ms integer := coalesce(p_request_timeout_ms, 20000);
  v_overall timestamptz;
  v_batch timestamptz;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
    raise exception 'worker_id required';
  end if;
  if p_claim_token is null then
    raise exception 'claim_token required';
  end if;
  if v_request_timeout_ms < 1000 or v_request_timeout_ms > 120000 then
    raise exception 'request_timeout_out_of_bounds';
  end if;

  perform public.recover_athena_monitor_jobs();

  select job.*
  into v_job
  from public.athena_monitor_jobs job
  where (
      job.status = 'queued'
      or (
        job.status = 'processing'
        and job.cancellation_requested_at is null
        and job.claim_expires_at is not null
        and job.claim_expires_at < v_now
        and (
          job.execution_deadline_at is null
          or job.execution_deadline_at > v_now
        )
      )
    )
  order by coalesce(job.batch_completed_at, job.created_at) asc, job.created_at asc, job.id asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  v_overall := coalesce(
    v_job.execution_deadline_at,
    v_now + make_interval(secs => v_deadline_seconds)
  );
  v_batch := least(v_now + make_interval(secs => v_batch_seconds), v_overall);

  update public.athena_monitor_jobs
  set
    status = 'processing',
    claimed_by = btrim(p_worker_id),
    claim_token = p_claim_token,
    claimed_at = v_now,
    heartbeat_at = v_now,
    execution_deadline_at = v_overall,
    batch_deadline_at = v_batch,
    request_timeout_ms = v_request_timeout_ms,
    claim_expires_at = least(
      v_now + make_interval(secs => v_lease_seconds),
      v_batch,
      v_overall
    ),
    started_at = coalesce(started_at, v_now),
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

comment on function public.claim_athena_monitor_job(text, uuid, integer, integer, integer, integer) is
  'Claims one queued job, or one expired processing job that was not cancelled and is still inside its overall execution deadline. Resets the batch deadline without moving the overall deadline. Preserves the cursor, coverage, and observations. Does not read organizations.athena_plan.';

create or replace function public.heartbeat_athena_monitor_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 120,
  p_progress jsonb default null,
  p_source_coverage jsonb default null,
  p_execution_cursor jsonb default null
)
returns public.athena_monitor_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  update public.athena_monitor_jobs
  set
    heartbeat_at = v_now,
    claim_expires_at = least(
      v_now + make_interval(secs => v_lease_seconds),
      batch_deadline_at,
      execution_deadline_at
    ),
    progress = coalesce(p_progress, progress),
    source_coverage = coalesce(p_source_coverage, source_coverage),
    execution_cursor = coalesce(p_execution_cursor, execution_cursor),
    updated_at = v_now
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
    and claim_expires_at is not null
    and claim_expires_at > v_now
    and (batch_deadline_at is null or batch_deadline_at > v_now)
    and (execution_deadline_at is null or execution_deadline_at > v_now)
  returning * into v_job;

  return v_job;
end;
$$;

comment on function public.heartbeat_athena_monitor_job(uuid, uuid, integer, jsonb, jsonb, jsonb) is
  'Extends the lease for the current claim token only. A stale token, an expired batch, or a passed overall deadline does not write progress. The lease cannot move past the batch deadline or the overall execution deadline.';

create or replace function public.publish_athena_monitor_observations(
  p_job_id uuid,
  p_claim_token uuid,
  p_observations jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_source public.athena_monitor_sources;
  v_now timestamptz := now();
  v_item jsonb;
  v_inserted integer := 0;
  v_row_count integer := 0;
  v_source_id text;
  v_family_id text;
  v_product_url text;
  v_observed_at timestamptz;
  v_threshold boolean;
  v_threshold_type text;
  v_content_key text;
  v_public_id uuid;
  v_reused boolean;
  v_category_ids jsonb;
  v_category text;
begin
  if p_claim_token is null then
    raise exception 'claim_token required';
  end if;
  if jsonb_typeof(p_observations) <> 'array' then
    raise exception 'observations must be a json array';
  end if;
  if jsonb_array_length(p_observations) > 20 then
    raise exception 'observation batch exceeds bound';
  end if;

  select job.*
  into v_job
  from public.athena_monitor_jobs job
  where job.id = p_job_id
    and job.claim_token = p_claim_token
    and job.status = 'processing'
    and job.claim_expires_at is not null
    and job.claim_expires_at > v_now
    and job.cancellation_requested_at is null
    and (job.batch_deadline_at is null or job.batch_deadline_at > v_now)
    and (job.execution_deadline_at is null or job.execution_deadline_at > v_now)
  for update;

  if not found then
    return null;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    if v_item ? 'publicObservationId' or v_item ? 'public_observation_id' then
      raise exception 'public_observation_id_rejected';
    end if;
    if v_item ?| array['html', 'rawHtml', 'imageBinary', 'imageBytes', 'script', 'code'] then
      raise exception 'observation payload rejected';
    end if;

    v_source_id := v_item->>'sourceId';
    v_family_id := v_item->>'familyId';
    v_product_url := v_item->>'productUrl';
    v_content_key := v_item->>'contentKey';
    v_threshold_type := jsonb_typeof(v_item->'thresholdMatch');
    v_category_ids := coalesce(v_item->'categoryIds', '[]'::jsonb);
    v_category := nullif(btrim(v_item->>'category'), '');

    if v_source_id is null or v_source_id !~ '^[a-z0-9-]{1,64}$' then
      raise exception 'invalid observation source';
    end if;
    if v_family_id is null or char_length(v_family_id) < 1 then
      raise exception 'invalid observation family';
    end if;
    if v_product_url is null or v_product_url !~ '^https://' then
      raise exception 'invalid observation product url';
    end if;
    if v_content_key is null or v_content_key !~ '^[a-f0-9]{64}$' then
      raise exception 'invalid observation content key';
    end if;
    if jsonb_typeof(v_category_ids) <> 'array' then
      raise exception 'invalid observation categories';
    end if;
    if v_category is not null and (
      char_length(v_category) > 200
      or v_category ~ '[[:cntrl:]]'
    ) then
      raise exception 'invalid observation category';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_job.configuration_snapshot->'sources') src
      where src->>'sourceId' = v_source_id
    ) then
      raise exception 'observation source is outside the job snapshot';
    end if;

    select *
    into v_source
    from public.athena_monitor_sources src
    where src.registered_source_id = v_source_id;

    if not found then
      raise exception 'shared_source_required';
    end if;

    if v_threshold_type = 'boolean' then
      v_threshold := (v_item->>'thresholdMatch')::boolean;
    elsif v_threshold_type = 'null' then
      v_threshold := null;
    else
      raise exception 'invalid observation threshold';
    end if;

    v_observed_at := (v_item->>'observedAt')::timestamptz;

    insert into public.athena_monitor_public_observations (
      source_id,
      registered_source_id,
      family_id,
      adapter_id,
      adapter_version,
      schema_version,
      product_name,
      canonical_url,
      price_amount,
      currency,
      color_pattern_ids,
      color_pattern_names,
      distinct_variation_count,
      sizes,
      lengths,
      image_url,
      category_name,
      observed_at,
      provenance,
      content_key
    )
    values (
      v_source.id,
      v_source.registered_source_id,
      v_family_id,
      v_source.adapter_id,
      v_source.adapter_version,
      1,
      v_item->>'productName',
      v_product_url,
      v_item->>'priceAmount',
      v_item->>'currency',
      v_item->'colorPatternIds',
      v_item->'colorPatternNames',
      case
        when jsonb_typeof(v_item->'distinctVariationCount') = 'null' then null
        else (v_item->>'distinctVariationCount')::integer
      end,
      v_item->'sizes',
      v_item->'lengths',
      v_item->>'imageUrl',
      v_category,
      v_observed_at,
      jsonb_build_object(
        'version', 1,
        'adapterId', v_source.adapter_id,
        'adapterVersion', v_source.adapter_version,
        'schemaVersion', 1,
        'categoryIds', v_category_ids
      ),
      v_content_key
    )
    on conflict (source_id, content_key) do nothing
    returning id into v_public_id;

    if v_public_id is null then
      select id
      into v_public_id
      from public.athena_monitor_public_observations
      where source_id = v_source.id
        and content_key = v_content_key;
      v_reused := true;
    else
      v_reused := coalesce((v_item->>'reused')::boolean, false);
    end if;

    if v_public_id is null then
      raise exception 'public_observation_unresolved';
    end if;

    insert into public.athena_monitor_observations (
      organization_id,
      monitor_id,
      job_id,
      source_id,
      family_id,
      product_url,
      observed_at,
      threshold_match,
      public_observation_id,
      reused,
      category_ids
    )
    values (
      v_job.organization_id,
      v_job.monitor_id,
      v_job.id,
      v_source_id,
      v_family_id,
      v_product_url,
      v_observed_at,
      v_threshold,
      v_public_id,
      v_reused,
      v_category_ids
    )
    on conflict (job_id, source_id, family_id) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
    v_public_id := null;
  end loop;

  return v_inserted;
end;
$$;

comment on function public.publish_athena_monitor_observations(uuid, uuid, jsonb) is
  'Resolves or inserts an immutable public observation, then attaches a private job row. A caller-supplied public observation id is rejected. Organization and monitor ids come from the job. Conflicts keep the first private row.';

create or replace function public.yield_athena_monitor_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_progress jsonb default null,
  p_source_coverage jsonb default null,
  p_execution_cursor jsonb default null
)
returns public.athena_monitor_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_now timestamptz := now();
begin
  update public.athena_monitor_jobs
  set
    progress = coalesce(p_progress, progress),
    source_coverage = coalesce(p_source_coverage, source_coverage),
    execution_cursor = coalesce(p_execution_cursor, execution_cursor),
    batch_completed_at = v_now,
    claim_expires_at = v_now - interval '1 millisecond',
    updated_at = v_now
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
    and cancellation_requested_at is null
    and claim_expires_at is not null
    and claim_expires_at > v_now
    and (batch_deadline_at is null or batch_deadline_at > v_now)
    and (execution_deadline_at is null or execution_deadline_at > v_now)
  returning * into v_job;

  return v_job;
end;
$$;

comment on function public.yield_athena_monitor_job(uuid, uuid, jsonb, jsonb, jsonb) is
  'Persists the cursor and expires the claim lease without ending the job. The overall execution deadline stays unchanged. The next claim can resume another job first.';

create or replace function public.finalize_athena_monitor_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error_code text default null,
  p_error_message text default null,
  p_error_metadata jsonb default null,
  p_source_coverage jsonb default null,
  p_progress jsonb default null,
  p_execution_cursor jsonb default null
)
returns public.athena_monitor_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_now timestamptz := now();
  v_coverage jsonb;
begin
  if p_status not in ('completed', 'partial', 'failed', 'blocked', 'cancelled') then
    raise exception 'invalid monitor terminal status';
  end if;
  if p_error_message is not null and char_length(p_error_message) > 500 then
    raise exception 'diagnostic exceeds bound';
  end if;
  if p_error_metadata is not null and octet_length(p_error_metadata::text) > 2000 then
    raise exception 'diagnostic exceeds bound';
  end if;

  select *
  into v_job
  from public.athena_monitor_jobs
  where id = p_job_id
  for update;

  if not found then
    return null;
  end if;

  if v_job.status = p_status
     and v_job.status in ('completed', 'partial', 'failed', 'blocked', 'cancelled')
  then
    return v_job;
  end if;

  if v_job.status <> 'processing'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.claim_expires_at is null
     or v_job.claim_expires_at <= v_now
  then
    return null;
  end if;

  if v_job.cancellation_requested_at is not null and p_status <> 'cancelled' then
    raise exception 'cancelled monitor job cannot resume';
  end if;

  v_coverage := coalesce(p_source_coverage, v_job.source_coverage);
  if jsonb_typeof(v_coverage) <> 'array' then
    raise exception 'source coverage must be an array';
  end if;

  if p_status = 'completed' and exists (
    select 1
    from jsonb_array_elements(v_job.configuration_snapshot->'sources') src
    where not exists (
      select 1
      from jsonb_array_elements(v_coverage) cov
      where cov->>'sourceId' = src->>'sourceId'
        and cov->>'status' = 'completed'
        and cov->>'discoveryStatus' = 'completed'
        and coalesce(cov->>'discoveryCoverageId', '') <> ''
        and coalesce(jsonb_array_length(cov->'failedFamilyIds'), 0) = 0
    )
  ) then
    raise exception 'incomplete_monitor_coverage';
  end if;

  update public.athena_monitor_jobs
  set
    status = p_status,
    source_coverage = v_coverage,
    progress = coalesce(p_progress, progress),
    execution_cursor = coalesce(p_execution_cursor, execution_cursor),
    error_code = p_error_code,
    error_message = p_error_message,
    error_metadata = p_error_metadata,
    completed_at = v_now,
    updated_at = v_now,
    claim_expires_at = null
  where id = v_job.id
  returning * into v_job;

  if p_status = 'completed' then
    update public.athena_monitors
    set
      last_successful_job_id = v_job.id,
      last_successful_at = v_now,
      updated_at = v_now
    where id = v_job.monitor_id
      and organization_id = v_job.organization_id;
  end if;

  return v_job;
end;
$$;

comment on function public.finalize_athena_monitor_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) is
  'Token-fenced terminal write. Only completed replaces the monitor baseline, and only when every snapshotted source is completed. Repeating the same terminal status is idempotent and does not move the baseline timestamp.';

create or replace function public.request_athena_monitor_job_cancellation(
  p_organization_id uuid,
  p_job_id uuid
)
returns public.athena_monitor_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.athena_monitor_jobs;
  v_now timestamptz := now();
begin
  select *
  into v_job
  from public.athena_monitor_jobs
  where id = p_job_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return null;
  end if;

  if v_job.status = 'cancelled' then
    return v_job;
  end if;

  if v_job.status = 'queued' then
    update public.athena_monitor_jobs
    set
      status = 'cancelled',
      cancellation_requested_at = coalesce(cancellation_requested_at, v_now),
      error_code = 'CANCELLED',
      error_message = 'Cancelled before execution started.',
      completed_at = v_now,
      updated_at = v_now,
      claim_token = null,
      claim_expires_at = null
    where id = v_job.id
    returning * into v_job;
    return v_job;
  end if;

  if v_job.status = 'processing' then
    update public.athena_monitor_jobs
    set
      cancellation_requested_at = coalesce(cancellation_requested_at, v_now),
      updated_at = v_now
    where id = v_job.id
    returning * into v_job;
    return v_job;
  end if;

  raise exception 'monitor_job_not_cancellable';
end;
$$;

comment on function public.request_athena_monitor_job_cancellation(uuid, uuid) is
  'Organization-scoped cancellation. Queued jobs become cancelled immediately. Processing jobs record the request and must not be completed afterward. The previous successful baseline is left untouched.';

-- ---------------------------------------------------------------------------
-- Bounded customer result reads. Filters and ordering happen before the page.
-- Historical comparison uses compact facts, not full observation payloads.
-- ---------------------------------------------------------------------------

create or replace function public.page_athena_monitor_observations(
  p_organization_id uuid,
  p_job_id uuid,
  p_page integer,
  p_page_size integer,
  p_source_ids text[],
  p_category text,
  p_min_variations integer,
  p_max_price numeric,
  p_observed_after timestamptz,
  p_sort text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page_size integer;
  v_sort text;
  v_result jsonb;
begin
  if p_organization_id is null or p_job_id is null then
    raise exception 'monitor_result_scope_required';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 24 then
    raise exception 'monitor_result_page_bound';
  end if;
  v_page_size := p_page_size;
  v_sort := case
    when p_sort in ('website', 'category', 'variations', 'price', 'observed') then p_sort
    else 'observed'
  end;

  if not exists (
    select 1
    from public.athena_monitor_jobs job
    where job.id = p_job_id
      and job.organization_id = p_organization_id
  ) then
    return jsonb_build_object(
      'total', 0,
      'page', 1,
      'pageSize', v_page_size,
      'pageCount', 1,
      'rows', '[]'::jsonb
    );
  end if;

  with matched as (
    select
      obs.id,
      obs.organization_id,
      obs.monitor_id,
      obs.job_id,
      obs.source_id,
      obs.family_id,
      obs.product_url,
      obs.observed_at,
      obs.threshold_match,
      obs.public_observation_id,
      obs.reused,
      obs.category_ids,
      obs.discovery_coverage_id,
      obs.created_at,
      pub.product_name,
      pub.category_name,
      pub.price_amount,
      pub.currency,
      pub.color_pattern_ids,
      pub.color_pattern_names,
      pub.distinct_variation_count,
      pub.sizes,
      pub.lengths,
      pub.image_url,
      pub.adapter_id,
      pub.adapter_version,
      pub.schema_version,
      pub.content_key,
      pub.source_id as shared_source_id
    from public.athena_monitor_observations obs
    join public.athena_monitor_public_observations pub
      on pub.id = obs.public_observation_id
    where obs.organization_id = p_organization_id
      and obs.job_id = p_job_id
      and (p_source_ids is null or obs.source_id = any (p_source_ids))
      and (p_category is null or pub.category_name = p_category)
      and (
        p_min_variations is null
        or pub.distinct_variation_count >= p_min_variations
      )
      and (
        p_max_price is null
        or (
          pub.price_amount ~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
          and pub.price_amount::numeric <= p_max_price
        )
      )
      and (p_observed_after is null or obs.observed_at >= p_observed_after)
  ),
  ranked as (
    select
      row_number() over (
        order by
          case when v_sort = 'website' then
            case matched.source_id
              when 'bonobo' then 'Bonobo'
              when 'breal' then 'Bréal'
              when 'cache-cache' then 'Cache Cache'
              when 'toscane' then 'Toscane'
              else matched.source_id
            end
          end asc nulls last,
          case when v_sort = 'category' then coalesce(matched.category_name, '') end asc nulls last,
          case when v_sort = 'variations' then matched.distinct_variation_count end desc nulls last,
          case
            when v_sort = 'price'
             and matched.price_amount ~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
            then matched.price_amount::numeric
          end asc nulls last,
          case when v_sort = 'observed' then matched.observed_at end desc nulls last,
          matched.id asc
      ) as ordinal,
      matched.*
    from matched
  ),
  bounds as (
    select
      count(*)::integer as total,
      greatest(1, ceil(count(*)::numeric / v_page_size)::integer) as page_count,
      least(
        greatest(coalesce(p_page, 1), 1),
        greatest(1, ceil(count(*)::numeric / v_page_size)::integer)
      ) as page
    from matched
  )
  select jsonb_build_object(
    'total', bounds.total,
    'page', bounds.page,
    'pageSize', v_page_size,
    'pageCount', bounds.page_count,
    'rows', coalesce((
      select jsonb_agg((to_jsonb(ranked) - 'ordinal') order by ranked.ordinal)
      from ranked, bounds
      where ranked.ordinal > (bounds.page - 1) * v_page_size
        and ranked.ordinal <= bounds.page * v_page_size
    ), '[]'::jsonb)
  )
  into v_result
  from bounds;

  return v_result;
end;
$$;

comment on function public.page_athena_monitor_observations(uuid, uuid, integer, integer, text[], text, integer, numeric, timestamptz, text) is
  'Returns one owned job page after website, category, variation, price, and observation-date filters. Sort is stable by observation id. At most 24 full payloads are returned.';

create or replace function public.list_athena_monitor_observation_facts(
  p_organization_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_rows jsonb;
begin
  if p_organization_id is null or p_job_id is null then
    raise exception 'monitor_result_scope_required';
  end if;
  if not exists (
    select 1
    from public.athena_monitor_jobs job
    where job.id = p_job_id
      and job.organization_id = p_organization_id
  ) then
    return '[]'::jsonb;
  end if;

  select count(*)::integer
  into v_count
  from public.athena_monitor_observations obs
  where obs.organization_id = p_organization_id
    and obs.job_id = p_job_id;

  if v_count > 20000 then
    raise exception 'monitor_result_fact_bound';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', obs.id,
    'sourceId', obs.source_id,
    'familyId', obs.family_id,
    'observedAt', obs.observed_at,
    'reused', obs.reused,
    'thresholdMatch', obs.threshold_match,
    'publicObservationId', obs.public_observation_id,
    'category', pub.category_name,
    'priceAmount', pub.price_amount,
    'currency', pub.currency,
    'distinctVariationCount', pub.distinct_variation_count,
    'colorPatternIds', pub.color_pattern_ids
  ) order by obs.id), '[]'::jsonb)
  into v_rows
  from public.athena_monitor_observations obs
  join public.athena_monitor_public_observations pub
    on pub.id = obs.public_observation_id
  where obs.organization_id = p_organization_id
    and obs.job_id = p_job_id;

  return v_rows;
end;
$$;

comment on function public.list_athena_monitor_observation_facts(uuid, uuid) is
  'Compact owned-job rows for historical comparison. Product names, images, sizes, lengths, and provenance are omitted. The row count cannot exceed 20000.';

create or replace function public.get_athena_monitor_observations_by_ids(
  p_organization_id uuid,
  p_job_id uuid,
  p_observation_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if p_organization_id is null or p_job_id is null then
    raise exception 'monitor_result_scope_required';
  end if;
  if p_observation_ids is null or cardinality(p_observation_ids) > 24 then
    raise exception 'monitor_result_page_bound';
  end if;

  select coalesce(jsonb_agg((to_jsonb(selected) - 'ordinal') order by selected.ordinal), '[]'::jsonb)
  into v_rows
  from (
    select
      array_position(p_observation_ids, obs.id) as ordinal,
      obs.id,
      obs.organization_id,
      obs.monitor_id,
      obs.job_id,
      obs.source_id,
      obs.family_id,
      obs.product_url,
      obs.observed_at,
      obs.threshold_match,
      obs.public_observation_id,
      obs.reused,
      obs.category_ids,
      obs.discovery_coverage_id,
      obs.created_at,
      pub.product_name,
      pub.category_name,
      pub.price_amount,
      pub.currency,
      pub.color_pattern_ids,
      pub.color_pattern_names,
      pub.distinct_variation_count,
      pub.sizes,
      pub.lengths,
      pub.image_url,
      pub.adapter_id,
      pub.adapter_version,
      pub.schema_version,
      pub.content_key,
      pub.source_id as shared_source_id
    from public.athena_monitor_observations obs
    join public.athena_monitor_public_observations pub
      on pub.id = obs.public_observation_id
    where obs.organization_id = p_organization_id
      and obs.job_id = p_job_id
      and obs.id = any (p_observation_ids)
  ) selected;

  return v_rows;
end;
$$;

comment on function public.get_athena_monitor_observations_by_ids(uuid, uuid, uuid[]) is
  'Loads at most 24 full observation payloads for one owned job. Identifiers from another organization or job are ignored.';

-- ---------------------------------------------------------------------------
-- Control-plane lockdown. No anon or authenticated table or function access.
-- ---------------------------------------------------------------------------

alter table athena_monitor_sources enable row level security;
revoke all on table athena_monitor_sources from public;
revoke all on table athena_monitor_sources from anon;
revoke all on table athena_monitor_sources from authenticated;
grant all on table athena_monitor_sources to service_role;

alter table athena_monitor_source_categories enable row level security;
revoke all on table athena_monitor_source_categories from public;
revoke all on table athena_monitor_source_categories from anon;
revoke all on table athena_monitor_source_categories from authenticated;
grant all on table athena_monitor_source_categories to service_role;

alter table athena_monitor_public_observations enable row level security;
revoke all on table athena_monitor_public_observations from public;
revoke all on table athena_monitor_public_observations from anon;
revoke all on table athena_monitor_public_observations from authenticated;
grant all on table athena_monitor_public_observations to service_role;

alter table athena_monitor_discovery_coverage enable row level security;
revoke all on table athena_monitor_discovery_coverage from public;
revoke all on table athena_monitor_discovery_coverage from anon;
revoke all on table athena_monitor_discovery_coverage from authenticated;
grant all on table athena_monitor_discovery_coverage to service_role;

alter table athena_monitors enable row level security;
revoke all on table athena_monitors from public;
revoke all on table athena_monitors from anon;
revoke all on table athena_monitors from authenticated;
grant all on table athena_monitors to service_role;

alter table athena_monitor_jobs enable row level security;
revoke all on table athena_monitor_jobs from public;
revoke all on table athena_monitor_jobs from anon;
revoke all on table athena_monitor_jobs from authenticated;
grant all on table athena_monitor_jobs to service_role;

alter table athena_monitor_observations enable row level security;
revoke all on table athena_monitor_observations from public;
revoke all on table athena_monitor_observations from anon;
revoke all on table athena_monitor_observations from authenticated;
grant all on table athena_monitor_observations to service_role;

revoke all on function public.reject_athena_monitor_job_mutation() from public;
revoke all on function public.reject_athena_monitor_job_mutation() from anon;
revoke all on function public.reject_athena_monitor_job_mutation() from authenticated;
grant execute on function public.reject_athena_monitor_job_mutation() to service_role;

revoke all on function public.reject_athena_monitor_observation_mutation() from public;
revoke all on function public.reject_athena_monitor_observation_mutation() from anon;
revoke all on function public.reject_athena_monitor_observation_mutation() from authenticated;
grant execute on function public.reject_athena_monitor_observation_mutation() to service_role;

revoke all on function public.enforce_athena_monitor_last_successful_job() from public;
revoke all on function public.enforce_athena_monitor_last_successful_job() from anon;
revoke all on function public.enforce_athena_monitor_last_successful_job() from authenticated;
grant execute on function public.enforce_athena_monitor_last_successful_job() to service_role;

revoke all on function public.recover_athena_monitor_jobs() from public;
revoke all on function public.recover_athena_monitor_jobs() from anon;
revoke all on function public.recover_athena_monitor_jobs() from authenticated;
grant execute on function public.recover_athena_monitor_jobs() to service_role;

revoke all on function public.claim_athena_monitor_job(text, uuid, integer, integer, integer, integer) from public;
revoke all on function public.claim_athena_monitor_job(text, uuid, integer, integer, integer, integer) from anon;
revoke all on function public.claim_athena_monitor_job(text, uuid, integer, integer, integer, integer) from authenticated;
grant execute on function public.claim_athena_monitor_job(text, uuid, integer, integer, integer, integer) to service_role;

revoke all on function public.heartbeat_athena_monitor_job(uuid, uuid, integer, jsonb, jsonb, jsonb) from public;
revoke all on function public.heartbeat_athena_monitor_job(uuid, uuid, integer, jsonb, jsonb, jsonb) from anon;
revoke all on function public.heartbeat_athena_monitor_job(uuid, uuid, integer, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.heartbeat_athena_monitor_job(uuid, uuid, integer, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.yield_athena_monitor_job(uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.yield_athena_monitor_job(uuid, uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function public.yield_athena_monitor_job(uuid, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.yield_athena_monitor_job(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.publish_athena_monitor_observations(uuid, uuid, jsonb) from public;
revoke all on function public.publish_athena_monitor_observations(uuid, uuid, jsonb) from anon;
revoke all on function public.publish_athena_monitor_observations(uuid, uuid, jsonb) from authenticated;
grant execute on function public.publish_athena_monitor_observations(uuid, uuid, jsonb) to service_role;

revoke all on function public.finalize_athena_monitor_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.finalize_athena_monitor_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.finalize_athena_monitor_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.finalize_athena_monitor_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.request_athena_monitor_job_cancellation(uuid, uuid) from public;
revoke all on function public.request_athena_monitor_job_cancellation(uuid, uuid) from anon;
revoke all on function public.request_athena_monitor_job_cancellation(uuid, uuid) from authenticated;
grant execute on function public.request_athena_monitor_job_cancellation(uuid, uuid) to service_role;

revoke all on function public.page_athena_monitor_observations(uuid, uuid, integer, integer, text[], text, integer, numeric, timestamptz, text) from public;
revoke all on function public.page_athena_monitor_observations(uuid, uuid, integer, integer, text[], text, integer, numeric, timestamptz, text) from anon;
revoke all on function public.page_athena_monitor_observations(uuid, uuid, integer, integer, text[], text, integer, numeric, timestamptz, text) from authenticated;
grant execute on function public.page_athena_monitor_observations(uuid, uuid, integer, integer, text[], text, integer, numeric, timestamptz, text) to service_role;

revoke all on function public.list_athena_monitor_observation_facts(uuid, uuid) from public;
revoke all on function public.list_athena_monitor_observation_facts(uuid, uuid) from anon;
revoke all on function public.list_athena_monitor_observation_facts(uuid, uuid) from authenticated;
grant execute on function public.list_athena_monitor_observation_facts(uuid, uuid) to service_role;

revoke all on function public.get_athena_monitor_observations_by_ids(uuid, uuid, uuid[]) from public;
revoke all on function public.get_athena_monitor_observations_by_ids(uuid, uuid, uuid[]) from anon;
revoke all on function public.get_athena_monitor_observations_by_ids(uuid, uuid, uuid[]) from authenticated;
grant execute on function public.get_athena_monitor_observations_by_ids(uuid, uuid, uuid[]) to service_role;
