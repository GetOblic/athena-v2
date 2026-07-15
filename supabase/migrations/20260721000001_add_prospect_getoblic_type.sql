-- Optional Prospect GetOblic Type metadata (client classification only).
-- Nullable; no backfill. Does not alter intelligence, generation, or other prospect columns.

alter table prospects
  add column if not exists getoblic_type text;

comment on column prospects.getoblic_type is
  'Optional GetOblic business-type classification for the prospect. Client metadata only; not consumed by Athena intelligence generation.';
