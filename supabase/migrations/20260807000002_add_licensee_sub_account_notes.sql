-- Private Master notes on the licensee ↔ sub-account relationship only.
-- Never written into Athena tenant intelligence tables.

alter table licensee_sub_accounts
  add column if not exists notes text not null default '';

comment on column licensee_sub_accounts.notes is
  'Private Master dashboard note for this relationship. Not visible in Athena tenant UI.';
