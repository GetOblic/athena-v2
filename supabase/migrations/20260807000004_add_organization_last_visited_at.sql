-- Operational Last Visit timestamp for an Athena organization / tenant.
-- Updated when a human authenticated workspace document session enters Athena.
-- Not Master-relationship intelligence; not auth last_sign_in_at.

alter table organizations
  add column if not exists last_visited_at timestamptz null;

comment on column organizations.last_visited_at is
  'Most recent human visit to this Athena organization workspace. Operational metadata only; not auth last_sign_in_at.';
