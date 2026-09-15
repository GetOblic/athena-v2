-- Athena V2 — durable Prospect ↔ Licensee client conversion.
-- Additive only. Does not alter prospects, organizations, licensee_accounts,
-- licensee_sub_accounts, GetOblic, or auth users.
-- Application-enforced isolation via supabaseAdmin. No RLS / no browser policies.
-- Do not apply this migration from application code.

-- ---------------------------------------------------------------------------
-- licensee_prospect_client_conversions
-- One durable Prospect ↔ client-organization pair.
-- Active: Licensee relationship is attached.
-- Reversed: relationship detached; client org, auth user, membership,
-- and provisional provisioning email are retained for later reattachment.
-- ---------------------------------------------------------------------------
create table if not exists licensee_prospect_client_conversions (
  id uuid primary key default gen_random_uuid(),

  prospect_id uuid not null
    references prospects(id) on delete restrict,

  source_organization_id uuid not null
    references organizations(id) on delete restrict,

  client_organization_id uuid not null
    references organizations(id) on delete restrict,

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete restrict,

  licensee_sub_account_id uuid null
    references licensee_sub_accounts(id) on delete set null,

  status text not null,

  -- Actual provisional @getoblic.com identity selected at first conversion.
  -- Normalized lowercase. Reused on re-conversion. Never prospect.email.
  client_account_email text not null,

  converted_at timestamptz not null default now(),
  converted_by_user_id uuid null
    references auth.users(id) on delete set null,

  restored_at timestamptz null,
  restored_by_user_id uuid null
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint licensee_prospect_client_conversions_status_chk
    check (status in ('active', 'reversed'))
);

-- One durable conversion row per Prospect (reactivation updates this row).
create unique index if not exists licensee_prospect_client_conversions_prospect_id_uidx
  on licensee_prospect_client_conversions (prospect_id);

-- One durable conversion row per client organization.
create unique index if not exists licensee_prospect_client_conversions_client_organization_id_uidx
  on licensee_prospect_client_conversions (client_organization_id);

-- Durable Prospect / client-org pair for reactivation.
create unique index if not exists licensee_prospect_client_conversions_prospect_client_org_uidx
  on licensee_prospect_client_conversions (prospect_id, client_organization_id);

-- One ACTIVE conversion per Prospect (belt-and-suspenders with prospect unique).
create unique index if not exists licensee_prospect_client_conversions_one_active_per_prospect
  on licensee_prospect_client_conversions (prospect_id)
  where status = 'active';

-- One ACTIVE conversion per client organization.
create unique index if not exists licensee_prospect_client_conversions_one_active_per_client_org
  on licensee_prospect_client_conversions (client_organization_id)
  where status = 'active';

create unique index if not exists licensee_prospect_client_conversions_client_account_email_uidx
  on licensee_prospect_client_conversions (lower(client_account_email));

create index if not exists licensee_prospect_client_conversions_licensee_status_idx
  on licensee_prospect_client_conversions (licensee_account_id, status);

create index if not exists licensee_prospect_client_conversions_source_organization_id_idx
  on licensee_prospect_client_conversions (source_organization_id);

create index if not exists licensee_prospect_client_conversions_client_account_email_idx
  on licensee_prospect_client_conversions (client_account_email);

comment on table licensee_prospect_client_conversions is
  'Durable Licensee Own-Company Prospect ↔ client organization conversion. The Prospect row stays in the source organization. Reversal detaches licensee_sub_accounts only. client_account_email is the system-generated provisional login identity.';

comment on column licensee_prospect_client_conversions.prospect_id is
  'Source Prospect. ON DELETE RESTRICT — conversion history must not disappear because a Prospect is hard-deleted.';

comment on column licensee_prospect_client_conversions.source_organization_id is
  'Licensee Own Company organization that owns the Prospect. Never changed during conversion or reversal.';

comment on column licensee_prospect_client_conversions.client_organization_id is
  'Ordinary Athena organization created (or reattached) as the client tenant. Retained after reversal.';

comment on column licensee_prospect_client_conversions.licensee_sub_account_id is
  'Active licensee_sub_accounts relationship. Null while reversed. ON DELETE SET NULL.';

comment on column licensee_prospect_client_conversions.status is
  'active | reversed. Only one active conversion per Prospect and per client organization.';

comment on column licensee_prospect_client_conversions.client_account_email is
  'Normalized provisional @getoblic.com auth/provisioning identity selected for this conversion. Never prospects.email. Reused on re-conversion.';

-- ---------------------------------------------------------------------------
-- licensee_prospect_client_provisioning_intents
-- Short-lived first-provision reservation. Authoritative ONLY while no
-- durable conversion exists. Binds Prospect + source Own Company + Licensee
-- Master + intended provisional @getoblic.com identity BEFORE the client
-- organization necessarily exists. Does not mean a client exists.
-- Consumed after the durable conversion row is written.
-- ---------------------------------------------------------------------------
create table if not exists licensee_prospect_client_provisioning_intents (
  prospect_id uuid primary key
    references prospects(id) on delete restrict,

  source_organization_id uuid not null
    references organizations(id) on delete restrict,

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete restrict,

  -- Normalized lowercase provisional @getoblic.com identity reserved for
  -- this Prospect's first-time client provisioning.
  intended_client_account_email text not null,

  created_by_user_id uuid null
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

-- Two simultaneous Prospect intents cannot claim the same provisional identity.
create unique index if not exists licensee_prospect_client_provisioning_intents_email_uidx
  on licensee_prospect_client_provisioning_intents (lower(intended_client_account_email));

-- Exact-match lookup used by collision classification (stored lowercase).
create index if not exists licensee_prospect_client_provisioning_intents_email_idx
  on licensee_prospect_client_provisioning_intents (intended_client_account_email);

comment on table licensee_prospect_client_provisioning_intents is
  'First-time Licensee Prospect client provisioning reservation. Exists before the client organization necessarily exists. Authoritative only while no durable conversion row exists. Consumed after conversion INSERT.';

comment on column licensee_prospect_client_provisioning_intents.prospect_id is
  'Prospect whose first-time client provisioning is reserved. PRIMARY KEY. ON DELETE RESTRICT.';

comment on column licensee_prospect_client_provisioning_intents.source_organization_id is
  'Licensee Own Company organization that owns the Prospect. Must match the acting conversion source.';

comment on column licensee_prospect_client_provisioning_intents.licensee_account_id is
  'Licensee Master that began first-time provisioning for this Prospect.';

comment on column licensee_prospect_client_provisioning_intents.intended_client_account_email is
  'Normalized lowercase provisional @getoblic.com identity reserved for this Prospect. Unique case-insensitively. Reused on retry. Never prospects.email.';

comment on column licensee_prospect_client_provisioning_intents.created_by_user_id is
  'Acting Master user who reserved the intent. ON DELETE SET NULL.';
