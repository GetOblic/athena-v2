-- Master-only display name on the licensee ↔ sub-account relationship.
-- Never written into organizations.name or Athena tenant branding.

alter table licensee_sub_accounts
  add column if not exists display_name text null;

comment on column licensee_sub_accounts.display_name is
  'Private Master dashboard display name for this relationship. Does not change the Athena organization name.';
