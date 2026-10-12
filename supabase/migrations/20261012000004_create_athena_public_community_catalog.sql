-- ATHENA V3 — COMMUNITY-INTELLIGENCE-1 — GATE 3A
-- Additive global public community catalog and organization-private saves.
-- Does not alter communities, discussions, athena_community_intelligence,
-- Intelligence Domains, workers, or generation jobs.
-- No alias table. No action-request table. No provider.
-- Source migration only. Do not apply this file from application code.
--
-- V1 identity: Facebook Groups URLs normalize to one group key. Scheme, host,
-- trailing slash, query, fragment, and group subpages are not separate
-- identities. A numeric id and a vanity slug stay distinct until a later gate
-- can prove they are the same community. That proof needs a provider, so no
-- alias table is created. Reddit is not implemented in this migration.

create table if not exists athena_public_communities (
  id uuid primary key default gen_random_uuid(),

  platform text not null,
  canonical_identity text not null,
  canonical_url text not null,
  display_name text not null,

  source text not null,
  sourced_at timestamptz not null,

  suppression_state text not null default 'active',
  suppressed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_public_communities_platform_chk
    check (platform = 'facebook_groups'),

  constraint athena_public_communities_identity_chk
    check (
      char_length(canonical_identity) between 2 and 80
      and canonical_identity ~ '^[a-z0-9]([a-z0-9]|[-.][a-z0-9])*$'
      and (
        canonical_identity !~ '^[0-9]+$'
        or canonical_identity ~ '^[1-9][0-9]{5,19}$'
      )
      and canonical_identity not in (
        'feed',
        'discover',
        'search',
        'create',
        'joins',
        'categories',
        'category'
      )
    ),

  constraint athena_public_communities_canonical_url_chk
    check (
      platform = 'facebook_groups'
      and canonical_url = 'https://www.facebook.com/groups/' || canonical_identity
    ),

  constraint athena_public_communities_display_name_chk
    check (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 200
      and display_name !~ '[[:cntrl:]]'
    ),

  constraint athena_public_communities_source_chk
    check (source = 'public_url'),

  constraint athena_public_communities_suppression_chk
    check (
      (
        suppression_state = 'active'
        and suppressed_at is null
      )
      or (
        suppression_state = 'suppressed'
        and suppressed_at is not null
      )
    ),

  constraint athena_public_communities_platform_identity_key
    unique (platform, canonical_identity),

  constraint athena_public_communities_canonical_url_key
    unique (canonical_url)
);

comment on table athena_public_communities is
  'Global public community catalog. Facebook Groups is the only V1 platform. Rows contain public identity, public display name, public URL provenance, and global suppression. No organization-private data. service_role only.';

comment on column athena_public_communities.platform is
  'Public platform id. V1 allows facebook_groups only. Reddit is not implemented.';

comment on column athena_public_communities.canonical_identity is
  'Normalized public group key: lowercase vanity slug, or a 6 to 20 digit id without a leading zero. Not an organization label.';

comment on column athena_public_communities.canonical_url is
  'Public https://www.facebook.com/groups/{canonical_identity} URL. Derived from the identity.';

comment on column athena_public_communities.display_name is
  'Public community name, trimmed, 1 to 200 characters. Not a private organization note.';

comment on column athena_public_communities.source is
  'Public provenance. V1 records public_url only. No provider and no organization id.';

comment on column athena_public_communities.sourced_at is
  'When the public URL identity was observed. Distinct from created_at.';

comment on column athena_public_communities.suppression_state is
  'Global catalog visibility: active, or suppressed with suppressed_at set. Not organization-specific relevance.';

create table if not exists athena_organization_communities (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  community_id uuid not null
    references athena_public_communities(id) on delete restrict,

  qualification text not null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_organization_communities_pair_key
    unique (organization_id, community_id),

  constraint athena_organization_communities_qualification_chk
    check (qualification in ('relevant', 'not_relevant')),

  constraint athena_organization_communities_notes_chk
    check (
      notes is null
      or (
        notes = btrim(notes)
        and char_length(notes) between 1 and 2000
        and notes !~ '[[:cntrl:]]'
      )
    )
);

comment on table athena_organization_communities is
  'Organization-private saved relationship to one public community. Qualification and notes stay on this row. service_role only. Callers must scope every read and write by organization_id.';

comment on column athena_organization_communities.organization_id is
  'Owning organization. Isolation key. Deleting the organization deletes only its saves. Not stored on athena_public_communities.';

comment on column athena_organization_communities.community_id is
  'Public catalog row. Removal is restricted while a save exists. Hide a public community with suppression_state instead.';

comment on column athena_organization_communities.qualification is
  'Organization-private qualification: relevant or not_relevant. Not a score and not shared across organizations.';

comment on column athena_organization_communities.notes is
  'Optional organization-private note. Null, or trimmed text of 1 to 2000 characters. Never written to the public catalog.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_public_communities enable row level security;

revoke all on table athena_public_communities from public;
revoke all on table athena_public_communities from anon;
revoke all on table athena_public_communities from authenticated;

grant all on table athena_public_communities to service_role;

alter table athena_organization_communities enable row level security;

revoke all on table athena_organization_communities from public;
revoke all on table athena_organization_communities from anon;
revoke all on table athena_organization_communities from authenticated;

grant all on table athena_organization_communities to service_role;
