-- V25 Strategic Asset Blueprint centrally governed instructions.
-- Keyed GetOblic control-plane configuration (initially trend_social_prompt).
-- Service-role server access only — no browser/anon/authenticated access.
-- Also adds persisted generated output column trend_social_prompt on
-- athena_asset_blueprints (historical output; not live config).

create table if not exists getoblic_strategic_blueprint_instructions (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  instruction_text text not null default '',
  revision_id uuid not null default gen_random_uuid(),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint getoblic_strategic_blueprint_instructions_config_key_nonempty
    check (char_length(trim(config_key)) > 0)
);

create index if not exists getoblic_strategic_blueprint_instructions_config_key_idx
  on getoblic_strategic_blueprint_instructions (config_key);

create index if not exists getoblic_strategic_blueprint_instructions_revision_id_idx
  on getoblic_strategic_blueprint_instructions (revision_id);

comment on table getoblic_strategic_blueprint_instructions is
  'V25 GetOblic keyed Strategic Asset Blueprint instructions. Super Admin editable; generation workers read active revision server-side.';

comment on column getoblic_strategic_blueprint_instructions.config_key is
  'Stable configuration key (e.g. trend_social_prompt). One active row per key.';

comment on column getoblic_strategic_blueprint_instructions.revision_id is
  'Opaque revision identity. Regenerated on each successful instruction update for provenance.';

comment on column getoblic_strategic_blueprint_instructions.instruction_text is
  'Active administrative instruction text used by future blueprint generations.';

-- Tenant generated-output column (immutable once stored on a blueprint row).
alter table athena_asset_blueprints
  add column if not exists trend_social_prompt text;

comment on column athena_asset_blueprints.trend_social_prompt is
  'V25 generated Trend Social Prompt output. Stored at generation time; not reconstructed from live Super Admin config.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
-- service_role bypasses RLS and retains explicit privileges for server paths.
alter table getoblic_strategic_blueprint_instructions enable row level security;

revoke all on table getoblic_strategic_blueprint_instructions from public;
revoke all on table getoblic_strategic_blueprint_instructions from anon;
revoke all on table getoblic_strategic_blueprint_instructions from authenticated;

grant all on table getoblic_strategic_blueprint_instructions to service_role;
