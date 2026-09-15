-- Athena V2 SEC-1B
-- Future-object default privileges for the postgres creator role in public.
-- Defense in depth only. Does not enable RLS. Does not replace per-object
-- lockdown. Does not alter existing tables, functions, sequences, or data.
-- Does not modify supabase_admin defaults.
-- Target creator: postgres. Target schema: public.
-- Idempotent. Safe to re-run. Do not apply from application code.

-- Layer 1 (required in every future Athena migration, enforced by
-- tests/security/migrationSecurityGuardrail.test.ts):
--   every new table: ENABLE ROW LEVEL SECURITY
--     + REVOKE ALL from public/anon/authenticated
--     + GRANT ALL to service_role
--     + no client GRANT / CREATE POLICY unless allowlisted
--   every new function: REVOKE ALL from public/anon/authenticated
--     + GRANT EXECUTE to service_role
--     + fixed search_path when SECURITY DEFINER
-- Layer 2 (this file) only changes FUTURE postgres-created defaults.

-- =====================================================================
-- TABLE defaults (future postgres-created public tables)
-- =====================================================================

alter default privileges for role postgres in schema public
  revoke all on tables from public;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;

-- =====================================================================
-- SEQUENCE defaults (future postgres-created public sequences)
-- =====================================================================

alter default privileges for role postgres in schema public
  revoke all on sequences from public;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;

alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

-- =====================================================================
-- FUNCTION defaults (future postgres-created public functions)
-- =====================================================================

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
