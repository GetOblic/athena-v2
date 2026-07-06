create table if not exists knowledge_assets (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  category text not null,
  asset_type text not null,

  summary text,
  content text not null,

  community_id uuid null,
  source_type text null,
  source_id uuid null,

  status text not null default 'active',
  rating integer null check (rating >= 1 and rating <= 5),

  times_used integer not null default 0,
  generated_opportunities integer not null default 0,
  approved_briefings integer not null default 0,

  notes text null,
  tags text[] not null default '{}',

  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_asset_links (
  id uuid primary key default gen_random_uuid(),

  knowledge_asset_id uuid not null references knowledge_assets(id) on delete cascade,

  linked_type text not null,
  linked_id uuid not null,

  relationship text not null default 'used_in',

  created_at timestamptz not null default now()
);

create index if not exists knowledge_assets_category_idx
  on knowledge_assets(category);

create index if not exists knowledge_assets_asset_type_idx
  on knowledge_assets(asset_type);

create index if not exists knowledge_assets_community_id_idx
  on knowledge_assets(community_id);

create index if not exists knowledge_assets_tags_idx
  on knowledge_assets using gin(tags);

create index if not exists knowledge_asset_links_asset_id_idx
  on knowledge_asset_links(knowledge_asset_id);

create index if not exists knowledge_asset_links_linked_idx
  on knowledge_asset_links(linked_type, linked_id);
