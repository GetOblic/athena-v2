-- Organization AI Workspace preferences for asset Continue destinations.
-- Navigational only — does not affect OpenRouter routing or generation.

alter table organizations
  add column if not exists ai_workspace_preferences jsonb not null default '{}'::jsonb;

comment on column organizations.ai_workspace_preferences is
  'Client preferred AI workspace / image generator destinations for asset Continue. Navigational metadata only.';
