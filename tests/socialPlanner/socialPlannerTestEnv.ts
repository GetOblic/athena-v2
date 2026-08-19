/**
 * Side-effect bootstrap for Social Planner tests that load modules initializing
 * supabaseAdmin. Must be imported before those modules. Never talks to live Supabase.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
