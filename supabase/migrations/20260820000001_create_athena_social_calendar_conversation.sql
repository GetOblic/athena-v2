-- Athena V29 L9 — Social Planner durable conversation + frozen revision context.
-- Additive only. Does not amend L1 RPCs, Ads, SEO, Estimate, Deep Scrape,
-- Discussion, Prospect, Persona, Blueprint, or GetOblic Links contracts.
-- Messages are ordinary organization-owned artifacts (not Licensee-owned).
-- revision_context_json is queued-generation request state, not a package.

-- ---------------------------------------------------------------------------
-- athena_social_calendar_messages
-- ---------------------------------------------------------------------------
create table if not exists athena_social_calendar_messages (
  id uuid primary key default gen_random_uuid(),

  social_calendar_id uuid not null
    references athena_social_calendars(id) on delete cascade,

  organization_id uuid not null
    references organizations(id) on delete cascade,

  role text not null
    check (role in ('user', 'assistant')),

  content text not null
    check (char_length(trim(content)) > 0),

  created_at timestamptz not null default now()
);

create index if not exists athena_social_calendar_messages_calendar_created_idx
  on athena_social_calendar_messages (social_calendar_id, created_at);

create index if not exists athena_social_calendar_messages_org_calendar_created_idx
  on athena_social_calendar_messages (organization_id, social_calendar_id, created_at);

comment on table athena_social_calendar_messages is
  'Organization-owned Ask Athena messages for one Social Calendar. Messages stay on the source calendar; conversation-revision derivatives start empty.';
comment on column athena_social_calendar_messages.social_calendar_id is
  'Owning Social Calendar. ON DELETE CASCADE removes the thread when the calendar is removed.';
comment on column athena_social_calendar_messages.organization_id is
  'Trusted organization owner. Constrained by the service layer with social_calendar_id.';
comment on column athena_social_calendar_messages.role is
  'Server-stamped user | assistant. The browser never supplies role.';
comment on column athena_social_calendar_messages.content is
  'Non-empty trimmed message text. User messages are bounded in application code.';

-- ---------------------------------------------------------------------------
-- revision_context_json — frozen Apply-time request for conversation_revision
-- ---------------------------------------------------------------------------
alter table athena_social_calendars
  add column if not exists revision_context_json jsonb;

alter table athena_social_calendars
  drop constraint if exists athena_social_calendars_revision_context_object_chk;

alter table athena_social_calendars
  add constraint athena_social_calendars_revision_context_object_chk
    check (
      revision_context_json is null
      or jsonb_typeof(revision_context_json) = 'object'
    );

alter table athena_social_calendars
  drop constraint if exists athena_social_calendars_revision_context_mode_chk;

alter table athena_social_calendars
  add constraint athena_social_calendars_revision_context_mode_chk
    check (
      (
        generation_mode = 'conversation_revision'
        and revision_context_json is not null
      )
      or (
        generation_mode is distinct from 'conversation_revision'
        and revision_context_json is null
      )
    );

comment on column athena_social_calendars.revision_context_json is
  'Frozen Apply-time conversation revision request. NULL for standard and think_differently. Required object for conversation_revision. Written at derivative creation; complete/fail RPCs must not overwrite or clear it.';
