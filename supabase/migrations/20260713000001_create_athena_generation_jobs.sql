-- Durable Athena generation jobs (V3).
-- Shared by manual refresh, discussion import, and discussion update workflows.

create table if not exists athena_generation_jobs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references organizations(id) on delete cascade,
  discussion_id uuid not null references discussions(id) on delete cascade,
  discussion_update_id uuid references athena_discussion_updates(id) on delete set null,

  trigger_type text not null
    check (trigger_type in ('manual_refresh', 'discussion_import', 'discussion_update')),

  requested_by uuid references auth.users(id) on delete set null,

  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'retryable')),

  current_stage text,
  progress jsonb not null default '{}'::jsonb,

  attempt_count integer not null default 0
    check (attempt_count >= 0),
  max_attempts integer not null default 3
    check (max_attempts >= 1),

  regeneration_run_id text,
  analysis_id uuid,
  opportunity_id uuid,
  review_id uuid,
  blueprint_id uuid,
  executive_version_id uuid,

  error_code text,
  error_message text,
  error_metadata jsonb,

  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_generation_jobs_discussion_id_idx
  on athena_generation_jobs (discussion_id);

create index if not exists athena_generation_jobs_organization_id_idx
  on athena_generation_jobs (organization_id);

create index if not exists athena_generation_jobs_status_idx
  on athena_generation_jobs (status, updated_at);

create index if not exists athena_generation_jobs_discussion_status_idx
  on athena_generation_jobs (discussion_id, status, created_at desc);

-- At most one active (queued/processing) job per discussion.
create unique index if not exists athena_generation_jobs_one_active_per_discussion
  on athena_generation_jobs (discussion_id)
  where status in ('queued', 'processing');
