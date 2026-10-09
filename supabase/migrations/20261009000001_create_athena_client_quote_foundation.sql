-- EST-QUOTE-1C.1R — Canonical Prospect and Organization commercial identity,
-- plus the Licensee client quotation persistence foundation.
-- Additive only. Does not alter athena_estimates, athena_identity,
-- organization brand columns, licensee_accounts, workers, or /licensee/quote.
-- Existing column names stay in place. No backfill.
-- prospects.business_name and organizations.name stay the display names.
-- Website stays on athena_identity.website.
-- organizations.business_email is the commercial contact email, not the login email.
-- Issued-quote immutability is enforced by the pure domain layer.
-- There is no row-rewrite trigger and no authenticated table access.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- prospects commercial identity
-- Nullable additions. business_name, address, and contact columns stay.
-- ---------------------------------------------------------------------------
alter table prospects
  add column if not exists legal_name text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists registration_number text,
  add column if not exists tax_identifier text,
  add column if not exists tax_identifier_label text;

comment on column prospects.legal_name is
  'Legal name printed on quotations. Nullable. business_name remains the prospect display name.';

comment on column prospects.address_line2 is
  'Second address line. Nullable. prospects.address remains line 1.';

comment on column prospects.postal_code is
  'Postal code. Nullable.';

comment on column prospects.registration_number is
  'Company registration number. Nullable.';

comment on column prospects.tax_identifier is
  'Tax identifier. Nullable. tax_identifier_label optionally names the scheme.';

comment on column prospects.tax_identifier_label is
  'Short label for tax_identifier, such as VAT or GST. Nullable.';

-- ---------------------------------------------------------------------------
-- organizations commercial identity
-- Nullable additions. name, slug, and brand columns stay.
-- Website stays on athena_identity.website.
-- ---------------------------------------------------------------------------
alter table organizations
  add column if not exists legal_name text,
  add column if not exists address text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists phone text,
  add column if not exists business_email text,
  add column if not exists decision_maker text,
  add column if not exists job_title text,
  add column if not exists registration_number text,
  add column if not exists tax_identifier text,
  add column if not exists tax_identifier_label text;

comment on column organizations.legal_name is
  'Legal name printed on quotations. Nullable. organizations.name remains the display name.';

comment on column organizations.address is
  'First commercial address line. Nullable.';

comment on column organizations.address_line2 is
  'Second commercial address line. Nullable.';

comment on column organizations.business_email is
  'Commercial contact email printed on quotations. Nullable. Not the account login email.';

comment on column organizations.decision_maker is
  'Commercial contact name. Nullable.';

comment on column organizations.job_title is
  'Commercial contact job title. Nullable.';

comment on column organizations.registration_number is
  'Company registration number. Nullable.';

comment on column organizations.tax_identifier is
  'Tax identifier. Nullable. tax_identifier_label optionally names the scheme.';

comment on column organizations.tax_identifier_label is
  'Short label for tax_identifier, such as VAT or GST. Nullable.';

-- ---------------------------------------------------------------------------
-- athena_client_quotes
-- Licensee-owned commercial quotations.
-- organization_id is operational context, never sole authority.
-- source_estimate_id is nullable and clears if the Estimate row is deleted.
-- source_estimate_snapshot.estimateId keeps that original identifier.
-- ---------------------------------------------------------------------------
create table if not exists athena_client_quotes (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete restrict,

  requested_by uuid
    references auth.users(id) on delete set null,

  source_estimate_id uuid
    references athena_estimates(id) on delete set null,

  source_estimate_snapshot jsonb,

  revised_from_quote_id uuid
    references athena_client_quotes(id) on delete set null,

  status text not null,

  content_language text not null,

  currency_code text not null,

  draft_json jsonb not null,

  issued_snapshot_json jsonb,

  quote_number text,

  issued_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_client_quotes_status_chk
    check (status in ('draft', 'issued')),

  constraint athena_client_quotes_content_language_chk
    check (content_language in ('en', 'fr', 'es', 'it', 'de', 'pt')),

  constraint athena_client_quotes_currency_code_chk
    check (currency_code ~ '^[A-Z]{3}$'),

  constraint athena_client_quotes_quote_number_chk
    check (
      quote_number is null
      or (
        quote_number = btrim(quote_number)
        and char_length(quote_number) between 1 and 40
      )
    ),

  constraint athena_client_quotes_draft_shape_chk
    check (
      status <> 'draft'
      or (
        issued_snapshot_json is null
        and issued_at is null
        and quote_number is null
      )
    ),

  constraint athena_client_quotes_issued_shape_chk
    check (
      status <> 'issued'
      or (
        issued_snapshot_json is not null
        and issued_at is not null
        and quote_number is not null
      )
    ),

  constraint athena_client_quotes_draft_json_chk
    check (
      jsonb_typeof(draft_json) = 'object'
      and draft_json->>'schemaVersion' = 'client_quote_draft_v1'
    ),

  constraint athena_client_quotes_issued_snapshot_chk
    check (
      issued_snapshot_json is null
      or (
        jsonb_typeof(issued_snapshot_json) = 'object'
        and issued_snapshot_json->>'schemaVersion' = 'client_quote_issued_v1'
      )
    ),

  constraint athena_client_quotes_source_snapshot_chk
    check (
      source_estimate_snapshot is null
      or (
        jsonb_typeof(source_estimate_snapshot) = 'object'
        and source_estimate_snapshot->>'schemaVersion' = 'client_quote_source_estimate_v1'
        and jsonb_typeof(source_estimate_snapshot->'estimateId') = 'string'
        and source_estimate_snapshot->>'estimateId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(source_estimate_snapshot->'currencyCode') = 'string'
        and jsonb_typeof(source_estimate_snapshot->'recommendedClientPriceMinor') = 'number'
      )
    ),

  constraint athena_client_quotes_revised_from_not_self_chk
    check (
      revised_from_quote_id is null
      or revised_from_quote_id <> id
    )
);

create index if not exists athena_client_quotes_licensee_created_idx
  on athena_client_quotes (licensee_account_id, created_at desc);

create index if not exists athena_client_quotes_licensee_org_created_idx
  on athena_client_quotes (licensee_account_id, organization_id, created_at desc);

create index if not exists athena_client_quotes_licensee_status_idx
  on athena_client_quotes (licensee_account_id, status);

create index if not exists athena_client_quotes_source_estimate_idx
  on athena_client_quotes (source_estimate_id)
  where source_estimate_id is not null;

create index if not exists athena_client_quotes_revised_from_idx
  on athena_client_quotes (revised_from_quote_id)
  where revised_from_quote_id is not null;

create unique index if not exists athena_client_quotes_licensee_quote_number_uidx
  on athena_client_quotes (licensee_account_id, quote_number)
  where quote_number is not null;

comment on table athena_client_quotes is
  'Licensee client quotations. draft_json is the editable working document. issued_snapshot_json is the immutable commercial document for a later PDF and does not depend on the source Estimate or live organization identity. service_role only.';

comment on column athena_client_quotes.licensee_account_id is
  'Owning Licensee Master account. Authorization key. Cascade-deletes quotations with the Licensee account.';

comment on column athena_client_quotes.organization_id is
  'Operational client-organization context. ON DELETE RESTRICT preserves quotation history. Never sole authorization.';

comment on column athena_client_quotes.source_estimate_id is
  'Optional FK to the Ready Estimate that seeded the quotation. ON DELETE SET NULL. Null does not clear source_estimate_snapshot.';

comment on column athena_client_quotes.source_estimate_snapshot is
  'Copied source Estimate identifier and price metadata. estimateId is retained after source_estimate_id becomes null. Must not include prospect_generation_context_json.';

comment on column athena_client_quotes.revised_from_quote_id is
  'Issued quotation this draft revises. The original row stays issued and unchanged. ON DELETE SET NULL.';

comment on column athena_client_quotes.status is
  'draft | issued. Draft rows have null quote_number, issued_at, and issued_snapshot_json. Issued rows require all three.';

comment on column athena_client_quotes.content_language is
  'Quotation language. Same set as organization languages: en, fr, es, it, de, pt.';

comment on column athena_client_quotes.currency_code is
  'ISO 4217 alphabetic code. Monetary amounts inside JSON are integer minor units of this currency.';

comment on column athena_client_quotes.draft_json is
  'Versioned client_quote_draft_v1 working document. Totals are domain-calculated. Editable only while status is draft.';

comment on column athena_client_quotes.issued_snapshot_json is
  'Versioned client_quote_issued_v1 freeze. Sufficient to reproduce the commercial quotation without reading the Estimate or live organization identity.';

comment on column athena_client_quotes.quote_number is
  'Assigned when the quotation is issued. Unique per Licensee when present. Null on drafts, including revisions.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_client_quotes enable row level security;

revoke all on table athena_client_quotes from public;
revoke all on table athena_client_quotes from anon;
revoke all on table athena_client_quotes from authenticated;

grant all on table athena_client_quotes to service_role;
