-- Athena V2 Phase 2A — GetOblic Directory persistence + domain foundation.
-- Additive only. Does not alter Prospects, Personas, GetOblic Links, Super Admin,
-- WordPress, billing, or athena_asset_interactions contracts.
-- Ordinary organization-owned tenant artifacts. Application-enforced isolation
-- via organization_id + supabaseAdmin. No RLS / no browser policies.
-- Claim exclusivity is GLOBAL among active statuses (claiming, linked,
-- remote_missing). released is reserved vocabulary only — first-slice code
-- must never write it. Do not apply this migration from application code.

-- ---------------------------------------------------------------------------
-- athena_getoblic_listing_links
-- Prospect ↔ GetOblic listing relationship. One active claim per Prospect
-- and one active claim per WordPress listing globally.
-- ---------------------------------------------------------------------------
create table if not exists athena_getoblic_listing_links (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  prospect_id uuid not null
    references prospects(id) on delete restrict,

  wordpress_listing_id bigint not null,

  google_id_snapshot text,
  google_id_is_matchable boolean not null default false,

  relationship_origin text not null,
  relationship_status text not null,

  wordpress_author_id bigint,

  allocated_at timestamptz,
  last_verified_at timestamptz,
  last_remote_error text,
  last_remote_error_at timestamptz,

  kb_push_status text not null default 'never',
  kb_last_pushed_executive_version_id uuid
    references athena_executive_intelligence_versions(id) on delete set null,
  kb_last_content_sha256 text,
  kb_last_pushed_at timestamptz,
  kb_last_push_error text,
  kb_last_push_error_at timestamptz,

  created_by_user_id uuid
    references auth.users(id) on delete set null,
  created_via_licensee_account_id uuid
    references licensee_accounts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz,

  constraint athena_getoblic_listing_links_wordpress_listing_id_chk
    check (wordpress_listing_id > 0),

  constraint athena_getoblic_listing_links_wordpress_author_id_chk
    check (wordpress_author_id is null or wordpress_author_id > 0),

  constraint athena_getoblic_listing_links_relationship_origin_chk
    check (relationship_origin in ('linked_existing', 'created')),

  constraint athena_getoblic_listing_links_relationship_status_chk
    check (
      relationship_status in (
        'claiming',
        'linked',
        'remote_missing',
        'released'
      )
    ),

  constraint athena_getoblic_listing_links_kb_push_status_chk
    check (kb_push_status in ('never', 'success', 'failed'))
);

-- One active claim per Prospect. released rows are excluded.
create unique index if not exists athena_getoblic_listing_links_one_active_per_prospect
  on athena_getoblic_listing_links (prospect_id)
  where relationship_status in ('claiming', 'linked', 'remote_missing');

-- One active claim per WordPress listing GLOBALLY (not per organization).
-- released rows are excluded so a future release can free the listing.
create unique index if not exists athena_getoblic_listing_links_one_active_per_listing
  on athena_getoblic_listing_links (wordpress_listing_id)
  where relationship_status in ('claiming', 'linked', 'remote_missing');

create index if not exists athena_getoblic_listing_links_org_status_idx
  on athena_getoblic_listing_links (organization_id, relationship_status);

create index if not exists athena_getoblic_listing_links_org_prospect_idx
  on athena_getoblic_listing_links (organization_id, prospect_id);

create index if not exists athena_getoblic_listing_links_wordpress_listing_id_idx
  on athena_getoblic_listing_links (wordpress_listing_id);

comment on table athena_getoblic_listing_links is
  'Athena V2 Prospect ↔ GetOblic listing relationship. Active statuses claiming/linked/remote_missing are globally exclusive per wordpress_listing_id. prospect_id ON DELETE RESTRICT blocks silent Prospect hard-delete. released is reserved and must not be written by Phase 2A.';
comment on column athena_getoblic_listing_links.organization_id is
  'Tenant of record. Owns the claim and allocation entitlement.';
comment on column athena_getoblic_listing_links.prospect_id is
  'Athena Prospect identity. ON DELETE RESTRICT — an integration relationship must not disappear because a Prospect is hard-deleted.';
comment on column athena_getoblic_listing_links.wordpress_listing_id is
  'Remote WordPress job_listing post ID. Not a Supabase FK. Globally exclusive among active claims.';
comment on column athena_getoblic_listing_links.google_id_snapshot is
  'Raw observed WordPress _google_id. Never unique. Pre-association matching hint only.';
comment on column athena_getoblic_listing_links.google_id_is_matchable is
  'Whether the raw snapshot passed the conservative classifier at observation time.';
comment on column athena_getoblic_listing_links.relationship_status is
  'claiming | linked | remote_missing are active/exclusive. released is reserved vocabulary only.';
comment on column athena_getoblic_listing_links.wordpress_author_id is
  'Last known WordPress post_author. Not organizations.id, auth.users.id, or prospects.user_id.';
comment on column athena_getoblic_listing_links.released_at is
  'Reserved for future release functionality. Phase 2A services must never set it.';
comment on column athena_getoblic_listing_links.kb_push_status is
  'Future Knowledge Base push state only. No push is implemented in Phase 2A.';

-- ---------------------------------------------------------------------------
-- athena_getoblic_directory_settings
-- One row per participating organization. Missing row = not configured.
-- No invented monthly_allowance default.
-- ---------------------------------------------------------------------------
create table if not exists athena_getoblic_directory_settings (
  organization_id uuid primary key
    references organizations(id) on delete cascade,

  monthly_allowance integer not null,

  wordpress_author_id bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid
    references auth.users(id) on delete set null,

  constraint athena_getoblic_directory_settings_monthly_allowance_chk
    check (monthly_allowance >= 0),

  constraint athena_getoblic_directory_settings_wordpress_author_id_chk
    check (wordpress_author_id is null or wordpress_author_id > 0)
);

comment on table athena_getoblic_directory_settings is
  'Per-organization GetOblic Directory entitlement. Missing row means not configured (fail closed). monthly_allowance has no invented default. Future Athena V2 Super Admin edits this row after resolving the account to organizations.id.';
comment on column athena_getoblic_directory_settings.monthly_allowance is
  'Configurable non-negative monthly allocation entitlement for the organization tenant. Zero is valid.';
comment on column athena_getoblic_directory_settings.wordpress_author_id is
  'Nullable Athena organization → WordPress user mapping slot. Not provisioned in Phase 2A.';

-- ---------------------------------------------------------------------------
-- athena_getoblic_listing_allocation_events
-- Immutable allocation/consumption ledger. No refunds or negative events.
-- ---------------------------------------------------------------------------
create table if not exists athena_getoblic_listing_allocation_events (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  prospect_id uuid
    references prospects(id) on delete set null,

  listing_link_id uuid
    references athena_getoblic_listing_links(id) on delete set null,

  wordpress_listing_id bigint not null,

  event_kind text not null,

  period_start date not null,

  idempotency_key text not null,

  actor_user_id uuid
    references auth.users(id) on delete set null,
  actor_licensee_account_id uuid
    references licensee_accounts(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint athena_getoblic_listing_allocation_events_wordpress_listing_id_chk
    check (wordpress_listing_id > 0),

  constraint athena_getoblic_listing_allocation_events_event_kind_chk
    check (event_kind in ('allocate_existing', 'create_listing')),

  constraint athena_getoblic_listing_allocation_events_idempotency_key_unique
    unique (idempotency_key),

  constraint athena_getoblic_listing_allocation_events_org_listing_unique
    unique (organization_id, wordpress_listing_id)
);

create index if not exists athena_getoblic_listing_allocation_events_org_period_idx
  on athena_getoblic_listing_allocation_events (organization_id, period_start);

create index if not exists athena_getoblic_listing_allocation_events_listing_link_id_idx
  on athena_getoblic_listing_allocation_events (listing_link_id);

comment on table athena_getoblic_listing_allocation_events is
  'Immutable GetOblic Directory allocation ledger. An organization consumes a wordpress_listing_id at most once over the lifetime of this accounting model. UTC calendar-month period_start. No refunds.';
comment on column athena_getoblic_listing_allocation_events.period_start is
  'First day of the UTC calendar month in which the successful allocation was recorded.';
comment on column athena_getoblic_listing_allocation_events.idempotency_key is
  'Globally unique retry key. Retries must not insert a second consumption.';
comment on column athena_getoblic_listing_allocation_events.event_kind is
  'allocate_existing | create_listing. Written only after a future successful remote acquisition.';
