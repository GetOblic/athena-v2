import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  advanceCoalescedRefreshContinuity,
  createContinuityTrackState,
  FOLLOW_UP_HANDOFF_MAX_POLLS,
  preferFollowUpTrigger,
} from "../../lib/generationContinuity";
import {
  buildContinuityFromTrackOptions,
  evaluateRegenerationPoll,
  isFullPipelineRegenerationComplete,
} from "../../lib/discussionRegenerationStatus";

const ROOT = process.cwd();

describe("Prospect generation continuity — follow-up trigger preference", () => {
  it("preserves manual_refresh over discussion_update", () => {
    assert.equal(
      preferFollowUpTrigger("discussion_update", "manual_refresh"),
      "manual_refresh",
    );
    assert.equal(
      preferFollowUpTrigger("manual_refresh", "discussion_update"),
      "manual_refresh",
    );
  });

  it("repeated Refresh keeps a single preferred manual_refresh intent", () => {
    let preferred = preferFollowUpTrigger(null, "manual_refresh");
    preferred = preferFollowUpTrigger(preferred, "manual_refresh");
    preferred = preferFollowUpTrigger(preferred, "manual_refresh");
    assert.equal(preferred, "manual_refresh");
  });
});

describe("Prospect generation continuity — coalesced Refresh state machine", () => {
  it("Refresh with no follow-up completes via legacy pipeline rules", () => {
    const baseline = {
      latestAnalysisUpdatedAt: "2026-07-14T00:00:00.000Z",
      blueprintUpdatedAt: "2026-07-14T00:00:00.000Z",
    };
    const current = {
      ...baseline,
      regenerationInFlight: false,
      pendingGenerationFollowUp: false,
      blueprintUpdatedAt: "2026-07-14T00:05:00.000Z",
      latestAnalysisUpdatedAt: "2026-07-14T00:05:00.000Z",
    };
    assert.equal(
      isFullPipelineRegenerationComplete(baseline, current, Date.now() - 1_000),
      true,
    );
  });

  it("parent terminal does not complete when follow-up is pending", () => {
    let state = createContinuityTrackState({
      awaitingFollowUp: true,
      parentJobId: "parent-1",
    });

    // Parent still active
    let decision = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: true,
      pendingGenerationFollowUp: true,
      jobId: "parent-1",
      jobStatus: "processing",
    });
    assert.equal(decision.action, "continue");
    state = decision.state;

    // Parent gone, flag still set
    decision = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: false,
      pendingGenerationFollowUp: true,
      jobId: null,
      jobStatus: null,
    });
    assert.equal(decision.action, "continue");
    assert.notEqual(decision.state.phase, "done");
  });

  it("client discovers and tracks materialized follow-up", () => {
    let state = createContinuityTrackState({
      awaitingFollowUp: true,
      parentJobId: "parent-1",
    });

    const decision = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: true,
      pendingGenerationFollowUp: false,
      jobId: "follow-2",
      jobStatus: "queued",
    });
    assert.equal(decision.action, "continue");
    assert.equal(decision.state.phase, "followup");
    assert.equal(decision.state.trackedJobId, "follow-2");
    assert.equal(decision.note, "follow_up_materialized");
  });

  it("logical Refresh completes only after follow-up is terminal", () => {
    let state = createContinuityTrackState({
      awaitingFollowUp: true,
      parentJobId: "parent-1",
    });

    state = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: true,
      pendingGenerationFollowUp: false,
      jobId: "follow-2",
      jobStatus: "processing",
    }).state;

    const stillRunning = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: true,
      pendingGenerationFollowUp: false,
      jobId: "follow-2",
      jobStatus: "processing",
    });
    assert.equal(stillRunning.action, "continue");

    const done = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: false,
      pendingGenerationFollowUp: false,
      jobId: null,
      jobStatus: null,
      latestJobId: "follow-2",
      latestJobStatus: "completed",
      currentVersionId: "version-9",
    });
    assert.equal(done.action, "complete");
    assert.equal(done.state.phase, "done");
  });

  it("terminal follow-up failure is failure, not success", () => {
    let state = createContinuityTrackState({
      awaitingFollowUp: true,
      parentJobId: "parent-1",
    });
    state = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: true,
      pendingGenerationFollowUp: false,
      jobId: "follow-2",
      jobStatus: "processing",
    }).state;

    const failed = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: false,
      pendingGenerationFollowUp: false,
      jobId: null,
      jobStatus: null,
      latestJobId: "follow-2",
      latestJobStatus: "failed",
      latestJobErrorMessage: "OpenRouter timed out",
    });
    assert.equal(failed.action, "fail");
    if (failed.action === "fail") {
      assert.match(failed.error, /timed out|failed/i);
    }
  });

  it("evaluateRegenerationPoll does not complete coalesced parent early", () => {
    const continuity = buildContinuityFromTrackOptions({
      followUpRequested: true,
      parentJobId: "parent-1",
    });
    const result = evaluateRegenerationPoll({
      baseline: {
        latestAnalysisUpdatedAt: "2026-07-14T00:00:00.000Z",
        blueprintUpdatedAt: "2026-07-14T00:00:00.000Z",
      },
      current: {
        latestAnalysisId: "a",
        latestAnalysisCreatedAt: null,
        latestAnalysisUpdatedAt: "2026-07-14T00:10:00.000Z",
        blueprintUpdatedAt: "2026-07-14T00:10:00.000Z",
        regenerationInFlight: false,
        pendingGenerationFollowUp: true,
        jobId: null,
      },
      queuedAtMs: Date.now() - 1_000,
      continuity,
    });
    assert.equal(result.decision, "continue");
  });

  it("handoff waits before completing without a follow-up job", () => {
    let state = createContinuityTrackState({
      awaitingFollowUp: true,
      parentJobId: "parent-1",
    });

    // Enter handoff
    let decision = advanceCoalescedRefreshContinuity(state, {
      regenerationInFlight: false,
      pendingGenerationFollowUp: false,
      jobId: null,
      jobStatus: null,
      latestJobId: "parent-1",
      latestJobStatus: "completed",
    });
    assert.equal(decision.action, "continue");
    assert.equal(decision.state.phase, "handoff");
    state = decision.state;

    for (let i = 0; i < FOLLOW_UP_HANDOFF_MAX_POLLS; i += 1) {
      decision = advanceCoalescedRefreshContinuity(state, {
        regenerationInFlight: false,
        pendingGenerationFollowUp: false,
        jobId: null,
        jobStatus: null,
        latestJobId: "parent-1",
        latestJobStatus: "completed",
        currentVersionId: "v1",
      });
      state = decision.state;
      if (i < FOLLOW_UP_HANDOFF_MAX_POLLS - 1) {
        assert.equal(decision.action, "continue");
      }
    }
    assert.equal(decision.action, "complete");
  });
});

describe("Prospect generation continuity — API and import contracts", () => {
  it("Refresh API reports coalesce and followUpRequested fields", () => {
    const source = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    assert.match(source, /followUpRequested/);
    assert.match(source, /coalesced/);
    assert.match(source, /parentJobId/);
    assert.match(source, /triggerType:\s*"manual_refresh"/);
  });

  it("enqueue coalesce stores Refresh trigger intent", () => {
    const runner = readFileSync(
      join(ROOT, "services/generationJobs/generationJobRunner.ts"),
      "utf8",
    );
    assert.match(runner, /triggerType/);
    assert.match(runner, /markDiscussionPendingGenerationFollowUp/);
    const executor = readFileSync(
      join(ROOT, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /manual_refresh/);
    assert.match(executor, /follow_up_materialized/);
  });

  it("status API exposes pending follow-up without enqueue", () => {
    const source = readFileSync(
      join(ROOT, "app/api/discussions/[id]/status/route.ts"),
      "utf8",
    );
    assert.match(source, /pendingGenerationFollowUp/);
    assert.match(source, /getLatestGenerationJobForDiscussion/);
    assert.match(source, /Does NOT claim/);
    assert.doesNotMatch(source, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(source, /ensureProspectGenerationQueued/);
  });

  it("Prospect page load does not enqueue generation", () => {
    const source = readFileSync(
      join(ROOT, "app/prospects/[id]/page.tsx"),
      "utf8",
    );
    assert.doesNotMatch(source, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(source, /enqueueDiscussionGenerationJob/);
    assert.match(source, /getExecutiveVersionsForDiscussionPage/);
  });

  it("CSV import persistence and enqueue path unchanged in structure", () => {
    const importer = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(importer, /Persist \+ enqueue only/);
    assert.match(importer, /no homepage scrape in the HTTP path/);
    assert.match(importer, /prepareProspectBridgeBeforeGeneration/);
    assert.match(importer, /triggerType:\s*options\?\.triggerType \?\? "discussion_import"/);
  });

  it("Deployment Asset prompt, parser, and routing remain untouched by this repair", () => {
    // Continuity repair must not touch these files in the working tree vs HEAD.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const changed = execSync("git diff HEAD --name-only", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const protectedPath of [
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      "lib/deploymentAssets.ts",
      "lib/llm/modelRouting.ts",
      "services/ai/prompts/prospectDeploymentAssetsConstraints.ts",
      "services/assetBlueprints/assetBlueprintService.ts",
    ]) {
      assert.ok(
        !changed.includes(protectedPath),
        `protected file unexpectedly modified: ${protectedPath}`,
      );
    }
  });

  it("no Sprint 2B content-asset or crawler files restored", () => {
    for (const file of [
      "services/ai/prompts/knowledgeBaseEnhancementConstraints.ts",
      "services/ai/prompts/substackPostConstraints.ts",
      "services/ai/prompts/redditPostConstraints.ts",
      "services/prospects/prospectWebsiteDiscovery.ts",
    ]) {
      try {
        readFileSync(join(ROOT, file), "utf8");
        assert.fail(`forbidden file present: ${file}`);
      } catch (error) {
        assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
      }
    }
  });

  it("client tracks coalesced Refresh via continuity options", () => {
    const provider = readFileSync(
      join(ROOT, "components/discussions/DiscussionRegenerationProvider.tsx"),
      "utf8",
    );
    assert.match(provider, /evaluateRegenerationPoll/);
    assert.match(provider, /followUpRequested/);
    assert.match(provider, /buildContinuityFromTrackOptions/);
    assert.doesNotMatch(provider, /ensureProspectGenerationQueued/);

    const editor = readFileSync(
      join(ROOT, "components/prospects/ProspectMetadataEditor.tsx"),
      "utf8",
    );
    assert.match(editor, /followUpRequested:\s*Boolean\(payload\.followUpRequested\)/);
  });

  it("in-place Current Version patch clears auto-select stall", () => {
    const workspace = readFileSync(
      join(ROOT, "components/discussions/ExecutiveIntelligenceWorkspace.tsx"),
      "utf8",
    );
    assert.match(workspace, /In-place Current patch/);
    assert.match(
      workspace,
      /currentVersion\.id === pending\.baselineCurrentVersionId/,
    );
  });
});
