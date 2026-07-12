-- Immutable Executive Intelligence Versions.
-- Each successful regeneration publishes a new version; previous versions are never overwritten.

create table if not exists athena_executive_intelligence_versions (
  id uuid primary key default gen_random_uuid(),

  discussion_id uuid not null references discussions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  version_number integer not null,
  is_current boolean not null default false,

  generated_at timestamptz not null default now(),
  generation_duration_ms integer,
  models_used text,
  routing_profile text,
  reasoning_profile text,
  reasoning_effort jsonb,
  pipeline_version text not null default 'executive_intelligence_v1',

  regeneration_run_id text,
  analysis_id uuid,
  opportunity_id uuid,
  review_id uuid,
  blueprint_id uuid,

  -- Complete immutable executive intelligence for this version.
  -- Structured for future comparison / diff / analytics without schema redesign.
  intelligence jsonb not null,

  created_at timestamptz not null default now(),

  constraint athena_executive_intelligence_versions_discussion_version_unique
    unique (discussion_id, version_number),

  constraint athena_executive_intelligence_versions_version_positive
    check (version_number >= 1)
);

create index if not exists athena_executive_intelligence_versions_discussion_id_idx
  on athena_executive_intelligence_versions (discussion_id);

create index if not exists athena_executive_intelligence_versions_organization_id_idx
  on athena_executive_intelligence_versions (organization_id);

create index if not exists athena_executive_intelligence_versions_discussion_current_idx
  on athena_executive_intelligence_versions (discussion_id, is_current);

create index if not exists athena_executive_intelligence_versions_generated_at_idx
  on athena_executive_intelligence_versions (discussion_id, generated_at desc);

-- At most one Current version per discussion.
create unique index if not exists athena_executive_intelligence_versions_one_current_per_discussion
  on athena_executive_intelligence_versions (discussion_id)
  where is_current = true;
