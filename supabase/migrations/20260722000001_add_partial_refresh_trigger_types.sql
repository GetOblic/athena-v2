-- Extend athena_generation_jobs.trigger_type for partial asset-family refreshes.
-- Preserves existing values: manual_refresh, discussion_import, discussion_update.
-- Does not alter job rows, leases, or uniqueness constraints.

alter table athena_generation_jobs
  drop constraint if exists athena_generation_jobs_trigger_type_check;

alter table athena_generation_jobs
  add constraint athena_generation_jobs_trigger_type_check
  check (
    trigger_type in (
      'manual_refresh',
      'discussion_import',
      'discussion_update',
      'deployment_assets_refresh',
      'strategic_assets_refresh'
    )
  );

comment on column athena_generation_jobs.trigger_type is
  'Durable generation intent. Partial refreshes: deployment_assets_refresh, strategic_assets_refresh.';
