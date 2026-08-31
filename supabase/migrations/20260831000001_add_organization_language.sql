-- Organization-wide operating language for ordinary Athena accounts.
-- Authoritative account configuration. Not a user preference.
-- Not inferred from website html_language, hreflang, Persona languages,
-- geographic_reach, browser locale, or Social Planner geography.
-- Existing organizations receive English via NOT NULL DEFAULT.
-- Changing this value must not retrain Brain, Deep Scrape, or regenerate artifacts.

alter table organizations
  add column if not exists language text not null default 'en';

alter table organizations
  drop constraint if exists organizations_language_check;

alter table organizations
  add constraint organizations_language_check
  check (language in ('en', 'fr', 'es', 'it', 'de', 'pt'));

comment on column organizations.language is
  'Organization-wide operating language (en, fr, es, it, de, pt). Authoritative account configuration; default English for existing and newly created organizations until initiation supplies an explicit value.';
