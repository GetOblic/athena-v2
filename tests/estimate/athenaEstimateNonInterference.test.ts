import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Estimate L1 non-interference", () => {
  it("17. existing SEO/Ads durable job contracts remain unchanged", () => {
    const seoMigration = read(
      "supabase/migrations/20260805000001_create_seo_reports.sql",
    );
    const adsMigration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    const estimateMigration = read(
      "supabase/migrations/20260809000001_create_athena_estimates.sql",
    );

    assert.match(seoMigration, /claim_athena_seo_generation_job/);
    assert.match(seoMigration, /heartbeat_athena_seo_generation_job/);
    assert.match(seoMigration, /complete_athena_seo_generation_job/);
    assert.match(seoMigration, /fail_athena_seo_generation_job/);
    assert.match(
      seoMigration,
      /athena_seo_generation_jobs_one_active_report/,
    );

    assert.match(adsMigration, /claim_athena_ad_generation_job/);
    assert.match(adsMigration, /heartbeat_athena_ad_generation_job/);
    assert.match(adsMigration, /complete_athena_ad_generation_job/);
    assert.match(adsMigration, /fail_athena_ad_generation_job/);
    assert.match(
      adsMigration,
      /athena_ad_generation_jobs_one_active_campaign/,
    );

    // Estimate migration must not rewrite SEO/Ads tables or RPCs.
    assert.doesNotMatch(estimateMigration, /alter table seo_reports/i);
    assert.doesNotMatch(estimateMigration, /alter table ad_campaigns/i);
    assert.doesNotMatch(
      estimateMigration,
      /alter table athena_seo_generation_jobs/i,
    );
    assert.doesNotMatch(
      estimateMigration,
      /alter table athena_ad_generation_jobs/i,
    );
    assert.doesNotMatch(
      estimateMigration,
      /create or replace function claim_athena_seo_generation_job/i,
    );
    assert.doesNotMatch(
      estimateMigration,
      /create or replace function claim_athena_ad_generation_job/i,
    );

    const seoService = read(
      "services/seo/seoGenerationJobs/seoGenerationJobService.ts",
    );
    const adsService = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    assert.match(seoService, /claim_athena_seo_generation_job/);
    assert.doesNotMatch(seoService, /claim_athena_estimate_generation_job/);
    assert.match(adsService, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(adsService, /claim_athena_estimate_generation_job/);
  });

  it("does not add tenant Estimate APIs or Quote bleed; Master UI is Licensee-scoped", () => {
    assert.equal(existsSync(join(ROOT, "app/api/estimate")), false);
    assert.equal(existsSync(join(ROOT, "app/api/estimates")), false);
    assert.equal(existsSync(join(ROOT, "app/estimate")), false);

    const quotePage = read("app/licensee/quote/page.tsx");
    assert.doesNotMatch(quotePage, /services\/estimate/);
    assert.doesNotMatch(quotePage, /athena_estimates/);

    const migrations = readdirSync(join(ROOT, "supabase/migrations"));
    for (const file of migrations) {
      if (file.includes("athena_estimates")) continue;
      const sql = read(`supabase/migrations/${file}`);
      assert.doesNotMatch(sql, /estimate_pricing_methodology/);
    }
  });

  it("L0 authorization helper remains the ownership gate; L1 contracts stay free of it", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(identity, /export async function assertLicenseeOwnsSubAccount/);

    // L1 contract modules must not call assertLicenseeOwnsSubAccount.
    const estimateFiles = [
      "services/estimate/athenaEstimateTypes.ts",
      "services/estimate/athenaEstimateRequest.ts",
      "services/estimate/athenaEstimateValidation.ts",
      "services/estimate/estimateGenerationJobs/estimateGenerationJobTypes.ts",
    ];
    for (const file of estimateFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /assertLicenseeOwnsSubAccount/);
    }

    // L2 orchestration / create path must use the accepted L0 helper.
    const orchestration = read("services/estimate/athenaEstimateOrchestration.ts");
    assert.match(orchestration, /assertLicenseeOwnsSubAccount/);
  });
});
