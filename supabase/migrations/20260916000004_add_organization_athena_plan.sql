-- Organization-level Athena product plan for ordinary Athena accounts.
-- Authoritative account configuration. Not authorization.
-- Existing organizations remain Full via NOT NULL DEFAULT.
-- Changing this value must not affect membership, Licensee relationships, or tenant data.

alter table organizations
  add column if not exists athena_plan text not null default 'full';

alter table organizations
  drop constraint if exists organizations_athena_plan_check;

alter table organizations
  add constraint organizations_athena_plan_check
  check (athena_plan in ('full', 'free'));

comment on column organizations.athena_plan is
  'Ordinary Athena product plan (full, free). Authoritative organization configuration; default full for existing and newly created organizations until Super Admin creation supplies an explicit value.';
