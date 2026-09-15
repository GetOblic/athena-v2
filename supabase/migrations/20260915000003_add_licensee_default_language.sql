-- Licensee Master UI language and default for future sub-account creation.
-- Does not override existing organizations.
-- Changing this value must not update or synchronize existing tenant languages.
-- Existing Licensees receive English via NOT NULL DEFAULT.
-- Do not apply this migration from application code.

alter table licensee_accounts
  add column if not exists default_language text not null default 'en';

alter table licensee_accounts
  drop constraint if exists licensee_accounts_default_language_check;

alter table licensee_accounts
  add constraint licensee_accounts_default_language_check
  check (default_language in ('en', 'fr', 'es', 'it', 'de', 'pt'));

comment on column licensee_accounts.default_language is
  'Licensee Master UI language and creation default for future Licensee sub-accounts. Does not override existing organizations. Changing this value must not update or synchronize existing tenant languages.';
