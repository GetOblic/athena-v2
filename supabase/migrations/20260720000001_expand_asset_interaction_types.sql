-- Expand athena_asset_interactions.interaction_type to support client usage tags.
-- Preserves existing unique constraint and all existing 'copied' rows.
-- Does not alter prospects, discussions, or Executive Versions.

alter table athena_asset_interactions
  drop constraint if exists athena_asset_interactions_interaction_type_check;

alter table athena_asset_interactions
  add constraint athena_asset_interactions_interaction_type_check
  check (
    interaction_type in (
      'copied',
      'selected',
      'scheduled',
      'sent',
      'published',
      'used'
    )
  );

comment on column athena_asset_interactions.interaction_type is
  'copied = durable Done after clipboard copy; selected/scheduled/sent/published/used = client usage tags. Never consumed by Brain or generation.';
