/**
 * Athena Estimate V26 L6 — worker queue integration only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("Athena Estimate L6 — worker queue integration", () => {
  it("1/2/3. Estimate claim exists, uses job service/RPC, invokes executor; idle returns false", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    const worker = read("workers/athenaWorker.ts");

    assert.match(executor, /export async function claimAndExecuteNextEstimateGenerationJob/);
    assert.match(executor, /claimNextEstimateGenerationJob/);
    assert.match(executor, /executeClaimedEstimateGenerationJob/);
    assert.match(executor, /if \(!claimed\) return false/);

    assert.match(jobService, /claimNextEstimateGenerationJob/);
    assert.match(jobService, /ESTIMATE_GENERATION_JOB_RPCS\.claim/);
    assert.match(
      read(
        "services/estimate/estimateGenerationJobs/estimateGenerationJobTypes.ts",
      ),
      /claim_athena_estimate_generation_job/,
    );

    assert.match(worker, /claimAndExecuteNextEstimateGenerationJob/);
    assert.match(
      worker,
      /from "@\/services\/estimate\/estimateGenerationJobs\/estimateGenerationJobExecutor"/,
    );
    // Worker must not reimplement generation.
    assert.doesNotMatch(worker, /runEstimateGenerationPipeline|buildEstimateUserPrompt/);
    assert.doesNotMatch(worker, /composeEstimateOrganizationContext/);
    assert.doesNotMatch(worker, /normalizeAndValidateEstimatePackage/);
  });

  it("4-8. frozen claim order: Discussion → Deep → Ads → SEO → Estimate (last)", () => {
    const worker = read("workers/athenaWorker.ts");
    // Measure call sites in the loop (not import order).
    const reconcileIdx = worker.indexOf("await reconcileAwaitingFollowOnJobs()");
    const genIdx = worker.indexOf("claimAndExecuteNextJob(workerId");
    const deepIdx = worker.indexOf(
      "claimAndExecuteNextDeepScrapeJob(workerId",
    );
    const adsIdx = worker.indexOf(
      "claimAndExecuteNextAdGenerationJob(workerId",
    );
    const seoIdx = worker.indexOf(
      "claimAndExecuteNextSeoGenerationJob(workerId",
    );
    const estimateIdx = worker.indexOf(
      "claimAndExecuteNextEstimateGenerationJob(workerId",
    );

    assert.ok(reconcileIdx > 0);
    assert.ok(genIdx > reconcileIdx);
    assert.ok(deepIdx > genIdx);
    assert.ok(adsIdx > deepIdx);
    assert.ok(seoIdx > adsIdx);
    assert.ok(estimateIdx > seoIdx);

    // Estimate is the last claimable generation workload in the loop body.
    const afterEstimate = worker.slice(estimateIdx);
    assert.doesNotMatch(
      afterEstimate,
      /claimAndExecuteNext(Job|DeepScrapeJob|AdGenerationJob|SeoGenerationJob)\(/,
    );
  });

  it("9-12. higher-priority work continues before Estimate; Estimate cannot starve SEO/Ads/Deep/primary", () => {
    const worker = read("workers/athenaWorker.ts");

    // Primary generation continues when it did work.
    assert.match(
      worker,
      /const didWork = await work;[\s\S]*?if \(didWork\) \{\s*continue;/,
    );
    assert.match(
      worker,
      /const didDeepWork = await deepWork;[\s\S]*?if \(didDeepWork\) \{\s*continue;/,
    );
    assert.match(
      worker,
      /const didAdsWork = await adsWork;[\s\S]*?if \(didAdsWork\) \{\s*continue;/,
    );
    assert.match(
      worker,
      /const didSeoWork = await seoWork;[\s\S]*?if \(didSeoWork\) \{\s*continue;/,
    );

    assert.match(
      worker,
      /Athena Estimate only when generation \+ deep scrape \+ Ads \+ SEO queues are idle/,
    );

    // Estimate claim appears only after SEO continue gate.
    const seoContinueIdx = worker.indexOf("if (didSeoWork)");
    const estimateCallIdx = worker.indexOf(
      "claimAndExecuteNextEstimateGenerationJob(workerId",
    );
    assert.ok(seoContinueIdx > 0);
    assert.ok(estimateCallIdx > seoContinueIdx);
  });

  it("13/14. concurrency remains 1; no second PM2 Estimate worker/process", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_CONCURRENCY: "4",
    });
    assert.equal(config.concurrency, 1);
    assert.equal(ATHENA_WORKER_CONFIG_DEFAULTS.concurrency, 1);

    const worker = read("workers/athenaWorker.ts");
    assert.match(worker, /concurrency must be 1/);
    assert.match(worker, /concurrency remains forced to 1|concurrency remains 1/);

    const ecosystem = read("ecosystem.config.cjs");
    assert.equal(
      (ecosystem.match(/name: "athena-worker"/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(ecosystem, /estimate-worker|athena-estimate-worker/i);
    assert.match(ecosystem, /ATHENA_WORKER_CONCURRENCY: "1"/);
    assert.match(ecosystem, /instances: 1/);
  });

  it("15/16/17. claimed Estimate uses L5 executor + durable lease/token; retryable/expired claim in RPC", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    const migration = read(
      "supabase/migrations/20260809000001_create_athena_estimates.sql",
    );

    assert.match(executor, /executeClaimedEstimateGenerationJob/);
    assert.match(executor, /claimToken/);
    assert.match(jobService, /claimToken = randomUUID/);
    assert.match(jobService, /p_claim_token: claimToken/);
    assert.match(jobService, /p_worker_id: input\.workerId/);

    assert.match(migration, /for update skip locked/i);
    assert.match(migration, /claim_expires_at < v_now/);
    assert.match(migration, /status = 'retryable'/);
    assert.match(migration, /claim_athena_estimate_generation_job/);
  });

  it("18. terminal Estimate failure does not crash worker loop", () => {
    const worker = read("workers/athenaWorker.ts");
    assert.match(worker, /catch \(error\)/);
    assert.match(worker, /\[ATHENA_WORKER\] loop_error/);
    assert.match(worker, /await sleep\(config\.pollIntervalMs\)/);
    // Estimate work is awaited inside the try; failures from claim path are contained.
    assert.match(
      worker,
      /try \{[\s\S]*claimAndExecuteNextEstimateGenerationJob[\s\S]*\} catch \(error\)/,
    );
  });

  it("19. Ready Estimate package is not overwritten by stale job processing", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(executor, /Ready Estimates are immutable/);
    assert.match(
      executor,
      /estimate\.status === "Ready" && estimate\.package_json/,
    );
    assert.match(executor, /jobOps\.complete|completeEstimateGenerationJobWithClaim/);
    // Short-circuit completes existing package — no pipeline / LLM.
    const readyBlock = executor.slice(
      executor.indexOf("Ready Estimates are immutable"),
      executor.indexOf("ESTIMATE_ALREADY_READY"),
    );
    assert.doesNotMatch(readyBlock, /runPipeline|runEstimateGenerationPipeline/);
    assert.doesNotMatch(readyBlock, /composeEstimateOrganizationContext/);
  });

  it("20/21. no web/search/external pricing calls; no sensitive prompt/context/package logging", () => {
    const worker = read("workers/athenaWorker.ts");
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );

    for (const src of [worker, executor]) {
      assert.doesNotMatch(
        src,
        /\bweb\.run\b|\bserpapi\b|\bsemrush\b|\bahrefs\b|\bexchangerate\b/i,
      );
    }

    assert.doesNotMatch(worker, /console\.(log|error).*package_json/);
    assert.doesNotMatch(worker, /instructionText|composedTrustedContext|userPrompt/);
    assert.doesNotMatch(executor, /console\.(log|error)\([^\)]*packageJson/);
    assert.doesNotMatch(
      executor,
      /console\.(log|error)\([^\)]*methodology\.instructionText/,
    );
    // Bounded job identifiers only.
    assert.match(executor, /\[ATHENA_ESTIMATE_JOBS\] execute_started/);
    assert.match(executor, /estimateId: job\.estimate_id/);
  });

  it("worker does not introduce Quote or Super Admin Estimate changes", () => {
    const quote = read("app/licensee/quote/page.tsx");
    assert.doesNotMatch(quote, /estimateGenerationJob|athena_estimates/);

    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /SuperAdmin|pricing-methodology/);
    // L6 worker wiring only — UI lives in L7 and must not be imported here.
    assert.doesNotMatch(worker, /LicenseeEstimateClient|LicenseeDashboardClient/);
  });
});
