create table if not exists athena_asset_blueprints (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete set null,
  discussion_id uuid references discussions(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  briefing_id uuid references athena_reviews(id) on delete cascade,

  asset_title text not null,
  asset_type text not null,
  business_goal text,
  target_audience text,
  priority text,
  estimated_reuse integer check (estimated_reuse >= 1 and estimated_reuse <= 5),

  image_prompt text,
  pdf_prompt text,
  social_prompt text,
  notes text,

  status text not null default 'ready',

  raw_json jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athena_asset_blueprints_user_id_idx
  on athena_asset_blueprints(user_id);

create index if not exists athena_asset_blueprints_discussion_id_idx
  on athena_asset_blueprints(discussion_id);

create index if not exists athena_asset_blueprints_opportunity_id_idx
  on athena_asset_blueprints(opportunity_id);

create index if not exists athena_asset_blueprints_briefing_id_idx
  on athena_asset_blueprints(briefing_id);
