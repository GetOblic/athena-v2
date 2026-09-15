-- Super Admin Licensee commercial configuration.
-- Additive columns only. Existing and future Licensees default to 0.00.
-- Super Admin control-plane only. Not exposed to Licensee Masters or tenants.
-- Do not apply this migration from application code.

alter table licensee_accounts
  add column if not exists licensee_monthly_fee_usd numeric(12,2) not null default 0;

alter table licensee_accounts
  add column if not exists sub_account_monthly_fee_usd numeric(12,2) not null default 0;

alter table licensee_accounts
  drop constraint if exists licensee_accounts_licensee_monthly_fee_usd_chk;

alter table licensee_accounts
  add constraint licensee_accounts_licensee_monthly_fee_usd_chk
  check (licensee_monthly_fee_usd >= 0);

alter table licensee_accounts
  drop constraint if exists licensee_accounts_sub_account_monthly_fee_usd_chk;

alter table licensee_accounts
  add constraint licensee_accounts_sub_account_monthly_fee_usd_chk
  check (sub_account_monthly_fee_usd >= 0);

comment on column licensee_accounts.licensee_monthly_fee_usd is
  'Super Admin-only Licensee Monthly Fee in USD. Defaults to 0.00. Not exposed to Licensee Masters or tenants.';
comment on column licensee_accounts.sub_account_monthly_fee_usd is
  'Super Admin-only Sub-Account Monthly Fee in USD. Defaults to 0.00. Not exposed to Licensee Masters or tenants.';
