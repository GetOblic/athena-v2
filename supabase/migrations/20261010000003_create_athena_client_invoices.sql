-- CQ-INV-1C — Licensee client invoice persistence foundation.
-- Additive only. Does not alter athena_client_quotes, athena_estimates,
-- athena_client_quote_templates, organizations, workers, or quotation routes.
-- Issued-invoice immutability stays in the pure domain layer.
-- There is no row-rewrite trigger, no numbering function, and no
-- authenticated table access. No backfill.
-- Invoice numbers are I-YYYY-#### and are allocated by a later service gate.
-- The civil issueDate lives inside issued_snapshot_json.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- athena_client_invoices
-- Licensee-owned commercial invoices created from an issued quotation.
-- organization_id is operational context, never sole authority.
-- source_quote_id stays set. Deleting the quotation is restricted.
-- source_quote_snapshot keeps the quotation identity on the invoice.
-- One non-deleted invoice, draft or issued, occupies a quotation.
-- Masked invoices keep their invoice numbers.
-- ---------------------------------------------------------------------------
create table if not exists athena_client_invoices (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete restrict,

  requested_by uuid
    references auth.users(id) on delete set null,

  source_quote_id uuid not null
    references athena_client_quotes(id) on delete restrict,

  source_quote_snapshot jsonb not null,

  status text not null,

  content_language text not null,

  currency_code text not null,

  draft_json jsonb not null,

  issued_snapshot_json jsonb,

  invoice_number text,

  issued_at timestamptz,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_client_invoices_status_chk
    check (status in ('draft', 'issued')),

  constraint athena_client_invoices_content_language_chk
    check (content_language in ('en', 'fr', 'es', 'it', 'de', 'pt')),

  constraint athena_client_invoices_currency_code_chk
    check (currency_code ~ '^[A-Z]{3}$'),

  constraint athena_client_invoices_invoice_number_chk
    check (
      invoice_number is null
      or (
        invoice_number = btrim(invoice_number)
        and char_length(invoice_number) between 1 and 40
      )
    ),

  constraint athena_client_invoices_draft_shape_chk
    check (
      status <> 'draft'
      or (
        issued_snapshot_json is null
        and issued_at is null
        and invoice_number is null
      )
    ),

  constraint athena_client_invoices_issued_shape_chk
    check (
      status <> 'issued'
      or (
        issued_snapshot_json is not null
        and issued_at is not null
        and invoice_number is not null
      )
    ),

  constraint athena_client_invoices_draft_json_chk
    check (
      jsonb_typeof(draft_json) = 'object'
      and draft_json->>'schemaVersion' = 'client_invoice_draft_v1'
      and jsonb_typeof(draft_json->'sourceQuote') = 'object'
      and draft_json->'sourceQuote'->>'schemaVersion' = 'client_invoice_source_quote_v1'
      and draft_json->'sourceQuote'->>'quoteId' = source_quote_id::text
    ),

  constraint athena_client_invoices_issued_snapshot_chk
    check (
      issued_snapshot_json is null
      or (
        jsonb_typeof(issued_snapshot_json) = 'object'
        and issued_snapshot_json->>'schemaVersion' = 'client_invoice_issued_v1'
        and jsonb_typeof(issued_snapshot_json->'issueDate') = 'string'
        and issued_snapshot_json->>'invoiceNumber' = invoice_number
        and issued_snapshot_json->'sourceQuote'->>'quoteId' = source_quote_id::text
      )
    ),

  constraint athena_client_invoices_source_snapshot_chk
    check (
      jsonb_typeof(source_quote_snapshot) = 'object'
      and source_quote_snapshot->>'schemaVersion' = 'client_invoice_source_quote_v1'
      and source_quote_snapshot->>'quoteId' = source_quote_id::text
      and source_quote_snapshot->>'quoteId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(source_quote_snapshot->'quoteNumber') = 'string'
      and jsonb_typeof(source_quote_snapshot->'quoteIssuedAt') = 'string'
      and source_quote_snapshot->>'quoteSchemaVersion' = 'client_quote_issued_v1'
      and (
        jsonb_typeof(source_quote_snapshot->'sourceEstimateId') = 'null'
        or (
          jsonb_typeof(source_quote_snapshot->'sourceEstimateId') = 'string'
          and source_quote_snapshot->>'sourceEstimateId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    )
);

create index if not exists athena_client_invoices_licensee_active_created_idx
  on athena_client_invoices (licensee_account_id, created_at desc)
  where deleted_at is null;

create index if not exists athena_client_invoices_licensee_org_active_created_idx
  on athena_client_invoices (licensee_account_id, organization_id, created_at desc)
  where deleted_at is null;

create index if not exists athena_client_invoices_licensee_active_status_idx
  on athena_client_invoices (licensee_account_id, status)
  where deleted_at is null;

create unique index if not exists athena_client_invoices_licensee_invoice_number_uidx
  on athena_client_invoices (licensee_account_id, invoice_number)
  where invoice_number is not null;

create unique index if not exists athena_client_invoices_active_source_quote_uidx
  on athena_client_invoices (source_quote_id)
  where deleted_at is null;

comment on table athena_client_invoices is
  'Licensee client invoices. draft_json is the editable working document. issued_snapshot_json is the immutable commercial document, including the civil issueDate, and does not depend on the live quotation or organization identity. service_role only.';

comment on column athena_client_invoices.licensee_account_id is
  'Owning Licensee Master account. Authorization key. Cascade-deletes invoices with the Licensee account.';

comment on column athena_client_invoices.organization_id is
  'Operational client-organization context. ON DELETE RESTRICT preserves invoice history. Never sole authorization.';

comment on column athena_client_invoices.requested_by is
  'Authenticated user who requested the invoice. ON DELETE SET NULL. Null does not transfer ownership.';

comment on column athena_client_invoices.source_quote_id is
  'Issued quotation this invoice was created from. Required. ON DELETE RESTRICT. One non-deleted invoice, including a draft, may occupy the quotation.';

comment on column athena_client_invoices.source_quote_snapshot is
  'Versioned client_invoice_source_quote_v1 provenance. quoteId matches source_quote_id. Retained so the invoice does not read the live quotation for identity.';

comment on column athena_client_invoices.status is
  'draft | issued. Draft rows have null invoice_number, issued_at, and issued_snapshot_json. Issued rows require all three.';

comment on column athena_client_invoices.content_language is
  'Invoice language. Same set as organization languages: en, fr, es, it, de, pt.';

comment on column athena_client_invoices.currency_code is
  'ISO 4217 alphabetic code locked to the originating quotation. Monetary amounts inside JSON are integer minor units of this currency.';

comment on column athena_client_invoices.draft_json is
  'Versioned client_invoice_draft_v1 working document. sourceQuote.quoteId matches source_quote_id. Totals are domain-calculated. Editable only while status is draft.';

comment on column athena_client_invoices.issued_snapshot_json is
  'Versioned client_invoice_issued_v1 freeze. Holds the civil issueDate. invoiceNumber matches invoice_number. Null on drafts.';

comment on column athena_client_invoices.invoice_number is
  'Assigned when the invoice is issued. Form I-YYYY-#### is allocated by a later service gate. Unique per Licensee when present, including masked invoices. Null on drafts.';

comment on column athena_client_invoices.issued_at is
  'UTC timestamp assigned when the invoice is issued. Null on drafts. The civil issueDate is not stored in a separate column.';

comment on column athena_client_invoices.deleted_at is
  'Soft-mask timestamp. Null keeps the invoice in the active library. A timestamp hides it from ordinary lists. The row and invoice number stay, and the number remains unique for the Licensee.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_client_invoices enable row level security;

revoke all on table athena_client_invoices from public;
revoke all on table athena_client_invoices from anon;
revoke all on table athena_client_invoices from authenticated;

grant all on table athena_client_invoices to service_role;
