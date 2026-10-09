-- EST-EMAIL-1C — Durable generated Estimate delivery email.
-- Additive nullable column. No backfill. Does not alter the immutable
-- estimate package column, frozen request, Prospect freeze, or the
-- existing four-argument completion RPC.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.
--
-- Version 20261010000002: 20261010000001 is already used by
-- create_athena_client_quote_templates.

alter table athena_estimates
  add column if not exists delivery_email_json jsonb null;

comment on column athena_estimates.delivery_email_json is
  'Nullable delivery email record stored separately from the immutable estimate package. Null when no email was stored. Generation writes only while null: schemaVersion, language, generated subject/body, edited null, editedAt null. An existing value is never overwritten. Malformed JSON must not affect a Ready package.';
