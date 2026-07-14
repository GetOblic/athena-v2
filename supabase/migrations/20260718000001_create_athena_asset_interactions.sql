-- Durable per-user asset copy / Done interaction traceability.
-- Does not mutate Executive Version snapshots.
-- Does not alter the prospects table.

create table if not exists athena_asset_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  -- Version scope: real Executive Version id, or the nil UUID sentinel for live/legacy.
  executive_version_id uuid not null default '00000000-0000-0000-0000-000000000000',
  asset_type text not null,
  interaction_type text not null default 'copied',
  first_occurred_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  interaction_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athena_asset_interactions_source_type_check
    check (source_type in ('discussion', 'prospect')),
  constraint athena_asset_interactions_interaction_type_check
    check (interaction_type in ('copied')),
  constraint athena_asset_interactions_count_check
    check (interaction_count >= 1),
  constraint athena_asset_interactions_unique
    unique (
      organization_id,
      user_id,
      source_type,
      source_id,
      executive_version_id,
      asset_type,
      interaction_type
    )
);

comment on table athena_asset_interactions is
  'Per-user durable interaction traceability for Deployment Assets and Strategic Asset Blueprint copy actions. Does not mutate Executive Version snapshots.';

comment on column athena_asset_interactions.asset_type is
  'Canonical asset key (e.g. community_reply, email_outreach, blueprint_image_prompt).';

comment on column athena_asset_interactions.executive_version_id is
  'Executive Version identity for the copied asset. Uses nil UUID for live/legacy assets without a version id.';

create index if not exists athena_asset_interactions_org_source_idx
  on athena_asset_interactions (organization_id, source_type, source_id);

create index if not exists athena_asset_interactions_org_user_version_idx
  on athena_asset_interactions (
    organization_id,
    user_id,
    source_type,
    source_id,
    executive_version_id
  );
