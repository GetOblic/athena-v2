-- EST-QUOTE-2B.2 — Licensee-owned reusable quotation service templates.
-- Additive only. Does not alter athena_client_quotes, athena_estimates,
-- organizations, workers, or /licensee/quote.
-- Quotations do not reference this table. Copy-on-insert copies values only.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.

create table if not exists athena_client_quote_templates (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  name text not null,
  description text not null,

  quantity_coefficient bigint not null,
  quantity_scale integer not null,

  unit_price_minor bigint not null,
  currency_code text not null,
  billing_frequency text not null,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_client_quote_templates_name_chk
    check (
      name = btrim(name)
      and char_length(name) between 1 and 200
    ),

  constraint athena_client_quote_templates_description_chk
    check (
      description = btrim(description)
      and char_length(description) between 1 and 500
    ),

  constraint athena_client_quote_templates_quantity_coefficient_chk
    check (
      quantity_coefficient between 1 and 1000000000000
    ),

  constraint athena_client_quote_templates_quantity_scale_chk
    check (quantity_scale between 0 and 4),

  constraint athena_client_quote_templates_unit_price_minor_chk
    check (
      unit_price_minor between 0 and 9007199254740991
    ),

  constraint athena_client_quote_templates_currency_code_chk
    check (currency_code ~ '^[A-Z]{3}$'),

  constraint athena_client_quote_templates_billing_frequency_chk
    check (
      billing_frequency in ('one_time', 'monthly', 'quarterly', 'annually')
    )
);

create index if not exists athena_client_quote_templates_licensee_active_created_idx
  on athena_client_quote_templates (licensee_account_id, created_at desc)
  where deleted_at is null;

comment on table athena_client_quote_templates is
  'Licensee catalog of reusable quotation services. Commercial values are copied onto a quotation line. The quotation does not store a template foreign key. service_role only.';

comment on column athena_client_quote_templates.licensee_account_id is
  'Owning Licensee Master account. Authorization key. Derived from the authenticated Master, never from the client. Cascade-deletes templates with the Licensee account.';

comment on column athena_client_quote_templates.name is
  'Catalog label. Trimmed, 1 to 200 characters. Not copied onto the quotation line.';

comment on column athena_client_quote_templates.description is
  'Line description copied onto a quotation. Trimmed, 1 to 500 characters. Same maximum as a quotation line description.';

comment on column athena_client_quote_templates.quantity_coefficient is
  'Positive integer numerator. Quantity value = quantity_coefficient / 10^quantity_scale. Maximum is the quotation quantity coefficient contract, 1000000000000.';

comment on column athena_client_quote_templates.quantity_scale is
  'Quantity decimal scale, 0 through 4. Same bound as a quotation line.';

comment on column athena_client_quote_templates.unit_price_minor is
  'Nonnegative integer minor units of currency_code. Maximum is 9007199254740991 (Number.MAX_SAFE_INTEGER). No foreign-exchange conversion is stored.';

comment on column athena_client_quote_templates.currency_code is
  'Uppercase ISO-style three-letter code. A quotation can copy this template only when its currency matches.';

comment on column athena_client_quote_templates.billing_frequency is
  'one_time, monthly, quarterly, or annually. Copied onto the quotation line. Not annualized.';

comment on column athena_client_quote_templates.deleted_at is
  'Soft-mask timestamp. Null keeps the template in the active catalog. A timestamp hides it from ordinary list and update. Repeated masking does not rewrite the row.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_client_quote_templates enable row level security;

revoke all on table athena_client_quote_templates from public;
revoke all on table athena_client_quote_templates from anon;
revoke all on table athena_client_quote_templates from authenticated;

grant all on table athena_client_quote_templates to service_role;
