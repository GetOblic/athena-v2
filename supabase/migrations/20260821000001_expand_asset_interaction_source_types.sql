-- Allow athena_asset_interactions.source_type = social_calendar.
-- social_calendar source_id references the immutable athena_social_calendars.id.
-- Preserves existing unique constraint, interaction_type CHECK, indexes, and rows.
-- Does not alter columns, RLS, grants, or existing discussion/prospect rows.

alter table athena_asset_interactions
  drop constraint if exists athena_asset_interactions_source_type_check;

alter table athena_asset_interactions
  add constraint athena_asset_interactions_source_type_check
    check (source_type in ('discussion', 'prospect', 'social_calendar'));

comment on column athena_asset_interactions.source_type is
  'discussion | prospect | social_calendar. social_calendar source_id is the immutable athena_social_calendars.id.';
