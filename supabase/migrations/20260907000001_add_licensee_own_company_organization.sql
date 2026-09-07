-- V2-LIC-1 — Licensee-scoped own-company identity.
-- Points at the ordinary Athena organization the Licensee uses as "My Company".
-- Identity only: authorization remains licensee_sub_accounts.
-- Not backfilled; existing licensees remain NULL until first-account
-- auto-designation or explicit designation.

alter table licensee_accounts
  add column if not exists own_company_organization_id uuid null
    references organizations(id) on delete set null;

comment on column licensee_accounts.own_company_organization_id is
  'Licensee-scoped identity of the Licensee''s own-company Athena organization. Authorization remains licensee_sub_accounts. Nullable; not backfilled.';
