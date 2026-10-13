-- ATHENA V3 — COMM-SAVED-UX-1 — GATE 2
-- Additive mask for organization-private community saves.
-- Does not alter athena_public_communities.
-- Source migration only. Do not apply this file from application code.

alter table athena_organization_communities
  add column if not exists removed_at timestamptz;

comment on column athena_organization_communities.removed_at is
  'Organization-private mask. Null keeps the save on the Saved list. A timestamp hides that save without deleting the organization row, its notes, its qualification, or the public community. Saving the same community again clears the timestamp and does not insert a second row. Distinct from global public suppression.';

create index if not exists athena_organization_communities_active_org_updated_idx
  on athena_organization_communities (organization_id, updated_at desc)
  where removed_at is null;
