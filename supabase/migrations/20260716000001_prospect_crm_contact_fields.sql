-- Prospect CRM / contact identity fields for CSV import preservation.
-- Additive nullable columns only; no RLS or ownership changes.

alter table prospects
  add column if not exists external_contact_id text;

alter table prospects
  add column if not exists first_name text;

alter table prospects
  add column if not exists last_name text;

alter table prospects
  add column if not exists timezone text;

comment on column prospects.external_contact_id is
  'External CRM or source-system contact identifier used for future synchronization and traceability.';

comment on column prospects.first_name is
  'Imported contact first name.';

comment on column prospects.last_name is
  'Imported contact last name.';

comment on column prospects.timezone is
  'Imported business/contact timezone for future scheduling and outreach logic.';
