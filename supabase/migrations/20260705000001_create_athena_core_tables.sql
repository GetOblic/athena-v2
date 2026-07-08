-- Baseline Athena core intelligence tables (pre-tenant columns).
-- user_id and organization_id are added in later migrations.

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  platform text not null default 'intelligence_domain',
  group_name text not null,
  group_url text,
  niche text,
  member_count integer,
  status text not null default 'active',
  priority integer not null default 1,
  owner text,
  notes text
);

create table if not exists discussions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  community_id uuid references communities(id) on delete set null,
  platform text not null,
  title text not null,
  author text,
  url text,
  body text,
  status text not null default 'New',
  priority integer not null default 1,
  opportunity_score integer not null default 0,
  sentiment text,
  summary text,
  ai_notes text,
  last_activity timestamptz,
  raw_json jsonb
);

create table if not exists athena_discussion_analysis (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  discussion_id uuid not null references discussions(id) on delete cascade,
  community_id uuid references communities(id) on delete set null,
  status text not null default 'draft',
  summary text,
  sentiment text,
  intent text,
  buyer_stage text,
  pain_points text,
  opportunity_detected boolean not null default false,
  opportunity_title text,
  opportunity_reason text,
  recommended_action text,
  suggested_cta text,
  risk_level text,
  confidence integer not null default 0,
  strategy_key text not null default 'elevate',
  strategy_prompt_version text,
  analysis_prompt_version text,
  model text,
  generation_time_ms integer,
  raw_json jsonb
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  discussion_id uuid references discussions(id) on delete cascade,
  community_id uuid references communities(id) on delete set null,
  type text not null default 'community_discussion',
  status text not null default 'draft',
  score integer not null default 0,
  urgency text,
  intent text,
  risk_level text,
  title text not null,
  reason text,
  recommended_action text,
  suggested_cta text,
  assigned_to text,
  due_at timestamptz,
  ai_summary text,
  ai_recommendation text,
  raw_json jsonb
);

create table if not exists athena_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  discussion_id uuid references discussions(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  status text not null default 'draft',
  summary text,
  pain_points text,
  buyer_stage text,
  recommended_response text,
  cta text,
  confidence integer not null default 0,
  raw_json jsonb,
  model text,
  prompt_version text,
  generation_time_ms integer,
  version integer default 1,
  approved_by text,
  approved_at timestamptz,
  notes text
);

create table if not exists athena_community_intelligence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  community_id uuid references communities(id) on delete cascade,
  status text not null default 'draft',
  executive_summary text,
  market_trends text,
  recurring_pain_points text,
  recurring_objections text,
  recurring_questions text,
  buyer_stage_distribution text,
  high_value_opportunities text,
  recommended_campaigns text,
  recommended_content text,
  recommended_lead_magnets text,
  recommended_webinars text,
  strategic_recommendations text,
  confidence integer,
  strategy_prompt_version text,
  analysis_prompt_version text,
  model text,
  generation_time_ms integer,
  raw_json jsonb
);

create table if not exists athena_production_intelligence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  community_id uuid references communities(id) on delete cascade,
  source_intelligence_id uuid references athena_community_intelligence(id) on delete set null,
  status text not null default 'draft',
  content_theme text,
  target_audience text,
  buyer_stage text,
  core_pain_point text,
  strategic_reason text,
  recommended_assets jsonb,
  priority integer,
  confidence integer,
  strategy_prompt_version text,
  content_prompt_version text,
  model text,
  generation_time_ms integer,
  raw_json jsonb
);

create index if not exists discussions_community_id_idx on discussions (community_id);
create index if not exists discussions_created_at_idx on discussions (created_at desc);
create index if not exists athena_discussion_analysis_discussion_id_idx
  on athena_discussion_analysis (discussion_id, created_at desc);
create index if not exists opportunities_discussion_id_idx on opportunities (discussion_id);
create index if not exists athena_reviews_opportunity_id_idx on athena_reviews (opportunity_id);
create index if not exists athena_reviews_discussion_id_idx on athena_reviews (discussion_id);
create index if not exists athena_community_intelligence_community_id_idx
  on athena_community_intelligence (community_id, created_at desc);
create index if not exists athena_production_intelligence_community_id_idx
  on athena_production_intelligence (community_id, created_at desc);
