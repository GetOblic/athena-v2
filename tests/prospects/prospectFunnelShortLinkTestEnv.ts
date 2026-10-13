/**
 * Side-effect bootstrap for Prospect Funnel short-link tests that load supabaseAdmin.
 * Must be imported before those modules.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
