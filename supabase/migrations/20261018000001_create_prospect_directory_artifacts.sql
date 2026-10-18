-- Athena V3 — shared GetOblic Description and Knowledge Base artifacts.
-- One saved row per source Prospect and artifact type.
-- organization_id is the Prospect's source organization. The composite
-- foreign key requires prospects (id, organization_id) to stay paired.
-- Approved content is stored on this table. source_executive_version_id
-- is optional provenance only. This migration does not rewrite Executive
-- Intelligence, the legacy generated_listing_description column, or
-- Knowledge Base assets.
-- Description backfill is insert-only and conflict-safe. Re-running it
-- does not replace an existing artifact.
-- service_role only. No browser policies and no new database function.
-- Do not apply this migration from application code.
-- Apply manually in the Supabase SQL Editor.

-- Composite foreign keys need a unique key on the referenced pair.
-- prospects.id is already the primary key, so this adds no second owner.
create unique index if not exists prospects_id_organization_id_key
  on prospects (id, organization_id);

-- ---------------------------------------------------------------------------
-- prospect_directory_artifacts
-- Durable saved Description and Knowledge Base for the original Prospect.
-- ---------------------------------------------------------------------------
create table if not exists prospect_directory_artifacts (
  prospect_id uuid not null,
  organization_id uuid not null,
  artifact_type text not null,
  revision integer not null,
  content text not null,
  content_sha256 text not null,
  origin text not null,
  source_executive_version_id uuid null
    references athena_executive_intelligence_versions(id) on delete set null,
  saved_at timestamptz not null default now(),
  saved_by_organization_id uuid null
    references organizations(id) on delete set null,

  constraint prospect_directory_artifacts_pkey
    primary key (prospect_id, artifact_type),

  constraint prospect_directory_artifacts_prospect_owner_fk
    foreign key (prospect_id, organization_id)
    references prospects (id, organization_id)
    on delete cascade,

  constraint prospect_directory_artifacts_type_chk
    check (artifact_type in ('description', 'knowledge_base')),

  constraint prospect_directory_artifacts_revision_chk
    check (revision >= 1),

  constraint prospect_directory_artifacts_origin_chk
    check (origin in ('generated', 'edited')),

  constraint prospect_directory_artifacts_content_chk
    check (
      char_length(content) >= 1
      and content = regexp_replace(content, '^[[:space:]]+|[[:space:]]+$', '', 'g')
      and (
        (
          artifact_type = 'description'
          and char_length(content) <= 4000
        )
        or (
          artifact_type = 'knowledge_base'
          and char_length(content) <= 100000
        )
      )
    ),

  constraint prospect_directory_artifacts_content_sha256_chk
    check (content_sha256 ~ '^[0-9a-f]{64}$')
);

comment on table prospect_directory_artifacts is
  'Saved GetOblic Description and Knowledge Base for the source Prospect. One row per prospect_id and artifact_type. organization_id must match prospects.organization_id. service_role only.';

comment on column prospect_directory_artifacts.prospect_id is
  'Original source Prospect. Paired with organization_id. ON DELETE CASCADE removes saved artifacts with that Prospect.';

comment on column prospect_directory_artifacts.organization_id is
  'Source organization that owns the Prospect. Composite FK rejects a foreign organization.';

comment on column prospect_directory_artifacts.artifact_type is
  'description | knowledge_base. Unique together with prospect_id.';

comment on column prospect_directory_artifacts.revision is
  'Positive integer. The first save stores 1. A later save stores the previous revision plus one only when that previous revision still matches.';

comment on column prospect_directory_artifacts.content is
  'Approved artifact text. Independent of Executive Intelligence. Description is at most 4000 characters. Knowledge Base is at most 100000 characters.';

comment on column prospect_directory_artifacts.content_sha256 is
  'Lowercase hex SHA-256 of the UTF-8 content. Backfill uses extensions.digest(convert_to(content, ''UTF8''), ''sha256'').';

comment on column prospect_directory_artifacts.origin is
  'generated | edited. Description backfill stores generated.';

comment on column prospect_directory_artifacts.source_executive_version_id is
  'Optional provenance. ON DELETE SET NULL keeps the saved content if that immutable version row is removed. This column is not a live read of Executive Intelligence.';

comment on column prospect_directory_artifacts.saved_at is
  'When this revision was saved. Description backfill uses prospects.updated_at when present.';

comment on column prospect_directory_artifacts.saved_by_organization_id is
  'Organization that saved this revision. Nullable provenance. Description backfill stores the source organization. ON DELETE SET NULL clears only this column if that organization is removed. Ownership remains the composite Prospect key.';

alter table prospect_directory_artifacts enable row level security;

revoke all on table prospect_directory_artifacts from public;
revoke all on table prospect_directory_artifacts from anon;
revoke all on table prospect_directory_artifacts from authenticated;

grant all on table prospect_directory_artifacts to service_role;

-- ---------------------------------------------------------------------------
-- Description backfill
-- Import only a non-empty trimmed description of at most 4000 characters.
-- Insert-only. An existing artifact wins. The legacy column is not rewritten.
-- Knowledge Base is not imported from Executive Intelligence.
-- ---------------------------------------------------------------------------
insert into prospect_directory_artifacts (
  prospect_id,
  organization_id,
  artifact_type,
  revision,
  content,
  content_sha256,
  origin,
  source_executive_version_id,
  saved_at,
  saved_by_organization_id
)
select
  p.id,
  p.organization_id,
  'description',
  1,
  regexp_replace(
    p.generated_listing_description->>'description',
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  ),
  encode(
    extensions.digest(
      convert_to(
        regexp_replace(
          p.generated_listing_description->>'description',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'generated',
  null,
  coalesce(p.updated_at, now()),
  p.organization_id
from prospects p
where jsonb_typeof(p.generated_listing_description) = 'object'
  and jsonb_typeof(p.generated_listing_description->'description') = 'string'
  and char_length(
    regexp_replace(
      p.generated_listing_description->>'description',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    )
  ) between 1 and 4000
on conflict (prospect_id, artifact_type) do nothing;
