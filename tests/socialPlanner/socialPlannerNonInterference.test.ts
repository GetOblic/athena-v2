import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260819000001_create_athena_social_calendars.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L1 non-interference", () => {
  it("migration is additive and does not alter existing generated artifacts", () => {
    const migration = read(MIGRATION);

    assert.doesNotMatch(migration, /alter table ad_campaigns/i);
    assert.doesNotMatch(migration, /alter table seo_reports/i);
    assert.doesNotMatch(migration, /alter table athena_estimates/i);
    assert.doesNotMatch(migration, /alter table athena_asset_blueprints/i);
    assert.doesNotMatch(migration, /alter table athena_generation_jobs/i);
    assert.doesNotMatch(migration, /alter table athena_ad_generation_jobs/i);
    assert.doesNotMatch(migration, /alter table athena_seo_generation_jobs/i);
    assert.doesNotMatch(
      migration,
      /alter table athena_estimate_generation_jobs/i,
    );
    assert.doesNotMatch(migration, /alter table prospects/i);
    assert.doesNotMatch(migration, /alter table personas/i);
    assert.doesNotMatch(migration, /alter table discussions/i);
    assert.doesNotMatch(migration, /alter table getoblic_/i);
    assert.doesNotMatch(
      migration,
      /create or replace function claim_athena_ad_generation_job/i,
    );
    assert.doesNotMatch(
      migration,
      /create or replace function claim_athena_seo_generation_job/i,
    );
    assert.doesNotMatch(
      migration,
      /create or replace function claim_athena_estimate_generation_job/i,
    );
    assert.doesNotMatch(
      migration,
      /create or replace function claim_athena_generation_job/i,
    );
  });

  it("registers only Social Planner tenant tables and does not add a public API alias", () => {
    const tenant = read("lib/tenantDatabase.ts");
    assert.match(tenant, /"ad_campaigns"/);
    assert.match(tenant, /"seo_reports"/);
    assert.match(tenant, /"athena_social_calendars"/);
    assert.match(tenant, /"athena_social_calendar_generation_jobs"/);
    assert.match(tenant, /"athena_social_calendar_messages"/);

    assert.equal(existsSync(join(ROOT, "app/api/social")), false);
  });

  it("domain types do not import Ads, SEO, Estimate, or Blueprint generation", () => {
    const types = read("services/socialPlanner/socialCalendarTypes.ts");
    const jobs = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes.ts",
    );
    const l2Sources = [
      types,
      jobs,
      read("services/socialPlanner/geography/resolveSocialPlannerGeography.ts"),
      read("services/socialPlanner/geography/socialPlannerCountryCatalog.ts"),
      read("services/socialPlanner/calendar/composeSocialCalendarContext.ts"),
      read("services/socialPlanner/calendar/socialCalendarOpportunities.ts"),
      read("services/socialPlanner/calendar/dateHolidaysJurisdictionProvider.ts"),
    ];

    for (const source of l2Sources) {
      assert.doesNotMatch(source, /services\/ads/);
      assert.doesNotMatch(source, /services\/seo/);
      assert.doesNotMatch(source, /services\/estimate/);
      assert.doesNotMatch(source, /assetBlueprints/);
      assert.doesNotMatch(source, /thinkDifferentlyWorkflow/);
      assert.doesNotMatch(source, /openrouter/i);
      assert.doesNotMatch(source, /generateReview/);
    }
  });

  it("L2 resolver is offline and does not call models, holiday SaaS, or geocoders", () => {
    const sources = [
      read("services/socialPlanner/geography/resolveSocialPlannerGeography.ts"),
      read("services/socialPlanner/calendar/composeSocialCalendarContext.ts"),
      read("services/socialPlanner/calendar/socialCalendarOpportunities.ts"),
      read("services/socialPlanner/calendar/socialCalendarTemporal.ts"),
      read("services/socialPlanner/calendar/dateHolidaysJurisdictionProvider.ts"),
    ];

    for (const source of sources) {
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /calendarific|nager\.date|timeapi|googleapis/i);
      assert.doesNotMatch(source, /openrouter|anthropic|openai/i);
    }
  });

  it("L3 reuses existing intelligence services without mutating them", () => {
    const composer = read(
      "services/socialPlanner/intelligence/composeSocialPlannerIntelligence.ts",
    );
    const sources = read(
      "services/socialPlanner/intelligence/socialPlannerIntelligenceSources.ts",
    );

    assert.match(composer, /composeSocialCalendarContext/);
    assert.match(sources, /buildBrainContextForOrganization/);
    assert.match(sources, /loadOrganizationDeepWebsiteIntelligence/);
    assert.match(sources, /getActiveTrendSocialPromptInstruction/);
    assert.match(sources, /getPersonas/);
    assert.match(sources, /getProspects/);
    assert.match(sources, /listSeoReports/);
    assert.match(sources, /listAdCampaigns/);
    assert.doesNotMatch(composer, /generateReview/);
    assert.doesNotMatch(sources, /generateReview/);
    assert.doesNotMatch(composer, /openrouter|anthropic|openai/i);
    assert.doesNotMatch(sources, /\.update\(|\.insert\(|\.upsert\(/);
    assert.doesNotMatch(composer, /\.update\(|\.insert\(|\.upsert\(/);
    assert.doesNotMatch(composer, /thinkDifferentlyWorkflow/);
    assert.doesNotMatch(sources, /claim_athena_/);

    const ads = read("services/ads/adsContextComposer.ts");
    const seo = read("services/seo/seoContextComposer.ts");
    assert.doesNotMatch(ads, /socialPlanner|Social Planner/);
    assert.doesNotMatch(seo, /socialPlanner|Social Planner/);
  });

  it("L4 generation stays server-only and does not persist, wire jobs, or add UI", () => {
    const service = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    const prompts = read(
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
    );
    const validator = read(
      "services/socialPlanner/generation/validateSocialCalendarPackage.ts",
    );

    assert.match(service, /generateReview/);
    assert.doesNotMatch(service, /athena_social_calendars/);
    assert.doesNotMatch(service, /claim_athena_social_calendar/);
    assert.doesNotMatch(service, /thinkDifferentlyWorkflow/);
    assert.doesNotMatch(prompts, /from\("athena_social_calendars"\)/);
    assert.doesNotMatch(validator, /\.insert\(|\.update\(|\.upsert\(/);

    const ads = read("services/ads/adsContextComposer.ts");
    const seo = read("services/seo/seoContextComposer.ts");
    const estimate = read("services/estimate/estimateGenerationPipeline.ts");
    assert.doesNotMatch(ads, /socialPlanner\/generation/);
    assert.doesNotMatch(seo, /socialPlanner\/generation/);
    assert.doesNotMatch(estimate, /socialPlanner\/generation/);
  });

  it("L5 stays server-only, does not persist, and does not add UI or jobs", () => {
    const loader = read(
      "services/socialPlanner/diversity/loadSocialPlannerSocialMemory.ts",
    );
    const orchestrator = read(
      "services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar.ts",
    );
    const similarity = read(
      "services/socialPlanner/diversity/socialPlannerSimilarity.ts",
    );
    const evaluate = read(
      "services/socialPlanner/diversity/evaluateHistoricalDiversity.ts",
    );

    assert.match(loader, /athena_social_calendars/);
    assert.match(loader, /SOCIAL_PLANNER_READY_HISTORY_QUERY|historyLoader/);
    assert.doesNotMatch(loader, /supabaseAdmin/);
    assert.doesNotMatch(orchestrator, /\.insert\(|\.update\(|\.upsert\(/);
    assert.doesNotMatch(orchestrator, /claim_athena_social_calendar/);
    assert.doesNotMatch(similarity, /openrouter|pgvector|openai|anthropic/i);
    assert.doesNotMatch(evaluate, /openrouter|pgvector|openai|anthropic/i);
    assert.doesNotMatch(similarity, /from\("athena_social_calendars"\)/);

    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /social_calendar_diversity_repair: "analysis"/);
    assert.match(routing, /social_calendar_repair: "analysis"/);
    assert.match(routing, /estimate_package: "premiumStrategicOutput"/);
  });

  it("L8 does not alter existing Athena Think Differently systems or add a migration", () => {
    const l8 = [
      read("services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar.ts"),
      read("services/socialPlanner/thinkDifferently/socialPlannerSourceDivergence.ts"),
      read("services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyPrompt.ts"),
      read("app/api/social-planner/[id]/think-differently/route.ts"),
    ];
    for (const source of l8) {
      assert.doesNotMatch(source, /thinkDifferentlyWorkflow/);
      assert.doesNotMatch(source, /deployment_assets_think_differently/);
      assert.doesNotMatch(source, /from\("athena_executive_intelligence_versions"\)/);
    }
    const persona = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const da = read(
      "services/brain/generationContracts/thinkDifferentlyDeploymentAssetDivergence.ts",
    );
    assert.doesNotMatch(persona, /socialPlanner\/thinkDifferently/);
    assert.doesNotMatch(da, /socialPlanner\/thinkDifferently/);
    assert.doesNotMatch(read("components/discussions/ThinkDifferentlyButton.tsx"), /social-planner/);
  });

  it("Social Planner migrations stay additive and do not amend Ads or Estimate", () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter(
      (name) => name.endsWith(".sql"),
    );
    const socialMigrations = migrations.filter((name) =>
      name.includes("social_calendar"),
    );
    assert.deepEqual(socialMigrations, [
      "20260819000001_create_athena_social_calendars.sql",
      "20260820000001_create_athena_social_calendar_conversation.sql",
    ]);
    assert.ok(migrations.includes("20260809000003_athena_estimate_prospect_target.sql"));
    assert.ok(migrations.includes("20260802000001_create_ad_campaigns.sql"));
  });
});
