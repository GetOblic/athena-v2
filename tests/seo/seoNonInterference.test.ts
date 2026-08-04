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

describe("SEO V19 non-interference contracts", () => {
  it("does not redesign Deep Scrape architecture or contracts", () => {
    const deepService = read(
      "services/websiteLearning/deepScrape/deepScrapeJobService.ts",
    );
    assert.match(deepService, /claim_athena_website_deep_scrape_job/);
    assert.doesNotMatch(deepService, /claim_athena_seo_generation_job/);
    assert.doesNotMatch(deepService, /seo_reports/);

    const deepTypes = read(
      "services/websiteLearning/deepScrape/deepWebsiteIntelligence.ts",
    );
    assert.match(deepTypes, /DEEP_WEBSITE_INTELLIGENCE_PROVIDER/);
    assert.match(deepTypes, /deep_v1/);
  });

  it("Discussion generation and Ads job contracts remain independent", () => {
    const genService = read("services/generationJobs/generationJobService.ts");
    assert.match(genService, /claim_athena_generation_job/);
    assert.doesNotMatch(genService, /claim_athena_seo_generation_job/);
    assert.doesNotMatch(genService, /seo_reports/);

    const adsService = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    assert.match(adsService, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(adsService, /claim_athena_seo_generation_job/);
    assert.doesNotMatch(adsService, /seo_reports/);
  });

  it("Prospect, Persona, Discussions, Ads routes are not rewritten by SEO imports", () => {
    for (const file of [
      "app/api/prospects/route.ts",
      "app/api/personas/route.ts",
      "app/api/ads/route.ts",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /services\/seo/);
      assert.doesNotMatch(source, /seo_reports/);
    }
  });

  it("SEO does not mutate Brain / Deep Scrape / Ads persistence", () => {
    const pipeline = read("services/seo/seoGenerationPipeline.ts");
    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    const composer = read("services/seo/seoContextComposer.ts");
    for (const source of [pipeline, executor]) {
      assert.doesNotMatch(source, /\.update\(/);
      assert.doesNotMatch(source, /promoteBrainIntelligence/);
      assert.doesNotMatch(source, /enqueueDeepScrape/);
      assert.doesNotMatch(source, /retrainBrain|retrainAthena/);
    }
    // Composer may SELECT athena_identity.website_intelligence, but must not update.
    assert.doesNotMatch(composer, /\.update\(/);
    assert.doesNotMatch(composer, /\.insert\(/);
    assert.match(composer, /\.select\("website_intelligence"\)/);
  });

  it("SEO migration is additive and does not alter Deep Scrape / Ads tables", () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).sort();
    assert.ok(migrations.includes("20260805000001_create_seo_reports.sql"));
    assert.ok(
      migrations.includes("20260723000001_create_website_deep_scrape_jobs.sql"),
    );
    assert.ok(migrations.includes("20260802000001_create_ad_campaigns.sql"));

    const seoMigration = read(
      "supabase/migrations/20260805000001_create_seo_reports.sql",
    );
    assert.doesNotMatch(seoMigration, /alter table athena_website_deep_scrape_jobs/);
    assert.doesNotMatch(seoMigration, /alter table athena_identity/);
    assert.doesNotMatch(seoMigration, /alter table ad_campaigns/);
    assert.doesNotMatch(seoMigration, /alter table discussions/);
    assert.doesNotMatch(seoMigration, /alter table prospects/);
    assert.doesNotMatch(seoMigration, /alter table personas/);
    assert.match(seoMigration, /create table if not exists seo_reports/);
    assert.match(
      seoMigration,
      /create table if not exists athena_seo_generation_jobs/,
    );
  });

  it("worker concurrency remains 1; SEO runs only on idle capacity after Ads", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_CONCURRENCY: "4",
    });
    assert.equal(config.concurrency, 1);
    assert.equal(ATHENA_WORKER_CONFIG_DEFAULTS.concurrency, 1);

    const worker = read("workers/athenaWorker.ts");
    assert.match(worker, /claimAndExecuteNextAdGenerationJob/);
    assert.match(worker, /claimAndExecuteNextSeoGenerationJob/);
    assert.match(worker, /SEO Intelligence only when generation \+ deep scrape \+ Ads/);

    const ecosystem = read("ecosystem.config.cjs");
    assert.equal(
      (ecosystem.match(/name: "athena-worker"/g) ?? []).length,
      1,
    );
  });

  it("model routing and prompts are additive", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /seo_executive_assessment/);
    assert.match(routing, /seo_section_analysis/);
    assert.match(routing, /seo_roadmap/);
    assert.match(routing, /ad_campaign_strategy/);
    assert.match(routing, /discussion_analysis/);

    assert.ok(
      existsSync(
        join(ROOT, "services/ai/prompts/seo/seoExecutiveAssessmentPrompt.ts"),
      ),
    );
    assert.ok(
      existsSync(
        join(ROOT, "services/ai/prompts/seo/seoNinetyDayRoadmapPrompt.ts"),
      ),
    );

    const tenant = read("lib/tenantDatabase.ts");
    assert.match(tenant, /"seo_reports"/);
    assert.doesNotMatch(tenant, /"athena_seo_generation_jobs"/);
  });

  it("SEO public API never trusts client organization ownership", () => {
    const route = read("app/api/seo/route.ts");
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /requireCurrentOrganizationContext/);
    const composer = read("services/seo/seoContextComposer.ts");
    assert.match(
      composer,
      /never accepts organization ownership from the client|trusted server organizationId/i,
    );
  });
});
