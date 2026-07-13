-- Prospect lifecycle (client-managed) separate from intelligence readiness (`status`).
-- Ads Content: optional long-form advertising source context.

alter table prospects
  add column if not exists lifecycle_status text not null default 'New';

alter table prospects
  add column if not exists ads_content text;

comment on column prospects.lifecycle_status is
  'Client-managed Prospect business lifecycle. Distinct from intelligence readiness in status.';

comment on column prospects.ads_content is
  'Optional advertising content (Google Ads, Meta Ads, etc.) used as Prospect source context.';

comment on column prospects.status is
  'System intelligence readiness derived/updated from durable jobs: Queued, Processing, Learning from Website, Generating Executive Intelligence, Ready, Processing Failed.';
