-- ATHENA V3 — FUNNEL-LINKS-1 — GATE 2
-- Additive tenant-scoped mapping for Prospect Funnel CTA short links.
-- One row per organization, Prospect, and CTA key.
-- Does not alter GetOblic Links browser history, Licensee Useful Links,
-- canonical URL builders, or the Cloudflare Worker.
-- Call your AI is a tel: URI and has no row in this table.
-- Source migration only. Do not apply this file from application code.

create table if not exists athena_prospect_funnel_short_links (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,
  prospect_id uuid not null
    references prospects(id) on delete cascade,

  cta_key text not null,
  destination_url text not null,
  slug text not null,
  short_url text,
  lifecycle text not null,
  replacement_destination_url text,
  replacement_slug text,
  replacement_short_url text,
  replacement_phase text,
  generation integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_prospect_funnel_short_links_identity_key
    unique (organization_id, prospect_id, cta_key),

  constraint athena_prospect_funnel_short_links_slug_key
    unique (slug),

  constraint athena_prospect_funnel_short_links_cta_chk
    check (cta_key in (
      'ai_agents',
      'virtual_phone',
      'calendar',
      'claim_your_ai'
    )),

  constraint athena_prospect_funnel_short_links_lifecycle_chk
    check (lifecycle in ('pending', 'active', 'disabled', 'replacing')),

  constraint athena_prospect_funnel_short_links_generation_chk
    check (generation > 0),

  constraint athena_prospect_funnel_short_links_slug_chk
    check (slug ~ '^[A-Za-z0-9_-]{3,64}$'),

  constraint athena_prospect_funnel_short_links_destination_chk
    check (
      char_length(destination_url) between 24 and 4000
      and destination_url ~ '^https://claim\.getoblic\.com/.+'
      and destination_url !~ '[[:space:][:cntrl:]]'
    ),

  constraint athena_prospect_funnel_short_links_short_url_chk
    check (
      short_url is null
      or (
        char_length(short_url) between 12 and 300
        and short_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9_-]{3,64}$'
      )
    ),

  constraint athena_prospect_funnel_short_links_replacement_slug_chk
    check (
      replacement_slug is null
      or replacement_slug ~ '^[A-Za-z0-9_-]{3,64}$'
    ),

  constraint athena_prospect_funnel_short_links_replacement_destination_chk
    check (
      replacement_destination_url is null
      or (
        char_length(replacement_destination_url) between 24 and 4000
        and replacement_destination_url ~ '^https://claim\.getoblic\.com/.+'
        and replacement_destination_url !~ '[[:space:][:cntrl:]]'
      )
    ),

  constraint athena_prospect_funnel_short_links_replacement_short_url_chk
    check (
      replacement_short_url is null
      or (
        char_length(replacement_short_url) between 12 and 300
        and replacement_short_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9_-]{3,64}$'
      )
    ),

  constraint athena_prospect_funnel_short_links_slug_distinct_chk
    check (replacement_slug is null or replacement_slug <> slug),

  constraint athena_prospect_funnel_short_links_phase_chk
    check (
      replacement_phase is null
      or replacement_phase in ('reserved', 'created')
    ),

  constraint athena_prospect_funnel_short_links_shape_chk
    check (
      (
        lifecycle = 'pending'
        and short_url is null
        and replacement_destination_url is null
        and replacement_slug is null
        and replacement_short_url is null
        and replacement_phase is null
      )
      or (
        lifecycle = 'active'
        and short_url is not null
        and replacement_destination_url is null
        and replacement_slug is null
        and replacement_short_url is null
        and replacement_phase is null
      )
      or (
        lifecycle = 'disabled'
        and short_url is not null
        and replacement_destination_url is null
        and replacement_slug is null
        and replacement_short_url is null
        and replacement_phase is null
      )
      or (
        lifecycle = 'replacing'
        and short_url is not null
        and replacement_destination_url is not null
        and replacement_slug is not null
        and (
          (
            replacement_phase = 'reserved'
            and replacement_short_url is null
          )
          or (
            replacement_phase = 'created'
            and replacement_short_url is not null
          )
        )
      )
    )
);

create unique index if not exists athena_prospect_funnel_short_links_replacement_slug_uidx
  on athena_prospect_funnel_short_links (replacement_slug)
  where replacement_slug is not null;

comment on table athena_prospect_funnel_short_links is
  'Organization-private Prospect Funnel short-link mapping. service_role only. Callers must scope every read and write by the session organization_id. Worker metadata is descriptive and is not authorization.';

comment on column athena_prospect_funnel_short_links.organization_id is
  'Owning organization from the authenticated session. Isolation key.';

comment on column athena_prospect_funnel_short_links.prospect_id is
  'Prospect that was revalidated in that organization before the row was written.';

comment on column athena_prospect_funnel_short_links.cta_key is
  'Prospect Funnel CTA: ai_agents, virtual_phone, calendar, or claim_your_ai. Call your AI is excluded.';

comment on column athena_prospect_funnel_short_links.destination_url is
  'Exact canonical HTTPS destination this mapping was ensured for. Not a client-supplied URL.';

comment on column athena_prospect_funnel_short_links.slug is
  'Published Worker slug. Pending rows reserve a slug before Worker create.';

comment on column athena_prospect_funnel_short_links.short_url is
  'Public short URL for the published slug. Null only while lifecycle is pending.';

comment on column athena_prospect_funnel_short_links.lifecycle is
  'pending: slug reserved, Worker create not yet confirmed. active: short URL may be displayed. disabled: Worker link was disabled with PATCH disabled=true, not merely hidden. replacing: a new slug exists or is reserved and the previous Worker link is not yet retired.';

comment on column athena_prospect_funnel_short_links.generation is
  'Compare-and-swap version. Concurrent ensure calls update a row only when generation still matches.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_prospect_funnel_short_links enable row level security;

revoke all on table athena_prospect_funnel_short_links from public;
revoke all on table athena_prospect_funnel_short_links from anon;
revoke all on table athena_prospect_funnel_short_links from authenticated;

grant all on table athena_prospect_funnel_short_links to service_role;
