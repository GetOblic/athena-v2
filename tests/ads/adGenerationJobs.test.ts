import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { classifyAdsError } from "../../services/ads/adsGenerationJobs/adGenerationJobExecutor";
import {
  isActiveAdGenerationJobStatus,
  mapAdGenerationJobRow,
} from "../../services/ads/adsGenerationJobs/adGenerationJobTypes";
import { AdsGenerationPipelineError } from "../../services/ads/adsGenerationPipeline";

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

  it("forwards pipeline error metadata to failAdGenerationJobWithClaim", () => {
    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    assert.match(executor, /errorMetadata: error\.metadata \?\? null/);
    assert.match(executor, /errorMetadata: classified\.errorMetadata/);
    assert.match(executor, /failAdGenerationJobWithClaim/);
  });

  it("MALFORMED_JSON after inner exhaustion stays non-retryable in executor classification", () => {
    const classified = classifyAdsError(
      new AdsGenerationPipelineError({
        code: "MALFORMED_JSON",
        message: "Ads generation produced malformed JSON at stage google_search.",
        stage: "google_search",
        retryable: false,
        metadata: {
          stage: "google_search",
          errorCode: "MALFORMED_JSON",
          parseCategory: "syntax_error",
          innerAttempt: 2,
          innerAttemptMax: 2,
        },
      }),
    );
    assert.equal(classified.code, "MALFORMED_JSON");
    assert.equal(classified.retryable, false);
    assert.equal(classified.stage, "google_search");
    assert.equal(classified.message, "Ads generation produced malformed JSON at stage google_search.");
    assert.deepEqual(classified.errorMetadata, {
      stage: "google_search",
      errorCode: "MALFORMED_JSON",
      parseCategory: "syntax_error",
      innerAttempt: 2,
      innerAttemptMax: 2,
    });
  });

  it("does not reclassify terminal MALFORMED_JSON as a whole-pipeline retry", () => {
    const classified = classifyAdsError(
      new AdsGenerationPipelineError({
        code: "MALFORMED_JSON",
        message: "Ads generation produced malformed JSON at stage google_search.",
        stage: "google_search",
        retryable: false,
      }),
    );
    assert.equal(classified.retryable, false);
    assert.notEqual(classified.code, "ADS_GENERATION_FAILED");
  });

  it("keeps existing retryable classification for provider and generic failures", () => {
    const llmFailed = classifyAdsError(
      new AdsGenerationPipelineError({
        code: "LLM_CALL_FAILED",
        message: "OpenRouter API error: 503 unavailable",
        stage: "google_search",
        retryable: true,
      }),
    );
    assert.equal(llmFailed.code, "LLM_CALL_FAILED");
    assert.equal(llmFailed.retryable, true);
    assert.equal(llmFailed.errorMetadata, null);

    const invalidPackage = classifyAdsError(
      new AdsGenerationPipelineError({
        code: "INVALID_PACKAGE",
        message: "googleSearch.headlines must contain at least 1 item(s).",
        stage: "validating",
        retryable: true,
      }),
    );
    assert.equal(invalidPackage.code, "INVALID_PACKAGE");
    assert.equal(invalidPackage.retryable, true);

    const timeout = classifyAdsError(new Error("network timeout"));
    assert.equal(timeout.code, "ADS_GENERATION_FAILED");
    assert.equal(timeout.retryable, true);

    const rateLimit = classifyAdsError(new Error("rate limit 429"));
    assert.equal(rateLimit.retryable, true);

    const permanent = classifyAdsError(new Error("campaign schema mismatch"));
    assert.equal(permanent.retryable, false);
    assert.equal(permanent.errorMetadata, null);
  });
});
