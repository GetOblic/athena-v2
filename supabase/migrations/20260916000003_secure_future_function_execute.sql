-- Athena V2 SEC-1C
-- Correct future FUNCTION default EXECUTE for creator role postgres.
-- SEC-1B's IN SCHEMA public REVOKE cannot subtract PostgreSQL's
-- hard-wired PUBLIC EXECUTE default. A global revoke is required.
-- Affects only FUTURE functions/procedures/aggregates created by postgres.
-- Does not alter existing functions, tables, sequences, or data.
-- Does not modify supabase_admin defaults.
-- Does not replace per-function lockdown (guardrail Layer 1).
-- Leaves 00002 public-schema GRANT EXECUTE TO service_role in place.
-- Idempotent. Safe to re-run. Do not apply from application code.

alter default privileges for role postgres
  revoke execute on functions from public;
