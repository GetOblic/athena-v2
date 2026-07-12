-- Prospect Intelligence (V3.3 Phase 1)
-- First-class Executive Intelligence Source.
-- Generation reuses the existing Discussion Executive pipeline via linked_discussion_id
-- (temporary compatibility bridge; replaceable by a source-agnostic adapter later).

create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  community_id uuid references communities(id) on delete set null,

  -- Temporary bridge into the shared durable generation / version pipeline.
  -- Never expose this identifier in user-facing copy.
  linked_discussion_id uuid references discussions(id) on delete set null,

  business_name text not null,
  website text,
  linkedin text,
  facebook text,
  instagram text,
  industry text,
  category text,
  country text,
  state text,
  city text,
  address text,
  company_size text,
  revenue text,
  employee_count text,
  technologies text,
  pain_points text,
  decision_maker text,
  job_title text,
  email text,
  phone text,
  google_business_url text,
  notes text,
  additional_context text,
  source text not null default 'manual',

  -- Executive-facing readiness status (derived/updated from durable jobs).
  status text not null default 'Queued',
  opportunity_score integer,
  priority integer not null default 1,

  -- Normalized homepage-only website intelligence extract.
  website_intelligence jsonb,
  raw_json jsonb,

  last_activity timestamptz,
  import_batch_id uuid
);

create index if not exists prospects_organization_id_idx
  on prospects (organization_id);

create index if not exists prospects_organization_created_idx
  on prospects (organization_id, created_at desc);

create index if not exists prospects_organization_status_idx
  on prospects (organization_id, status);

create index if not exists prospects_linked_discussion_id_idx
  on prospects (linked_discussion_id);

create index if not exists prospects_import_batch_id_idx
  on prospects (import_batch_id);

-- Primary duplicate rule: same organization + normalized website.
create unique index if not exists prospects_org_website_unique
  on prospects (organization_id, lower(website))
  where website is not null and length(trim(website)) > 0;

-- Secondary duplicate rule for website-less rows: org + business name + city.
create unique index if not exists prospects_org_name_city_unique
  on prospects (organization_id, lower(business_name), lower(coalesce(city, '')))
  where website is null;

comment on table prospects is
  'Prospect Executive Intelligence Source. Generation currently bridges via linked_discussion_id.';

comment on column prospects.linked_discussion_id is
  'Temporary compatibility bridge into the shared Discussion generation/version pipeline. Not user-facing.';

comment on column prospects.website_intelligence is
  'Normalized homepage-only website intelligence extract.';

comment on column prospects.status is
  'Executive-facing status: Queued, Processing, Learning from Website, Generating Executive Intelligence, Ready, Processing Failed.';
