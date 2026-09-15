-- Athena V2 SEC-1
-- Close direct PostgREST/Data API access to Athena public tables.
-- Preserve service_role / supabaseAdmin / worker architecture.
-- Deny-by-default RLS. No client policies. No FORCE ROW LEVEL SECURITY.
-- No Storage. No Auth settings. No default privileges (creator role unproven).
-- Idempotent. Safe to re-run.

-- =====================================================================
-- 1. Table lockdown (35 tables)
--    ENABLE RLS + REVOKE public/anon/authenticated + GRANT service_role
-- =====================================================================

alter table communities enable row level security;
revoke all on table communities from public;
revoke all on table communities from anon;
revoke all on table communities from authenticated;
grant all on table communities to service_role;

alter table discussions enable row level security;
revoke all on table discussions from public;
revoke all on table discussions from anon;
revoke all on table discussions from authenticated;
grant all on table discussions to service_role;

alter table athena_discussion_analysis enable row level security;
revoke all on table athena_discussion_analysis from public;
revoke all on table athena_discussion_analysis from anon;
revoke all on table athena_discussion_analysis from authenticated;
grant all on table athena_discussion_analysis to service_role;

alter table opportunities enable row level security;
revoke all on table opportunities from public;
revoke all on table opportunities from anon;
revoke all on table opportunities from authenticated;
grant all on table opportunities to service_role;

alter table athena_reviews enable row level security;
revoke all on table athena_reviews from public;
revoke all on table athena_reviews from anon;
revoke all on table athena_reviews from authenticated;
grant all on table athena_reviews to service_role;

alter table athena_community_intelligence enable row level security;
revoke all on table athena_community_intelligence from public;
revoke all on table athena_community_intelligence from anon;
revoke all on table athena_community_intelligence from authenticated;
grant all on table athena_community_intelligence to service_role;

alter table athena_production_intelligence enable row level security;
revoke all on table athena_production_intelligence from public;
revoke all on table athena_production_intelligence from anon;
revoke all on table athena_production_intelligence from authenticated;
grant all on table athena_production_intelligence to service_role;

alter table knowledge_assets enable row level security;
revoke all on table knowledge_assets from public;
revoke all on table knowledge_assets from anon;
revoke all on table knowledge_assets from authenticated;
grant all on table knowledge_assets to service_role;

alter table knowledge_asset_links enable row level security;
revoke all on table knowledge_asset_links from public;
revoke all on table knowledge_asset_links from anon;
revoke all on table knowledge_asset_links from authenticated;
grant all on table knowledge_asset_links to service_role;

alter table athena_identity enable row level security;
revoke all on table athena_identity from public;
revoke all on table athena_identity from anon;
revoke all on table athena_identity from authenticated;
grant all on table athena_identity to service_role;

alter table identity_documents enable row level security;
revoke all on table identity_documents from public;
revoke all on table identity_documents from anon;
revoke all on table identity_documents from authenticated;
grant all on table identity_documents to service_role;

alter table athena_asset_blueprints enable row level security;
revoke all on table athena_asset_blueprints from public;
revoke all on table athena_asset_blueprints from anon;
revoke all on table athena_asset_blueprints from authenticated;
grant all on table athena_asset_blueprints to service_role;

alter table athena_discussion_updates enable row level security;
revoke all on table athena_discussion_updates from public;
revoke all on table athena_discussion_updates from anon;
revoke all on table athena_discussion_updates from authenticated;
grant all on table athena_discussion_updates to service_role;

alter table organizations enable row level security;
revoke all on table organizations from public;
revoke all on table organizations from anon;
revoke all on table organizations from authenticated;
grant all on table organizations to service_role;

alter table organization_members enable row level security;
revoke all on table organization_members from public;
revoke all on table organization_members from anon;
revoke all on table organization_members from authenticated;
grant all on table organization_members to service_role;

alter table athena_executive_intelligence_versions enable row level security;
revoke all on table athena_executive_intelligence_versions from public;
revoke all on table athena_executive_intelligence_versions from anon;
revoke all on table athena_executive_intelligence_versions from authenticated;
grant all on table athena_executive_intelligence_versions to service_role;

alter table athena_generation_jobs enable row level security;
revoke all on table athena_generation_jobs from public;
revoke all on table athena_generation_jobs from anon;
revoke all on table athena_generation_jobs from authenticated;
grant all on table athena_generation_jobs to service_role;

alter table prospects enable row level security;
revoke all on table prospects from public;
revoke all on table prospects from anon;
revoke all on table prospects from authenticated;
grant all on table prospects to service_role;

alter table athena_asset_interactions enable row level security;
revoke all on table athena_asset_interactions from public;
revoke all on table athena_asset_interactions from anon;
revoke all on table athena_asset_interactions from authenticated;
grant all on table athena_asset_interactions to service_role;

alter table athena_website_deep_scrape_jobs enable row level security;
revoke all on table athena_website_deep_scrape_jobs from public;
revoke all on table athena_website_deep_scrape_jobs from anon;
revoke all on table athena_website_deep_scrape_jobs from authenticated;
grant all on table athena_website_deep_scrape_jobs to service_role;

alter table personas enable row level security;
revoke all on table personas from public;
revoke all on table personas from anon;
revoke all on table personas from authenticated;
grant all on table personas to service_role;

alter table ad_campaigns enable row level security;
revoke all on table ad_campaigns from public;
revoke all on table ad_campaigns from anon;
revoke all on table ad_campaigns from authenticated;
grant all on table ad_campaigns to service_role;

alter table athena_ad_generation_jobs enable row level security;
revoke all on table athena_ad_generation_jobs from public;
revoke all on table athena_ad_generation_jobs from anon;
revoke all on table athena_ad_generation_jobs from authenticated;
grant all on table athena_ad_generation_jobs to service_role;

alter table seo_reports enable row level security;
revoke all on table seo_reports from public;
revoke all on table seo_reports from anon;
revoke all on table seo_reports from authenticated;
grant all on table seo_reports to service_role;

alter table athena_seo_generation_jobs enable row level security;
revoke all on table athena_seo_generation_jobs from public;
revoke all on table athena_seo_generation_jobs from anon;
revoke all on table athena_seo_generation_jobs from authenticated;
grant all on table athena_seo_generation_jobs to service_role;

alter table licensee_accounts enable row level security;
revoke all on table licensee_accounts from public;
revoke all on table licensee_accounts from anon;
revoke all on table licensee_accounts from authenticated;
grant all on table licensee_accounts to service_role;

alter table licensee_sub_accounts enable row level security;
revoke all on table licensee_sub_accounts from public;
revoke all on table licensee_sub_accounts from anon;
revoke all on table licensee_sub_accounts from authenticated;
grant all on table licensee_sub_accounts to service_role;

alter table athena_social_calendars enable row level security;
revoke all on table athena_social_calendars from public;
revoke all on table athena_social_calendars from anon;
revoke all on table athena_social_calendars from authenticated;
grant all on table athena_social_calendars to service_role;

alter table athena_social_calendar_generation_jobs enable row level security;
revoke all on table athena_social_calendar_generation_jobs from public;
revoke all on table athena_social_calendar_generation_jobs from anon;
revoke all on table athena_social_calendar_generation_jobs from authenticated;
grant all on table athena_social_calendar_generation_jobs to service_role;

alter table athena_social_calendar_messages enable row level security;
revoke all on table athena_social_calendar_messages from public;
revoke all on table athena_social_calendar_messages from anon;
revoke all on table athena_social_calendar_messages from authenticated;
grant all on table athena_social_calendar_messages to service_role;

alter table athena_getoblic_listing_links enable row level security;
revoke all on table athena_getoblic_listing_links from public;
revoke all on table athena_getoblic_listing_links from anon;
revoke all on table athena_getoblic_listing_links from authenticated;
grant all on table athena_getoblic_listing_links to service_role;

alter table athena_getoblic_directory_settings enable row level security;
revoke all on table athena_getoblic_directory_settings from public;
revoke all on table athena_getoblic_directory_settings from anon;
revoke all on table athena_getoblic_directory_settings from authenticated;
grant all on table athena_getoblic_directory_settings to service_role;

alter table athena_getoblic_listing_allocation_events enable row level security;
revoke all on table athena_getoblic_listing_allocation_events from public;
revoke all on table athena_getoblic_listing_allocation_events from anon;
revoke all on table athena_getoblic_listing_allocation_events from authenticated;
grant all on table athena_getoblic_listing_allocation_events to service_role;

-- Class C: safe whether live RLS is already on or still off.
alter table licensee_prospect_client_conversions enable row level security;
revoke all on table licensee_prospect_client_conversions from public;
revoke all on table licensee_prospect_client_conversions from anon;
revoke all on table licensee_prospect_client_conversions from authenticated;
grant all on table licensee_prospect_client_conversions to service_role;

alter table licensee_prospect_client_provisioning_intents enable row level security;
revoke all on table licensee_prospect_client_provisioning_intents from public;
revoke all on table licensee_prospect_client_provisioning_intents from anon;
revoke all on table licensee_prospect_client_provisioning_intents from authenticated;
grant all on table licensee_prospect_client_provisioning_intents to service_role;

-- =====================================================================
-- 2. Provisioning helper search_path + EXECUTE lockdown
-- =====================================================================

alter function athena_slugify_org_name(text)
  set search_path = pg_catalog;
revoke all on function athena_slugify_org_name(text) from public;
revoke all on function athena_slugify_org_name(text) from anon;
revoke all on function athena_slugify_org_name(text) from authenticated;
grant execute on function athena_slugify_org_name(text) to service_role;

alter function athena_provision_missing_user_tenants()
  set search_path = public;
revoke all on function athena_provision_missing_user_tenants() from public;
revoke all on function athena_provision_missing_user_tenants() from anon;
revoke all on function athena_provision_missing_user_tenants() from authenticated;
grant execute on function athena_provision_missing_user_tenants() to service_role;

alter function athena_rehome_users_in_shared_organizations()
  set search_path = public;
revoke all on function athena_rehome_users_in_shared_organizations() from public;
revoke all on function athena_rehome_users_in_shared_organizations() from anon;
revoke all on function athena_rehome_users_in_shared_organizations() from authenticated;
grant execute on function athena_rehome_users_in_shared_organizations() to service_role;

-- =====================================================================
-- 3. Job / capacity RPC EXECUTE normalization
--    Revoke is already present for these; GRANT is missing on older RPCs.
-- =====================================================================

revoke all on function claim_athena_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_generation_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from public;
revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from anon;
revoke all on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) from authenticated;
grant execute on function heartbeat_athena_generation_job(uuid, uuid, integer, text, jsonb) to service_role;

revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from authenticated;
grant execute on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from public;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from anon;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_website_deep_scrape_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from public;
revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from anon;
revoke all on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) from authenticated;
grant execute on function heartbeat_athena_website_deep_scrape_job(uuid, uuid, integer, text, jsonb) to service_role;

revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from public;
revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from anon;
revoke all on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) from authenticated;
grant execute on function complete_athena_website_deep_scrape_job(uuid, uuid, integer, uuid, timestamptz, jsonb) to service_role;

revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_website_deep_scrape_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function claim_athena_ad_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_ad_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_ad_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_ad_generation_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_ad_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_ad_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_ad_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_ad_generation_job(uuid, uuid, integer, text) to service_role;

revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from public;
revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from anon;
revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_athena_ad_generation_job(uuid, uuid, jsonb) to service_role;

revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_seo_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_seo_generation_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_seo_generation_job(uuid, uuid, integer, text) to service_role;

revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from public;
revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from anon;
revoke all on function complete_athena_seo_generation_job(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_athena_seo_generation_job(uuid, uuid, jsonb) to service_role;

revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_seo_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_social_calendar_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_social_calendar_generation_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_social_calendar_generation_job(uuid, uuid, integer, text) to service_role;

revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function complete_athena_social_calendar_generation_job(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_social_calendar_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from public;
revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from anon;
revoke all on function claim_athena_estimate_generation_job(text, uuid, integer) from authenticated;
grant execute on function claim_athena_estimate_generation_job(text, uuid, integer) to service_role;

revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from public;
revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from anon;
revoke all on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) from authenticated;
grant execute on function heartbeat_athena_estimate_generation_job(uuid, uuid, integer, text) to service_role;

revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from public;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) to service_role;

revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_estimate_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from public;
revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from anon;
revoke all on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) from authenticated;
grant execute on function reserve_getoblic_listing_capacity(uuid, uuid, bigint, date, text, uuid, uuid) to service_role;

revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from public;
revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from anon;
revoke all on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) from authenticated;
grant execute on function consume_getoblic_listing_allocation(uuid, uuid, uuid, bigint, date, text, uuid, uuid) to service_role;
