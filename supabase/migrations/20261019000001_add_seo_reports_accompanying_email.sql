-- SEO accompanying email (Option A).
-- Additive nullable jsonb on seo_reports.
-- No backfill. No package_json change. No SEO RPC change.
-- Historical Ready rows stay null.
-- Do not apply this migration from application code.
-- Apply manually in the isolated Athena V2 Supabase SQL Editor.
--
-- The worker write of accompanying_email_json depends on this column.
-- Until it is applied, email persistence soft-fails and the Ready report stays Ready.

alter table seo_reports
  add column if not exists accompanying_email_json jsonb;

comment on column seo_reports.accompanying_email_json is
  'Optional seo_accompanying_email_v1 record for a Ready SEO report. Written once after the report is Ready and only while null. No edited overlay and no revision history. Null on historical Ready rows.';
