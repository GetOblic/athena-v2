-- Organization-level client profile picture (data capture only).
-- Reuses private bucket client-brand-assets. Does not alter athena_identity,
-- logo fields, Brain, generation jobs, or Executive Versions.
-- Object path principle: {organization_id}/identity/profile-picture/{generated-filename}

alter table organizations
  add column if not exists brand_profile_picture_storage_path text;

comment on column organizations.brand_profile_picture_storage_path is
  'Organization-scoped storage object path for client profile picture. Profile metadata only; not applied to Athena UI, navigation, or generation.';
