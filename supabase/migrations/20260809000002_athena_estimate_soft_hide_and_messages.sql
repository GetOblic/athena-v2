-- Athena V26 L10 — Estimate soft-hide + Ask Athena message persistence foundation.
-- Additive only. Does not alter generation status CHECK, Ready immutability RPCs,
-- SEO/Ads/Deep Scrape contracts, or Quote.
-- Soft-hide uses hidden_at (null = visible in normal Licensee UX). No hard DELETE.
-- athena_estimate_messages stores durable conversation rows for future Ask Athena (L11+).
-- Service-role control-plane lockdown: RLS enabled, no anon/authenticated table access.

-- ---------------------------------------------------------------------------
-- athena_estimates.hidden_at
-- ---------------------------------------------------------------------------
alter table athena_estimates
  add column if not exists hidden_at timestamptz null;

comment on column athena_estimates.hidden_at is
  'Soft-hide timestamp. Null = visible in normal Licensee history/detail. Hidden rows remain in DB; hide does not cancel generation or mutate package/request/provenance.';

-- Partial index for normal Master visible-history queries.
create index if not exists athena_estimates_licensee_visible_created_idx
  on athena_estimates (licensee_account_id, created_at desc)
  where hidden_at is null;

-- ---------------------------------------------------------------------------
-- athena_estimate_messages (Ask Athena persistence foundation — schema only)
-- ---------------------------------------------------------------------------
create table if not exists athena_estimate_messages (
  id uuid primary key default gen_random_uuid(),

  estimate_id uuid not null
    references athena_estimates(id) on delete cascade,

  licensee_account_id uuid not null
    references licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete restrict,

  role text not null
    check (role in ('user', 'assistant')),

  content text not null
    check (char_length(trim(content)) > 0),

  created_at timestamptz not null default now()
);

create index if not exists athena_estimate_messages_estimate_created_idx
  on athena_estimate_messages (estimate_id, created_at);

create index if not exists athena_estimate_messages_licensee_estimate_created_idx
  on athena_estimate_messages (licensee_account_id, estimate_id, created_at);

comment on table athena_estimate_messages is
  'V26 Ask Athena durable messages. One logical conversation thread per Estimate (messages-only; no separate thread table). Application send/read APIs arrive in later phases.';
comment on column athena_estimate_messages.estimate_id is
  'Owning Estimate. Cascade deletes messages when the Estimate row is removed.';
comment on column athena_estimate_messages.licensee_account_id is
  'Owning Licensee Master account. Cascade deletes messages when the Licensee account is removed.';
comment on column athena_estimate_messages.organization_id is
  'Operational organization reference. ON DELETE RESTRICT; never use as sole authorization.';
comment on column athena_estimate_messages.role is
  'user | assistant';
comment on column athena_estimate_messages.content is
  'Message body only. No methodology, tenant intelligence, or package copy.';

-- Control-plane lockdown: RLS enabled, no anon/authenticated policies.
alter table athena_estimate_messages enable row level security;

revoke all on table athena_estimate_messages from public;
revoke all on table athena_estimate_messages from anon;
revoke all on table athena_estimate_messages from authenticated;

grant all on table athena_estimate_messages to service_role;
