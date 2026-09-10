-- Athena-generated GetOblic directory description.
-- Separate from imported raw_json listing provenance.
-- This column is never written back to GetOblic in this phase.

alter table prospects
  add column if not exists generated_listing_description jsonb;

comment on column prospects.generated_listing_description is
  'Athena-generated GetOblic directory description. Separate from imported raw_json listing provenance.';
