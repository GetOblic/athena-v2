-- V20 Business Licensee Master Account — relationship tables only.
-- Master owns relationships to normal Athena organizations.
-- No business name/logo duplication; those remain on organizations.

create table if not exists licensee_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists licensee_sub_accounts (
  id uuid primary key default gen_random_uuid(),
  licensee_account_id uuid not null references licensee_accounts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  pinned boolean not null default false,
  pinned_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint licensee_sub_accounts_licensee_org_unique unique (licensee_account_id, organization_id)
);

create index if not exists licensee_accounts_user_id_idx
  on licensee_accounts (user_id);

create index if not exists licensee_sub_accounts_licensee_account_id_idx
  on licensee_sub_accounts (licensee_account_id);

create index if not exists licensee_sub_accounts_organization_id_idx
  on licensee_sub_accounts (organization_id);
