-- Multi-tenant organization layer for Athena customer intelligence isolation.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  constraint organization_members_user_id_unique unique (user_id)
);

create index if not exists organization_members_organization_id_idx
  on organization_members (organization_id);

-- Demo / Liana organization for existing seeded data.
insert into organizations (id, name, slug)
values ('a0000000-0000-4000-8000-000000000001', 'Liana', 'liana')
on conflict (slug) do nothing;

-- Core intelligence tables
alter table communities
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table discussions
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_discussion_analysis
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_discussion_updates
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table opportunities
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_reviews
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_asset_blueprints
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_community_intelligence
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_production_intelligence
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table knowledge_assets
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table athena_identity
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Backfill existing records into the Liana demo organization.
update communities
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update discussions
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_discussion_analysis
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_discussion_updates
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update opportunities
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_reviews
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_asset_blueprints
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_community_intelligence
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_production_intelligence
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update knowledge_assets
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

update athena_identity
set organization_id = 'a0000000-0000-4000-8000-000000000001'
where organization_id is null;

-- Existing identity users belong to the Liana demo organization.
insert into organization_members (organization_id, user_id, role)
select 'a0000000-0000-4000-8000-000000000001', user_id, 'owner'
from athena_identity
on conflict (user_id) do nothing;

create index if not exists communities_organization_id_idx on communities (organization_id);
create index if not exists discussions_organization_id_idx on discussions (organization_id);
create index if not exists athena_discussion_analysis_organization_id_idx on athena_discussion_analysis (organization_id);
create index if not exists athena_discussion_updates_organization_id_idx on athena_discussion_updates (organization_id);
create index if not exists opportunities_organization_id_idx on opportunities (organization_id);
create index if not exists athena_reviews_organization_id_idx on athena_reviews (organization_id);
create index if not exists athena_asset_blueprints_organization_id_idx on athena_asset_blueprints (organization_id);
create index if not exists athena_community_intelligence_organization_id_idx on athena_community_intelligence (organization_id);
create index if not exists athena_production_intelligence_organization_id_idx on athena_production_intelligence (organization_id);
create index if not exists knowledge_assets_organization_id_idx on knowledge_assets (organization_id);
create index if not exists athena_identity_organization_id_idx on athena_identity (organization_id);
