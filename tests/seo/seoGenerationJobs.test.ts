import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isActiveSeoGenerationJobStatus,
  mapSeoGenerationJobRow,
} from "../../services/seo/seoGenerationJobs/seoGenerationJobTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("seo generation jobs", () => {
  it("maps job rows and active statuses", () => {
    const job = mapSeoGenerationJobRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      report_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "queued",
      generation_stage: "assembling_context",
      attempt_count: 0,
      max_attempts: 3,
      claimed_by: null,
      claim_token: null,
      claimed_at: null,
      claim_expires_at: null,
      heartbeat_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      error_metadata: null,
      requested_by: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(job.report_id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    assert.equal(isActiveSeoGenerationJobStatus("queued"), true);
    assert.equal(isActiveSeoGenerationJobStatus("processing"), true);
    assert.equal(isActiveSeoGenerationJobStatus("retryable"), true);
    assert.equal(isActiveSeoGenerationJobStatus("completed"), false);
  });

  it("job service uses dedicated SEO RPCs with claim/heartbeat/complete/fail", () => {
    const service = read(
      "services/seo/seoGenerationJobs/seoGenerationJobService.ts",
    );
    assert.match(service, /claim_athena_seo_generation_job/);
    assert.match(service, /heartbeat_athena_seo_generation_job/);
    assert.match(service, /complete_athena_seo_generation_job/);
    assert.match(service, /fail_athena_seo_generation_job/);
    assert.match(service, /enqueueSeoGenerationJob/);
    assert.match(service, /ActiveSeoGenerationJobConflictError/);
    assert.doesNotMatch(service, /claim_athena_generation_job/);
    assert.doesNotMatch(service, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(service, /claim_athena_website_deep_scrape_job/);
  });

  it("executor validates package via pipeline before complete RPC", () => {
    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    assert.match(executor, /runSeoGenerationPipeline/);
    assert.match(executor, /runSeoTechnicalGenerationPipeline/);
    assert.match(executor, /completeSeoGenerationJobWithClaim/);
    assert.match(executor, /packageJson: result\.package/);
    assert.match(executor, /Ready reports are immutable/);
  });

  it("pipeline stages follow assembling→sections→roadmap→validate→completed", () => {
    const pipeline = read("services/seo/seoGenerationPipeline.ts");
    assert.match(pipeline, /assembling_context/);
    assert.match(pipeline, /executive_assessment/);
    assert.match(pipeline, /content_coverage/);
    assert.match(pipeline, /customer_intent/);
    assert.match(pipeline, /commercial_opportunities/);
    assert.match(pipeline, /trust_and_authority/);
    assert.match(pipeline, /ninety_day_roadmap/);
    assert.match(pipeline, /validating/);
    assert.match(pipeline, /validateSeoIntelligencePackage/);
    assert.match(pipeline, /websitePagesAnalyzed: context\.websitePagesAnalyzed/);
  });
});
