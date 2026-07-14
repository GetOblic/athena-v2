-- Client Brand Identity fields on organizations (organization-level data capture).
-- Does not alter athena_identity, master_profile, generation jobs, or Executive Versions.
-- Private storage bucket for organization-scoped logos.
-- App access uses the service role with organization-prefixed object paths.
-- Object path principle: {organization_id}/identity/logo/{generated-filename}

alter table organizations
  add column if not exists brand_logo_storage_path text,
  add column if not exists brand_primary_color text,
  add column if not exists brand_secondary_color text,
  add column if not exists brand_accent_color text,
  add column if not exists brand_background_color text,
  add column if not exists brand_font text;

comment on column organizations.brand_logo_storage_path is
  'Organization-scoped storage object path for client logo. Profile metadata only; not applied to Athena UI or generation.';
comment on column organizations.brand_primary_color is
  'Client brand primary color as #RRGGBB. Optional organization metadata only.';
comment on column organizations.brand_secondary_color is
  'Client brand secondary color as #RRGGBB. Optional organization metadata only.';
comment on column organizations.brand_accent_color is
  'Client brand accent color as #RRGGBB. Optional organization metadata only.';
comment on column organizations.brand_background_color is
  'Client brand background color as #RRGGBB. Optional organization metadata only.';
comment on column organizations.brand_font is
  'Allowlisted client brand font key. Optional organization metadata only; not applied to Athena UI.';

-- Create the private bucket only when missing. Never overwrite an existing bucket config.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'client-brand-assets',
  'client-brand-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
