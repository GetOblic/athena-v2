-- Athena V14 Stage 1 — Persona Intelligence Source (isolated table + indexes).
-- Additive only. Does not alter prospects, shared CHECKs, deep-scrape jobs,
-- asset interactions, or generation trigger constraints.

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  community_id uuid references communities(id) on delete set null,

  -- Temporary bridge into the shared durable generation / version pipeline.
  -- Never expose this identifier in user-facing copy. Stage 1 does not create bridges.
  linked_discussion_id uuid references discussions(id) on delete set null,

  -- Optional descriptive fields (all nullable).
  persona_name text,
  short_description text,
  category text,
  gender_identity text,
  age_range text,
  birth_year_approx text,
  generation text,
  cultural_background text,
  country text,
  state text,
  city text,
  location_summary text,
  languages text,
  relationship_status text,
  household text,
  income_range text,
  purchasing_power text,
  education text,
  occupation text,
  seniority text,
  industry_context text,
  lifestyle text,
  interests text,
  digital_behavior text,
  brands_influences text,
  values_text text,
  aesthetic_preferences text,
  preferred_imagery text,
  goals text,
  needs text,
  pain_points text,
  fears text,
  motivations text,
  objections text,
  buying_triggers text,
  decision_criteria text,
  purchase_behavior text,
  typical_concerns text,
  communication_style text,
  preferred_channels text,
  reference_website text,
  notes text,
  additional_context text,
  ads_content text,

  source text not null default 'manual',
  status text not null default 'Queued',
  lifecycle_status text not null default 'New',
  opportunity_score integer,
  priority integer not null default 1,

  profile_json jsonb,
  raw_json jsonb,
  reference_website_intelligence jsonb,

  last_activity timestamptz,
  import_batch_id uuid,
  last_deep_scrape_at timestamptz,
  last_deep_scrape_pages integer
);

create index if not exists personas_organization_id_idx
  on personas (organization_id);

create index if not exists personas_organization_created_idx
  on personas (organization_id, created_at desc);

create index if not exists personas_organization_status_idx
  on personas (organization_id, status);

create index if not exists personas_linked_discussion_id_idx
  on personas (linked_discussion_id);

create index if not exists personas_import_batch_id_idx
  on personas (import_batch_id);

-- Primary duplicate rule: same organization + normalized Reference Website.
create unique index if not exists personas_org_reference_website_unique
  on personas (organization_id, lower(reference_website))
  where reference_website is not null and length(trim(reference_website)) > 0;

-- Secondary duplicate rule for website-less rows with a non-empty Persona Name.
-- Context-only Personas (no name, no Reference Website) are intentionally unconstrained.
create unique index if not exists personas_org_label_city_unique
  on personas (
    organization_id,
    lower(coalesce(persona_name, '')),
    lower(coalesce(city, ''))
  )
  where reference_website is null
    and persona_name is not null
    and length(trim(persona_name)) > 0;

comment on table personas is
  'Persona Executive Intelligence Source (archetype). Generation bridges via linked_discussion_id in later stages.';

comment on column personas.linked_discussion_id is
  'Temporary compatibility bridge into the shared Discussion generation/version pipeline. Not user-facing.';

comment on column personas.reference_website is
  'Optional research Reference Website. Normalized URL when valid; invalid inputs retained in raw_json.';

comment on column personas.reference_website_intelligence is
  'Normalized homepage/deep Reference Website intelligence extract.';

comment on column personas.profile_json is
  'Flexible structured Persona attribute bag (aliases, demographics detail, etc.).';

comment on column personas.additional_context is
  'Primary natural-language Persona intelligence input. Distinct from notes and ads_content.';

comment on column personas.notes is
  'Operator notes. Distinct from additional_context and ads_content.';

comment on column personas.ads_content is
  'Optional advertising / creative evidence. Distinct from notes and additional_context.';

comment on column personas.status is
  'Executive-facing readiness status: Queued, Processing, Learning from Website, Generating Executive Intelligence, Ready, Processing Failed.';

comment on column personas.lifecycle_status is
  'Client-managed Persona lifecycle. Distinct from intelligence readiness in status.';
