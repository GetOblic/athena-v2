alter table athena_identity
  add column if not exists master_profile jsonb,
  add column if not exists master_profile_version text,
  add column if not exists master_profile_generated_at timestamptz;
