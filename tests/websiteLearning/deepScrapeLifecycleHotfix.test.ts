import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  formatDeepScrapeErrorMessage,
  formatDeepScrapeStatusLabel,
  DEEP_SCRAPE_STAGES,
} from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  assertLegalDeepScrapeTransition,
  assertPersistedDeepScrapeStage,
  coerceHeartbeatStage,
  DEEP_SCRAPE_PERSISTED_STAGES,
  DeepScrapeStateTransitionError,
  isLegalDeepScrapeTransition,
  isPersistedDeepScrapeStage,
  LEGAL_DEEP_SCRAPE_TRANSITIONS,
  mapProgressStageToPersisted,
} from "../../services/websiteLearning/deepScrape/deepScrapeStages";

const ROOT = path.join(__dirname, "../..");

const MIGRATION = readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260723000001_create_website_deep_scrape_jobs.sql",
  ),
  "utf8",
);

function extractDbStages(sql: string): string[] {
  const match = sql.match(
    /current_stage in \(\s*([\s\S]*?)\)/,
  );
  assert.ok(match, "migration must declare current_stage check");
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
}

describe("Deep Scrape lifecycle — authoritative stages", () => {
  it("1. every runtime persisted stage belongs to the DB-allowed union", () => {
    const dbStages = extractDbStages(MIGRATION);
    assert.deepEqual([...DEEP_SCRAPE_PERSISTED_STAGES].sort(), [...dbStages].sort());
    assert.deepEqual([...DEEP_SCRAPE_STAGES].sort(), [...dbStages].sort());
    for (const stage of DEEP_SCRAPE_PERSISTED_STAGES) {
      assert.equal(isPersistedDeepScrapeStage(stage), true);
    }
  });

  it("2. heartbeat mapping refuses undefined/null/empty as stage writes", () => {
    assert.equal(mapProgressStageToPersisted(undefined), null);
    assert.equal(mapProgressStageToPersisted(null), null);
    assert.equal(mapProgressStageToPersisted(""), null);
  });

  it("3. heartbeat cannot persist a UI label or rendering phase as current_stage", () => {
    assert.equal(mapProgressStageToPersisted("rendering"), "crawling");
    assert.equal(mapProgressStageToPersisted("Synthesizing"), null);
    assert.equal(mapProgressStageToPersisted("Generating Executive Intelligence"), null);
    assert.equal(mapProgressStageToPersisted("awaiting_follow_on"), null);
    assert.equal(mapProgressStageToPersisted("publishing"), null);
    assert.equal(isPersistedDeepScrapeStage("rendering"), false);
  });

  it("4. invalid transition is rejected before any DB semantics", () => {
    assert.equal(isLegalDeepScrapeTransition("synthesizing", "crawling"), false);
    assert.equal(isLegalDeepScrapeTransition("persisting", "synthesizing"), false);
    assert.equal(isLegalDeepScrapeTransition("completed", "discovering"), false);
    assert.equal(isLegalDeepScrapeTransition("failed", "crawling"), false);
    assert.equal(isLegalDeepScrapeTransition("regenerating", "crawling"), false);
    assert.throws(
      () => assertLegalDeepScrapeTransition("synthesizing", "crawling"),
      (error: unknown) =>
        error instanceof DeepScrapeStateTransitionError &&
        error.code === "DEEP_SCRAPE_STATE_TRANSITION_INVALID",
    );
  });

  it("5. exact production defect: rendering must never be a persisted stage", () => {
    const dbStages = extractDbStages(MIGRATION);
    assert.ok(!dbStages.includes("rendering"));
    assert.equal(mapProgressStageToPersisted("rendering"), "crawling");
    assert.ok(!DEEP_SCRAPE_PERSISTED_STAGES.includes("rendering" as never));
    assert.throws(
      () => assertPersistedDeepScrapeStage("rendering", "heartbeat"),
      DeepScrapeStateTransitionError,
    );

    const types = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/deepScrapeJobTypes.ts",
      ),
      "utf8",
    );
    const stages = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeStages.ts"),
      "utf8",
    );
    const service = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/deepScrapeJobService.ts",
      ),
      "utf8",
    );
    const heartbeat = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/deepScrapeHeartbeat.ts",
      ),
      "utf8",
    );
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );

    assert.match(stages, /mapProgressStageToPersisted/);
    assert.match(stages, /rendering.*crawling|=== \"rendering\"/);
    assert.match(service, /assertPersistedDeepScrapeStage/);
    assert.match(service, /DEEP_SCRAPE_STATE_TRANSITION_INVALID/);
    assert.match(heartbeat, /mapProgressStageToPersisted|coerceHeartbeatStage/);
    assert.match(executor, /phase: progress\.stage === \"rendering\"/);
    assert.doesNotMatch(
      types,
      /DEEP_SCRAPE_STAGES = \[[^\]]*rendering/s,
    );
  });
});

describe("Deep Scrape lifecycle — transitions and checkpoints", () => {
  it("14. crawl completion cannot transition back to crawling", () => {
    assert.equal(isLegalDeepScrapeTransition("synthesizing", "crawling"), false);
    assert.equal(coerceHeartbeatStage("synthesizing", "crawling"), null);
    assert.equal(coerceHeartbeatStage("synthesizing", "rendering"), null);
  });

  it("24/25. brain/prospect legal Phase B transitions", () => {
    assert.ok(LEGAL_DEEP_SCRAPE_TRANSITIONS.persisting.includes("retraining"));
    assert.ok(LEGAL_DEEP_SCRAPE_TRANSITIONS.persisting.includes("regenerating"));
    assert.ok(LEGAL_DEEP_SCRAPE_TRANSITIONS.retraining.includes("completed"));
    assert.ok(LEGAL_DEEP_SCRAPE_TRANSITIONS.regenerating.includes("completed"));
  });

  it("expected happy-path transition chain is legal", () => {
    const chain: Array<[string, string]> = [
      ["queued", "discovering"],
      ["discovering", "crawling"],
      ["crawling", "synthesizing"],
      ["synthesizing", "persisting"],
      ["persisting", "retraining"],
      ["retraining", "completed"],
      ["persisting", "regenerating"],
      ["regenerating", "completed"],
    ];
    for (const [from, to] of chain) {
      assert.equal(isLegalDeepScrapeTransition(from, to), true, `${from}→${to}`);
    }
  });
});

describe("Deep Scrape lifecycle — source contracts", () => {
  const heartbeatSrc = readFileSync(
    path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeHeartbeat.ts"),
    "utf8",
  );
  const executorSrc = readFileSync(
    path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
    "utf8",
  );
  const serviceSrc = readFileSync(
    path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeJobService.ts"),
    "utf8",
  );
  const crawlEngineSrc = readFileSync(
    path.join(ROOT, "services/websiteLearning/deepScrape/crawlEngine.ts"),
    "utf8",
  );
  const observabilitySrc = readFileSync(
    path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
    "utf8",
  );
  const workerSrc = readFileSync(
    path.join(ROOT, "workers/athenaWorker.ts"),
    "utf8",
  );
  const brainStatusSrc = readFileSync(
    path.join(ROOT, "app/api/identity/deep-scrape/status/route.ts"),
    "utf8",
  );
  const buttonSrc = readFileSync(
    path.join(ROOT, "components/identity/DeepScrapeWebsiteButton.tsx"),
    "utf8",
  );

  it("6. one claimed job starts one heartbeat timer", () => {
    assert.match(heartbeatSrc, /class DeepScrapeHeartbeatController/);
    assert.match(heartbeatSrc, /if \(this\.started \|\| this\.closed\) return/);
    assert.match(executorSrc, /heartbeat\.start\(\)/);
    assert.equal((executorSrc.match(/setInterval/g) || []).length, 0);
  });

  it("7/8/9. heartbeat stopped after success, terminal failure, retryable failure", () => {
    assert.match(executorSrc, /finally \{\s*await heartbeat\.stop\(\)/);
    assert.match(heartbeatSrc, /deep_scrape_heartbeat_stopped/);
  });

  it("10. late heartbeat callback performs no write when closed", () => {
    assert.match(heartbeatSrc, /if \(this\.closed \|\| this\.abort\.signal\.aborted\)/);
  });

  it("11. synthesis longer than heartbeat keeps lease via interval renew", () => {
    assert.match(heartbeatSrc, /setInterval/);
    assert.match(heartbeatSrc, /performHeartbeat\(null, null, \"interval\"\)/);
  });

  it("12. heartbeat transport failure does not immediately claim-lost", () => {
    assert.match(heartbeatSrc, /reason === \"transport\"|reason: \"transport\"/);
    assert.match(heartbeatSrc, /consecutiveTransportFailures/);
    assert.match(heartbeatSrc, /maxTransportRetries/);
  });

  it("13. heartbeat validation failure is non-retryable lifecycle error", () => {
    assert.match(serviceSrc, /DEEP_SCRAPE_STATE_TRANSITION_INVALID/);
    assert.match(executorSrc, /DEEP_SCRAPE_STATE_TRANSITION_INVALID/);
    assert.match(executorSrc, /DEEP_SCRAPE_STATE_TRANSITION_INVALID\"\s*\n\s*\? false/);
  });

  it("15/16/35. synthesis checkpoint reuse skips Gemini on reclaim", () => {
    assert.match(executorSrc, /deep_scrape_checkpoint_reused/);
    assert.match(executorSrc, /checkpointIntelligence|synthesisSkipped: true/);
    assert.match(executorSrc, /persistSynthesisCheckpoint/);
    assert.match(crawlEngineSrc, /deep_scrape_synthesis_started/);
    assert.match(crawlEngineSrc, /deep_scrape_synthesis_completed/);
  });

  it("17/18. prospect follow-on enqueued once and reused", () => {
    assert.match(executorSrc, /deep_scrape_follow_on_reused/);
    assert.match(executorSrc, /follow_on_generation_job_id/);
    assert.match(executorSrc, /ensureProspectGenerationQueued/);
  });

  it("19/20/21. completion/failure idempotency helpers", () => {
    assert.match(serviceSrc, /existing\?\.status === \"completed\"/);
    assert.match(serviceSrc, /existing\.status === \"failed\"/);
    assert.match(executorSrc, /job\.status === \"completed\"/);
  });

  it("22/23. polling stops on completed/failed via isActive", () => {
    assert.match(brainStatusSrc, /isActive/);
    assert.match(brainStatusSrc, /queued.*processing.*awaiting_follow_on.*retryable/s);
    assert.match(buttonSrc, /if \(!available \|\| !isActive\) return/);
  });

  it("26. worker shutdown clears heartbeat via shouldStop + finally stop", () => {
    assert.match(workerSrc, /shouldStop: \(\) => stopping/);
    assert.match(executorSrc, /options\?\.shouldStop/);
    assert.match(executorSrc, /await heartbeat\.stop\(\)/);
  });

  it("27. concurrency remains 1", () => {
    assert.match(workerSrc, /concurrency must be 1/);
  });

  it("G. awaiting_follow_on is status/progress, not current_stage", () => {
    assert.match(executorSrc, /status: \"awaiting_follow_on\"/);
    assert.match(executorSrc, /current_stage: \"regenerating\"/);
    assert.doesNotMatch(
      executorSrc,
      /current_stage:\s*\"awaiting_follow_on\"/,
    );
    assert.ok(!extractDbStages(MIGRATION).includes("awaiting_follow_on"));
  });

  it("J. lifecycle failure message is user-readable", () => {
    assert.match(
      formatDeepScrapeErrorMessage("DEEP_SCRAPE_STATE_TRANSITION_INVALID"),
      /lost a valid processing state/i,
    );
    assert.doesNotMatch(
      formatDeepScrapeErrorMessage("DEEP_SCRAPE_STATE_TRANSITION_INVALID"),
      /current_stage_check/,
    );
  });

  it("34. manual failed row renders terminal UI state", () => {
    assert.equal(
      formatDeepScrapeStatusLabel({
        status: "failed",
        current_stage: "synthesizing",
      }),
      "Failed",
    );
    assert.equal(
      formatDeepScrapeStatusLabel({
        status: "completed",
        current_stage: "completed",
      }),
      "Completed",
    );
  });

  it("K. lifecycle observability events are registered", () => {
    for (const event of [
      "deep_scrape_job_claimed",
      "deep_scrape_heartbeat_started",
      "deep_scrape_heartbeat_succeeded",
      "deep_scrape_heartbeat_failed",
      "deep_scrape_heartbeat_stopped",
      "deep_scrape_stage_transition",
      "deep_scrape_stage_transition_rejected",
      "deep_scrape_checkpoint_reused",
      "deep_scrape_synthesis_started",
      "deep_scrape_synthesis_completed",
      "deep_scrape_follow_on_reused",
      "deep_scrape_job_completed",
      "deep_scrape_job_failed",
    ]) {
      assert.match(observabilitySrc, new RegExp(`"${event}"`));
    }
  });

  it("rendering UI label uses progress.phase while stage stays crawling", () => {
    assert.match(
      formatDeepScrapeStatusLabel({
        status: "processing",
        current_stage: "crawling",
        progress: {
          phase: "rendering",
          pagesRendered: 2,
          pagesTarget: 10,
        },
      }),
      /Rendering JavaScript page 2 of 10/i,
    );
  });

  it("service validates stage before heartbeat RPC (production path)", () => {
    assert.match(serviceSrc, /heartbeat_athena_website_deep_scrape_job/);
    assert.match(serviceSrc, /assertPersistedDeepScrapeStage/);
    // Must reject before RPC when stage is invalid.
    const idxValidate = serviceSrc.indexOf("assertPersistedDeepScrapeStage");
    const idxRpc = serviceSrc.indexOf("heartbeat_athena_website_deep_scrape_job");
    assert.ok(idxValidate > 0 && idxRpc > idxValidate);
  });
});

describe("Deep Scrape lifecycle — no migration required", () => {
  it("15. DB already permits synthesizing; app must stop writing rendering", () => {
    const dbStages = extractDbStages(MIGRATION);
    assert.ok(dbStages.includes("synthesizing"));
    assert.ok(!dbStages.includes("rendering"));
  });
});
