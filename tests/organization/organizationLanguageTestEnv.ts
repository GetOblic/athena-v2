/**
 * Side-effect bootstrap for organization-language runtime tests.
 * Must be imported before modules that initialize supabaseAdmin.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
