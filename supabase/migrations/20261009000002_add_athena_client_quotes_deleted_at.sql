-- EST-QUOTE-1D.5A — Soft-mask Licensee client quotations.
-- Additive only. Does not delete rows, quote numbers, snapshots, logos,
-- source estimates, or revision links.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.

alter table athena_client_quotes
  add column if not exists deleted_at timestamptz;

comment on column athena_client_quotes.deleted_at is
  'Soft-mask timestamp. Null keeps the quotation in the active library. A timestamp hides it from ordinary list, detail, edit, issue, revision, and PDF routes. The row, quote number, issued snapshot, source estimate reference, revision link, and logo objects stay.';

create index if not exists athena_client_quotes_licensee_active_created_idx
  on athena_client_quotes (licensee_account_id, created_at desc)
  where deleted_at is null;
