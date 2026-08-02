import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_WORKER_CONFIG_DEFAULTS,
  resolveAthenaWorkerConfig,
} from "../../services/generationJobs/generationJobWorkerConfig";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Ads V18 non-interference contracts", () => {
  it("1-2. Discussion generation job types and claim RPC names remain unchanged", () => {
    const types = read("services/generationJobs/generationJobTypes.ts");
    assert.match(types, /discussion_id/);
    assert.match(types, /manual_refresh/);
    const service = read("services/generationJobs/generationJobService.ts");
    assert.match(service, /claim_athena_generation_job/);
    assert.doesNotMatch(service, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(service, /ad_campaigns/);
  });

  it("3. Deep scrape claim behavior remains on dedicated RPC", () => {
    const service = read(
      "services/websiteLearning/deepScrape/deepScrapeJobService.ts",
    );
    assert.match(service, /claim_athena_website_deep_scrape_job/);
    assert.doesNotMatch(service, /claim_athena_ad_generation_job/);
  });

  it("4-5. Prospect and Persona routes are unchanged by Ads imports", () => {
    const prospectApi = read("app/api/prospects/route.ts");
    const personaApi = read("app/api/personas/route.ts");
    assert.doesNotMatch(prospectApi, /services\/ads/);
    assert.doesNotMatch(personaApi, /services\/ads/);
    assert.doesNotMatch(prospectApi, /ad_campaigns/);
    assert.doesNotMatch(personaApi, /ad_campaigns/);
  });

  it("6. Ads generation does not import Persona generation service", () => {
    const pipeline = read("services/ads/adsGenerationPipeline.ts");
    const composer = read("services/ads/adsContextComposer.ts");
    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    for (const source of [pipeline, composer, executor]) {
      assert.doesNotMatch(source, /personaGeneration/);
      assert.doesNotMatch(source, /generatePersonaCandidate/);
      assert.doesNotMatch(source, /planCoverage/);
    }
  });

  it("7. Prospect/Persona ads_content is read-only context evidence", () => {
    const composer = read("services/ads/adsContextComposer.ts");
    assert.match(composer, /adsContentExcerpt/);
    assert.match(composer, /ads_content is evidence only/);
    assert.doesNotMatch(composer, /\.update\(/);
    assert.doesNotMatch(composer, /ads_content:/);
  });

  it("8. Executive Version persistence is not used for Ads", () => {
    const adsDirFiles = [
      "services/ads/adCampaignService.ts",
      "services/ads/adsGenerationPipeline.ts",
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    ];
    for (const file of adsDirFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /executive_versions/);
      assert.doesNotMatch(source, /createExecutiveVersion/);
      assert.doesNotMatch(source, /executiveVersions/);
    }
  });

  it("9. Deployment Assets are not modified by Ads feature files", () => {
    const deployment = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.doesNotMatch(deployment, /ad_campaigns/);
    assert.doesNotMatch(deployment, /services\/ads/);
  });

  it("10. Discuss with Athena conversation services are untouched", () => {
    const prospectConvo = read(
      "services/prospectConversation/prospectConversationService.ts",
    );
    const personaConvo = read(
      "services/personaConversation/personaConversationService.ts",
    );
    assert.doesNotMatch(prospectConvo, /services\/ads/);
    assert.doesNotMatch(personaConvo, /services\/ads/);
  });

  it("11-12. Worker concurrency remains 1 and PM2 entrypoint unchanged", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_CONCURRENCY: "4",
    });
    assert.equal(config.concurrency, 1);
    assert.equal(ATHENA_WORKER_CONFIG_DEFAULTS.concurrency, 1);

    const ecosystem = read("ecosystem.config.cjs");
    assert.match(ecosystem, /name: "athena-worker"/);
    assert.match(ecosystem, /script: "dist\/worker\/athenaWorker\.js"/);
    assert.match(ecosystem, /ATHENA_WORKER_CONCURRENCY: "1"/);
    assert.equal(
      (ecosystem.match(/name: "athena-worker"/g) ?? []).length,
      1,
    );
  });

  it("13. No existing migration was modified; Ads migration is additive", () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).sort();
    assert.ok(migrations.includes("20260802000001_create_ad_campaigns.sql"));
    assert.ok(migrations.includes("20260730000001_create_personas.sql"));
    assert.ok(
      migrations.includes("20260723000001_create_website_deep_scrape_jobs.sql"),
    );
    const adsMigration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    assert.doesNotMatch(adsMigration, /alter table athena_generation_jobs/);
    assert.doesNotMatch(adsMigration, /alter table discussions/);
  });

  it("14. No existing table receives a required Ads foreign key", () => {
    const adsMigration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    assert.doesNotMatch(adsMigration, /alter table prospects/);
    assert.doesNotMatch(adsMigration, /alter table personas/);
    assert.doesNotMatch(adsMigration, /alter table discussions/);
    assert.doesNotMatch(adsMigration, /add column.*ad_campaign/);
  });

  it("15. No client organization ID is trusted", () => {
    const route = read("app/api/ads/route.ts");
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /requireCurrentOrganizationContext/);
    const composer = read("services/ads/adsContextComposer.ts");
    assert.match(
      composer,
      /never accepts organization ownership from the client|trusted server organizationId/i,
    );
  });

  it("16-17. Ads and Discussion jobs cannot claim each other", () => {
    const adsService = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    const genService = read("services/generationJobs/generationJobService.ts");
    assert.match(adsService, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(adsService, /from\("athena_generation_jobs"\)/);
    assert.match(genService, /claim_athena_generation_job/);
    assert.doesNotMatch(genService, /from\("athena_ad_generation_jobs"\)/);
  });

  it("18-19. Ads deletion is isolated; entity deletes do not cascade to Ads via code", () => {
    const adsDelete = read("services/ads/adCampaignService.ts");
    assert.match(adsDelete, /from\("ad_campaigns"\)/);
    assert.doesNotMatch(adsDelete, /from\("discussions"\)/);
    assert.doesNotMatch(adsDelete, /from\("prospects"\)/);
    assert.doesNotMatch(adsDelete, /from\("personas"\)/);
    assert.doesNotMatch(adsDelete, /executive_versions/);

    const deletePersona = read("services/personas/personaService.ts");
    const deleteProspect = read("services/prospects/prospectService.ts");
    assert.doesNotMatch(deletePersona, /ad_campaigns/);
    assert.doesNotMatch(deleteProspect, /ad_campaigns/);
  });

  it("20. Ads package generation does not mutate Athena Brain data", () => {
    const pipeline = read("services/ads/adsGenerationPipeline.ts");
    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    const composer = read("services/ads/adsContextComposer.ts");
    for (const source of [pipeline, executor, composer]) {
      assert.doesNotMatch(source, /from\("athena_identity"\)/);
      assert.doesNotMatch(source, /updateAthenaIdentity/);
      assert.doesNotMatch(source, /\.update\(/);
      assert.doesNotMatch(source, /retrainBrain|retrainAthena|brain_retrained/);
    }
    assert.match(composer, /buildBrainContextForOrganization/);
    assert.match(composer, /formatBrainContextForPrompt/);
  });

  it("model routing additions are additive for Ads stages", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /ad_campaign_strategy/);
    assert.match(routing, /ad_platform_assets/);
    assert.match(routing, /ad_keyword_themes/);
    assert.match(routing, /discussion_analysis/);
    assert.match(routing, /strategic_blueprint/);
  });

  it("prompt files and TENANT_TABLES registration exist additively", () => {
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsStrategyPrompt.ts")));
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsFacebookPrompt.ts")));
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsInstagramPrompt.ts")));
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsTikTokPrompt.ts")));
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsGoogleSearchPrompt.ts")));
    assert.ok(existsSync(join(ROOT, "services/ai/prompts/ads/adsKeywordThemesPrompt.ts")));
    const tenant = read("lib/tenantDatabase.ts");
    assert.match(tenant, /"ad_campaigns"/);
    assert.doesNotMatch(tenant, /"athena_ad_generation_jobs"/);
  });
});
