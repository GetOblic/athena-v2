-- CO-1B — Super Admin GetOblic.com account credentials + WordPress user mapping.
-- Additive nullable columns only. Existing directory settings rows remain valid.
-- Do not apply this migration from application code.

alter table athena_getoblic_directory_settings
  add column if not exists getoblic_account_email text,
  add column if not exists getoblic_account_password_ciphertext text;

alter table athena_getoblic_directory_settings
  drop constraint if exists athena_getoblic_directory_settings_getoblic_account_email_chk;

alter table athena_getoblic_directory_settings
  add constraint athena_getoblic_directory_settings_getoblic_account_email_chk
  check (
    getoblic_account_email is null
    or char_length(btrim(getoblic_account_email)) > 3
  );

comment on column athena_getoblic_directory_settings.getoblic_account_email is
  'Super Admin-only GetOblic.com account email. Null until mapped. Not exposed to Licensee Masters or tenants.';
comment on column athena_getoblic_directory_settings.getoblic_account_password_ciphertext is
  'Super Admin-only AES-256-GCM ciphertext (v1.iv.tag.ciphertext). Never store or return plaintext.';
