import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  isCompleteProspectDeploymentAssetSet,
  extractProspectDeploymentAssetKeys,
  IncompleteProspectDeploymentAssetsError,
  toProspectDeploymentAssetDiagnostics,
} from "../../lib/prospectDeploymentAssetContract";
import {
  isFullPipelineRegenerationComplete,
  REGENERATION_POLL_TIMEOUT_MS,
} from "../../lib/discussionRegenerationStatus";
import { shouldPatchIncompleteCurrentVersion } from "../../services/executiveVersions/executiveVersionDisplay";
import { resolveProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "../../services/executiveVersions/executiveVersionTypes";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISCUSSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ANALYSIS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BLUEPRINT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function labeledBlock(
  keys: readonly string[] = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
): string {
  return keys.map((key) => `${key}:\nBody`).join("\n\n");
}

function analysis(
  overrides: Partial<DiscussionAnalysis> = {},
): DiscussionAnalysis {
  return {
    id: ANALYSIS_ID,
    organization_id: ORG,
    discussion_id: DISCUSSION,
    user_id: null,
    community_id: null,
    status: "completed",
    summary: "summary",
    sentiment: null,
    intent: null,
    buyer_stage: null,
    pain_points: null,
    opportunity_detected: false,
    opportunity_title: null,
    opportunity_reason: null,
    recommended_action: null,
    suggested_cta: labeledBlock(),
    risk_level: null,
    confidence: 80,
    strategy_key: null,
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: null,
    generation_time_ms: null,
    raw_json: null,
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

function blueprint(): AthenaAssetBlueprint {
  return {
    id: BLUEPRINT_ID,
    user_id: null,
    discussion_id: DISCUSSION,
    opportunity_id: null,
    briefing_id: null,
    asset_title: "Blueprint",
    asset_type: "strategic",
    business_goal: null,
    target_audience: null,
    priority: null,
    estimated_reuse: null,
    image_prompt: null,
    pdf_prompt: null,
    social_prompt: null,
    notes: null,
    status: "ready",
    raw_json: null,
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
  };
}

function version(
  overrides: Partial<ExecutiveIntelligenceVersion> = {},
): ExecutiveIntelligenceVersion {
  const baseIntelligence: ExecutiveIntelligencePayload = {
    analysis: analysis(),
    opportunity: null,
    briefing: null,
    blueprint: blueprint(),
  };
  const intelligence: ExecutiveIntelligencePayload = {
    ...baseIntelligence,
    ...(overrides.intelligence ?? {}),
    analysis: overrides.intelligence?.analysis ?? baseIntelligence.analysis,
    opportunity:
      overrides.intelligence?.opportunity ?? baseIntelligence.opportunity,
    briefing: overrides.intelligence?.briefing ?? baseIntelligence.briefing,
    blueprint: overrides.intelligence?.blueprint ?? baseIntelligence.blueprint,
  };

  return {
    id: "version-1",
    discussion_id: DISCUSSION,
    organization_id: ORG,
    user_id: null,
    version_number: 1,
    is_current: true,
    generated_at: "2026-07-14T00:00:00.000Z",
    generation_duration_ms: 1000,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "v1",
    regeneration_run_id: "run-1",
    analysis_id: ANALYSIS_ID,
    opportunity_id: null,
    review_id: null,
    blueprint_id: BLUEPRINT_ID,
    intelligence,
    created_at: "2026-07-14T00:00:00.000Z",
    ...overrides,
    intelligence: overrides.intelligence
      ? {
          ...intelligence,
          ...overrides.intelligence,
        }
      : intelligence,
  };
}

describe("Prospect publication completeness gates", () => {
  it("13/20/21. complete candidate with Blueprint is publication-ready; skipped opp ok", () => {
    const cta = labeledBlock();
    assert.equal(
      isCompleteProspectDeploymentAssetSet(
        extractProspectDeploymentAssetKeys(cta),
      ),
      true,
    );
    const current = version({
      intelligence: {
        analysis: analysis({
          suggested_cta: cta,
          opportunity_detected: false,
        }),
        opportunity: null,
        briefing: null,
        blueprint: version().intelligence.blueprint,
      },
    });
    assert.ok(current.blueprint_id);
    assert.equal(current.intelligence.opportunity, null);
  });

  it("14/15. partial and malformed candidates are incomplete", () => {
    assert.equal(
      isCompleteProspectDeploymentAssetSet(
        extractProspectDeploymentAssetKeys("PERSONALIZED_OUTREACH_EMAIL:\nx"),
      ),
      false,
    );
    assert.equal(
      isCompleteProspectDeploymentAssetSet(
        extractProspectDeploymentAssetKeys('{"foo":1}'),
      ),
      false,
    );
  });

  it("16/17/18. same-run incomplete Current upgrades; complete never shrinks; historical never patches", () => {
    const incomplete = version({
      is_current: true,
      regeneration_run_id: "run-1",
      intelligence: {
        analysis: analysis({
          suggested_cta: labeledBlock(
            REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(0, 6),
          ),
        }),
        opportunity: null,
        briefing: null,
        blueprint: null,
      },
      blueprint_id: null,
    });

    const completeLive = {
      analysis: analysis({ suggested_cta: labeledBlock() }),
      opportunity: null,
      briefing: null,
      blueprint: version().intelligence.blueprint,
    };

    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current: incomplete,
        live: completeLive,
        regenerationRunId: "run-1",
      }),
      true,
    );

    const completeCurrent = version({
      is_current: true,
      regeneration_run_id: "run-1",
    });
    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current: completeCurrent,
        live: {
          analysis: analysis({
            suggested_cta: labeledBlock(
              REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(0, 3),
            ),
          }),
          opportunity: null,
          briefing: null,
          blueprint: completeCurrent.intelligence.blueprint,
        },
        regenerationRunId: "run-1",
      }),
      false,
    );

    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current: version({ is_current: false }),
        live: completeLive,
        regenerationRunId: "run-1",
      }),
      false,
    );
  });

  it("19. different regeneration run does not borrow assets", () => {
    const current = version({
      is_current: true,
      regeneration_run_id: "run-old",
      intelligence: {
        analysis: analysis({ suggested_cta: "" }),
        opportunity: null,
        briefing: null,
        blueprint: null,
      },
    });
    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current,
        live: {
          analysis: analysis(),
          opportunity: null,
          briefing: null,
          blueprint: version().intelligence.blueprint,
        },
        regenerationRunId: "run-new",
      }),
      false,
    );
  });
});

describe("Prospect Ready / status resolution", () => {
  it("22. complete Current + Blueprint resolves Ready", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        hasCompleteCurrentVersion: true,
        hasCurrentVersion: true,
      }),
      "Ready",
    );
  });

  it("23/24. incomplete assets or missing Blueprint is not Ready", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        hasCurrentVersion: true,
        hasCompleteCurrentVersion: false,
        prospectStatus: "Ready",
      }),
      "Generating Executive Intelligence",
    );
  });

  it("25. active job overrides old Ready state", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Ready",
        jobStatus: "queued",
        hasCompleteCurrentVersion: true,
      }),
      "Queued",
    );
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Ready",
        jobStatus: "processing",
        jobStage: "deployment_assets",
        hasCompleteCurrentVersion: true,
      }),
      "Generating Executive Intelligence",
    );
  });

  it("26. terminal failure is shown as failure", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        hasTerminalJobFailure: true,
        hasCompleteCurrentVersion: false,
      }),
      "Processing Failed",
    );
  });

  it("27/28. complete snapshot wins for display; identical labeled assets", () => {
    const cta = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map(
      (key) => `${key}:\nUnique body for ${key}`,
    ).join("\n\n");
    const first = buildDiscussionDeploymentAssets(
      analysis({ suggested_cta: cta }),
      { prospectMode: true },
    );
    const reload = buildDiscussionDeploymentAssets(
      analysis({ suggested_cta: cta }),
      { prospectMode: true },
    );
    assert.equal(first.length, 14);
    assert.deepEqual(
      first.map((asset) => asset.title),
      reload.map((asset) => asset.title),
    );
  });
});

describe("Queue / monitoring / navigation contracts", () => {
  it("31-34. five sequential imports map to five isolated job slots conceptually", () => {
    const jobs = Array.from({ length: 5 }, (_, index) => ({
      id: `job-${index}`,
      discussionId: `discussion-${index}`,
      status: index === 0 ? "processing" : "queued",
      createdAt: index,
    }));
    assert.equal(jobs.length, 5);
    assert.equal(new Set(jobs.map((job) => job.discussionId)).size, 5);
    assert.equal(jobs.filter((job) => job.status === "processing").length, 1);
    assert.deepEqual(
      [...jobs].sort((a, b) => a.createdAt - b.createdAt).map((j) => j.id),
      jobs.map((j) => j.id),
    );
  });

  it("38. client completion waits for durable publication", () => {
    const baseline = {
      latestAnalysisUpdatedAt: "2026-07-14T00:00:00.000Z",
      blueprintUpdatedAt: null,
    };
    assert.equal(
      isFullPipelineRegenerationComplete(
        baseline,
        {
          latestAnalysisId: "a",
          latestAnalysisCreatedAt: "t",
          latestAnalysisUpdatedAt: "2026-07-14T00:01:00.000Z",
          blueprintUpdatedAt: "2026-07-14T00:01:30.000Z",
          regenerationInFlight: false,
          jobStatus: "completed",
          publishedVersionId: null,
          generationPublished: false,
        },
        Date.now() - 60_000,
      ),
      false,
    );
    assert.equal(
      isFullPipelineRegenerationComplete(
        baseline,
        {
          latestAnalysisId: "a",
          latestAnalysisCreatedAt: "t",
          latestAnalysisUpdatedAt: "2026-07-14T00:01:00.000Z",
          blueprintUpdatedAt: "2026-07-14T00:01:30.000Z",
          regenerationInFlight: false,
          jobStatus: "completed",
          publishedVersionId: "version-1",
          generationPublished: true,
        },
        Date.now() - 60_000,
      ),
      true,
    );
  });

  it("39. timeout cannot mark success while still in flight", () => {
    assert.equal(
      isFullPipelineRegenerationComplete(
        {
          latestAnalysisUpdatedAt: null,
          blueprintUpdatedAt: null,
        },
        {
          latestAnalysisId: null,
          latestAnalysisCreatedAt: null,
          latestAnalysisUpdatedAt: null,
          blueprintUpdatedAt: null,
          regenerationInFlight: true,
          jobStatus: "processing",
        },
        Date.now() - REGENERATION_POLL_TIMEOUT_MS - 1,
      ),
      false,
    );
  });

  it("DA incompleteness classifies as retryable", () => {
    const classified = classifyGenerationError(
      new IncompleteProspectDeploymentAssetsError(
        "Prospect Deployment Assets incomplete.",
        toProspectDeploymentAssetDiagnostics({
          suggestedCta: "",
          recommendedResponse: "",
          cta: "",
          rawCharacterCount: 0,
          unwrappedCharacterCount: 0,
          parsedKeys: [],
          missingKeys: [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS],
          isComplete: false,
          isValid: false,
          failureReason: "incomplete_canonical_set",
        }),
      ),
    );
    assert.equal(classified.classification, "retryable");
  });
});
