-- PC-ID-1B — Organization commercial identity channels.
-- Additive nullable text columns on organizations.
-- Factual storage only. No backfill. No triggers, RPCs, or RLS changes.
-- Does not alter organizations.name, organizations.language, athena_identity,
-- authentication email, quotations, invoices, or prospect conversion.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.
--
-- Version 20261010000004: 20261010000003 is already used by
-- create_athena_client_invoices.

alter table organizations
  add column if not exists whatsapp_number text,
  add column if not exists facebook text,
  add column if not exists instagram text,
  add column if not exists linkedin text,
  add column if not exists google_business_url text,
  add column if not exists category text,
  add column if not exists industry text,
  add column if not exists timezone text;

comment on column organizations.whatsapp_number is
  'Optional WhatsApp contact number. Factual commercial identity only. Not an authentication phone and not used to send messages.';

comment on column organizations.facebook is
  'Optional Facebook URL. Factual commercial identity only. Not used by Social Planner or advertising.';

comment on column organizations.instagram is
  'Optional Instagram URL. Factual commercial identity only. Not used by Social Planner or advertising.';

comment on column organizations.linkedin is
  'Optional LinkedIn URL. Factual commercial identity only. Not used by Social Planner or advertising.';

comment on column organizations.google_business_url is
  'Optional Google Business URL. Factual commercial identity only. Not a GetOblic region, place id, or listing claim.';

comment on column organizations.category is
  'Optional business category. Factual commercial identity only. Distinct from industry. Not seeded into athena_identity.';

comment on column organizations.industry is
  'Optional business industry. Factual commercial identity only. Distinct from category. Not seeded into athena_identity.';

comment on column organizations.timezone is
  'Optional factual timezone text. Not used for scheduling, Social Planner, or generation.';
