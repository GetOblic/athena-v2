-- V24 Phase 1 GetOblic Super Admin — identity, account access, durable audit.
-- Super Admin authorizes individual GetOblic administrators (DB is authority).
-- account_access_status is the durable application-level access state for
-- ordinary Athena and Licensee Master accounts. No delete/impersonation/billing.
--
-- Missing account_access_status row = active (no backfill required for pre-V24).
-- These tables are server/service-role control-plane only — no browser access.

create table if not exists getoblic_super_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists getoblic_super_admins_user_id_idx
  on getoblic_super_admins (user_id);

create table if not exists account_access_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'deactivated')),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create index if not exists account_access_status_status_idx
  on account_access_status (status);

create table if not exists getoblic_super_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid null references auth.users(id) on delete set null,
  target_email text null,
  account_type text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists getoblic_super_admin_audit_actor_user_id_idx
  on getoblic_super_admin_audit (actor_user_id);

create index if not exists getoblic_super_admin_audit_target_user_id_idx
  on getoblic_super_admin_audit (target_user_id);

create index if not exists getoblic_super_admin_audit_created_at_idx
  on getoblic_super_admin_audit (created_at desc);

comment on table getoblic_super_admins is
  'V24 GetOblic Super Admin identity. Presence of user_id authorizes /super. No Phase 1 management UI.';

comment on table account_access_status is
  'V24 durable active/deactivated access state for ordinary Athena and Licensee Master accounts.';

comment on table getoblic_super_admin_audit is
  'V24 minimal durable Super Admin action audit (create/deactivate/reactivate).';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
-- service_role bypasses RLS and retains explicit privileges for server paths.
alter table getoblic_super_admins enable row level security;
alter table account_access_status enable row level security;
alter table getoblic_super_admin_audit enable row level security;

revoke all on table getoblic_super_admins from public;
revoke all on table getoblic_super_admins from anon;
revoke all on table getoblic_super_admins from authenticated;

revoke all on table account_access_status from public;
revoke all on table account_access_status from anon;
revoke all on table account_access_status from authenticated;

revoke all on table getoblic_super_admin_audit from public;
revoke all on table getoblic_super_admin_audit from anon;
revoke all on table getoblic_super_admin_audit from authenticated;

grant all on table getoblic_super_admins to service_role;
grant all on table account_access_status to service_role;
grant all on table getoblic_super_admin_audit to service_role;
