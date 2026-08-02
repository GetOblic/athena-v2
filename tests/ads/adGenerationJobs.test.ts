import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isActiveAdGenerationJobStatus,
  mapAdGenerationJobRow,
} from "../../services/ads/adsGenerationJobs/adGenerationJobTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("ad generation jobs", () => {
  it("maps job rows and active statuses", () => {
    const job = mapAdGenerationJobRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      campaign_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    });
    assert.equal(job.campaign_id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    assert.equal(isActiveAdGenerationJobStatus("queued"), true);
    assert.equal(isActiveAdGenerationJobStatus("processing"), true);
    assert.equal(isActiveAdGenerationJobStatus("retryable"), true);
    assert.equal(isActiveAdGenerationJobStatus("completed"), false);
  });

  it("job service uses dedicated Ads RPCs with claim/heartbeat/complete/fail", () => {
    const service = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    assert.match(service, /claim_athena_ad_generation_job/);
    assert.match(service, /heartbeat_athena_ad_generation_job/);
    assert.match(service, /complete_athena_ad_generation_job/);
    assert.match(service, /fail_athena_ad_generation_job/);
    assert.match(service, /enqueueAdGenerationJob/);
    assert.match(service, /ActiveAdGenerationJobConflictError/);
    assert.doesNotMatch(service, /claim_athena_generation_job/);
    assert.doesNotMatch(service, /claim_athena_website_deep_scrape_job/);
  });

  it("executor validates package via pipeline before complete RPC", () => {
    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    assert.match(executor, /runAdsGenerationPipeline/);
    assert.match(executor, /completeAdGenerationJobWithClaim/);
    assert.match(executor, /packageJson: result\.package/);
    assert.match(executor, /Ready campaigns are immutable/);
  });

  it("pipeline stages follow assembling→platforms→validate→completed", () => {
    const pipeline = read("services/ads/adsGenerationPipeline.ts");
    assert.match(pipeline, /assembling_context/);
    assert.match(pipeline, /strategy/);
    assert.match(pipeline, /facebook/);
    assert.match(pipeline, /instagram/);
    assert.match(pipeline, /tiktok/);
    assert.match(pipeline, /google_search/);
    assert.match(pipeline, /keyword_themes/);
    assert.match(pipeline, /validating/);
    assert.match(pipeline, /validateAdCampaignPackage/);
    assert.match(pipeline, /ad_campaign_strategy/);
    assert.match(pipeline, /ad_platform_assets/);
    assert.match(pipeline, /ad_keyword_themes/);
  });

  it("migration enforces active uniqueness and lease recovery claim order", () => {
    const migration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    assert.match(migration, /athena_ad_generation_jobs_one_active_campaign/);
    assert.match(migration, /for update skip locked/);
    assert.match(migration, /claim_expires_at < v_now/);
    assert.match(migration, /status = 'retryable'/);
    assert.match(migration, /revoke all on function claim_athena_ad_generation_job/);
    assert.match(migration, /set search_path = public/);
  });

  it("worker claim order preserves existing jobs ahead of Ads", () => {
    const worker = read("workers/athenaWorker.ts");
    const genIdx = worker.indexOf("claimAndExecuteNextJob");
    const deepIdx = worker.indexOf("claimAndExecuteNextDeepScrapeJob");
    const adsIdx = worker.indexOf("claimAndExecuteNextAdGenerationJob");
    assert.ok(genIdx > 0);
    assert.ok(deepIdx > genIdx);
    assert.ok(adsIdx > deepIdx);
    assert.match(worker, /concurrency remains forced to 1|concurrency must be 1/);
    assert.match(worker, /Ads only when generation \+ deep scrape queues are idle/);
  });
});
