import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeSuggestedCtaFromBriefing,
  extractSuggestedCtaFromAnalysisRawJson,
  resolveVersionIntelligenceForDisplay,
  shouldPatchIncompleteCurrentVersion,
  withResolvedVersionIntelligence,
} from "../../services/executiveVersions/executiveVersionDisplay";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import type { AthenaReview } from "../../services/reviewService";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "../../services/executiveVersions/executiveVersionTypes";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISCUSSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ANALYSIS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BLUEPRINT_CURRENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BLUEPRINT_HISTORICAL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BLUEPRINT_OTHER_ORG = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function analysis(overrides: Partial<DiscussionAnalysis> = {}): DiscussionAnalysis {
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
    opportunity_detected: true,
    opportunity_title: null,
    opportunity_reason: null,
    recommended_action: null,
    suggested_cta: "",
    risk_level: null,
    confidence: 0.8,
    strategy_key: "default",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: null,
    generation_time_ms: 1000,
    raw_json: null,
    created_at: "2026-07-12T00:00:00.000Z",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function blueprint(
  id: string,
  overrides: Partial<AthenaAssetBlueprint> = {},
): AthenaAssetBlueprint {
  return {
    id,
    discussion_id: DISCUSSION,
    opportunity_id: null,
    briefing_id: null,
    user_id: null,
    asset_title: "Asset",
    asset_type: "PDF",
    business_goal: "goal",
    target_audience: "audience",
    priority: "high",
    estimated_reuse: null,
    image_prompt: "image",
    pdf_prompt: "pdf",
    social_prompt: "social",
    notes: null,
    status: "ready",
    raw_json: {},
    created_at: "2026-07-12T00:01:00.000Z",
    updated_at: "2026-07-12T00:01:00.000Z",
    ...overrides,
  };
}


function briefing(overrides: Partial<AthenaReview> = {}): AthenaReview {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    created_at: "2026-07-12T00:00:00.000Z",
    updated_at: "2026-07-12T00:00:00.000Z",
    organization_id: ORG,
    opportunity_id: null,
    discussion_id: DISCUSSION,
    user_id: null,
    status: "completed",
    summary: null,
    pain_points: null,
    buyer_stage: null,
    recommended_response: null,
    cta: null,
    confidence: 0.8,
    model: null,
    prompt_version: null,
    generation_time_ms: null,
    raw_json: null,
    version: 1,
    approved_by: null,
    approved_at: null,
    notes: null,
    ...overrides,
  };
}

function version(
  overrides: Partial<ExecutiveIntelligenceVersion> & {
    intelligence?: ExecutiveIntelligencePayload;
  } = {},
): ExecutiveIntelligenceVersion {
  const intelligence = overrides.intelligence ?? {
    analysis: analysis(),
    opportunity: null,
    briefing: null,
    blueprint: null,
  };

  return {
    id: "11111111-1111-4111-8111-111111111111",
    discussion_id: DISCUSSION,
    organization_id: ORG,
    user_id: null,
    version_number: 1,
    is_current: true,
    generated_at: "2026-07-12T00:00:00.000Z",
    generation_duration_ms: 1000,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: ANALYSIS_ID,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    intelligence,
    created_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
    intelligence: overrides.intelligence ?? intelligence,
  };
}

describe("executive version display hydration", () => {
  it("Current Version with blueprint_id loads the exact blueprint", () => {
    const exact = blueprint(BLUEPRINT_CURRENT);
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({ blueprint_id: BLUEPRINT_CURRENT }),
      blueprintById: exact,
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nlive" }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint("should-not-win"),
      },
    });

    assert.equal(resolved.blueprint?.id, BLUEPRINT_CURRENT);
  });

  it("Historical Version loads its own blueprint and not Current", () => {
    const historicalBlueprint = blueprint(BLUEPRINT_HISTORICAL);
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        id: "22222222-2222-4222-8222-222222222222",
        version_number: 1,
        is_current: false,
        blueprint_id: BLUEPRINT_HISTORICAL,
        intelligence: {
          analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nold" }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: historicalBlueprint,
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\ncurrent" }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.equal(resolved.blueprint?.id, BLUEPRINT_HISTORICAL);
    assert.notEqual(resolved.blueprint?.id, BLUEPRINT_CURRENT);
  });

  it("Original Version without blueprint does not borrow a newer blueprint", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        blueprint_id: null,
        intelligence: {
          analysis: analysis(),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nlater" }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.equal(resolved.blueprint, null);
    assert.equal(resolved.analysis.suggested_cta, "");
  });

  it("Import/Append/Refresh Current hydrates missing blueprint and CTA from live", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        blueprint_id: null,
        intelligence: {
          analysis: analysis({ suggested_cta: "" }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis({
          suggested_cta: "COMMUNITY_REPLY:\npersisted assets",
        }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    // Same resolution path serves Import, Append & Reprocess, and Refresh.
    assert.equal(resolved.blueprint?.id, BLUEPRINT_CURRENT);
    assert.match(resolved.analysis.suggested_cta ?? "", /COMMUNITY_REPLY/);
  });

  it("Missing blueprint returns empty without crashing", () => {
    const resolved = withResolvedVersionIntelligence({
      version: version({ is_current: true, blueprint_id: null }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis(),
        opportunity: null,
        briefing: null,
        blueprint: null,
      },
    });

    assert.equal(resolved.intelligence.blueprint, null);
  });

  it("Tenant mismatch cannot load another organization’s blueprint", () => {
    // getAssetBlueprintById enforces organization_id in SQL. This guard rejects
    // discussion_id mismatches if a foreign row were ever passed through.
    const foreignDiscussion = blueprint(BLUEPRINT_OTHER_ORG, {
      discussion_id: "99999999-9999-4999-8999-999999999999",
    });

    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        blueprint_id: BLUEPRINT_OTHER_ORG,
      }),
      blueprintById: foreignDiscussion,
      liveIntelligence: null,
    });

    assert.equal(resolved.blueprint, null);
  });

  it("version selection is view-only: resolution never implies generation or Brain events", () => {
    // Pure function: no I/O. Selecting a historical version only remaps snapshot fields.
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        blueprint_id: BLUEPRINT_HISTORICAL,
        intelligence: {
          analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nhistorical" }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_HISTORICAL),
        },
      }),
      blueprintById: blueprint(BLUEPRINT_HISTORICAL),
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\ncurrent" }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.equal(resolved.blueprint?.id, BLUEPRINT_HISTORICAL);
    assert.match(resolved.analysis.suggested_cta ?? "", /historical/);
  });

  it("Workspace sections render when resolved intelligence has assets", async () => {
    const { buildDiscussionDeploymentAssets } = await import(
      "../../lib/deploymentAssets"
    );

    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({ suggested_cta: "" }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis({
          suggested_cta:
            "COMMUNITY_REPLY:\nHello\n\nPRIVATE_MESSAGE:\nHi\n\nSOCIAL_POST:\nPost\n\nFOLLOW_UP:\nFollow\n\nCALL_TO_ACTION:\nCTA",
        }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    const assets = buildDiscussionDeploymentAssets(resolved.analysis);
    assert.ok(assets.length > 0);
    assert.ok(resolved.blueprint);
  });

  it("Snapshot blueprint wins over live for Current when already present", () => {
    const snapshotBlueprint = blueprint(BLUEPRINT_HISTORICAL);
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nsnapshot" }),
          opportunity: null,
          briefing: null,
          blueprint: snapshotBlueprint,
        },
      }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nlive" }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.equal(resolved.blueprint?.id, BLUEPRINT_HISTORICAL);
    assert.match(resolved.analysis.suggested_cta ?? "", /snapshot/);
  });

  it("Incomplete Current publish is detected for patching", () => {
    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current: version({
          is_current: true,
          intelligence: {
            analysis: analysis({ suggested_cta: "" }),
            opportunity: null,
            briefing: null,
            blueprint: null,
          },
        }),
        live: {
          analysis: analysis({
            suggested_cta: "COMMUNITY_REPLY:\ndone",
          }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_CURRENT),
        },
      }),
      true,
    );

    assert.equal(
      shouldPatchIncompleteCurrentVersion({
        current: version({
          is_current: true,
          intelligence: {
            analysis: analysis({
              suggested_cta: "COMMUNITY_REPLY:\ndone",
            }),
            opportunity: null,
            briefing: null,
            blueprint: blueprint(BLUEPRINT_CURRENT),
          },
        }),
        live: {
          analysis: analysis({
            suggested_cta: "COMMUNITY_REPLY:\ndone",
          }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_CURRENT),
        },
      }),
      false,
    );
  });
});

describe("deployment assets recovery for empty suggested_cta", () => {
  it("recovers from analysis.raw_json.deployment_assets.raw_ai_response", () => {
    const rawPayload = JSON.stringify({
      recommended_response:
        "COMMUNITY_REPLY:\nHello\n\nPRIVATE_MESSAGE:\nHi",
      cta: "Book a call",
    });
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({
            suggested_cta: "",
            raw_json: {
              deployment_assets: { raw_ai_response: rawPayload },
            },
          }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_CURRENT),
        },
      }),
      blueprintById: null,
      liveIntelligence: null,
    });

    const assets = buildDiscussionDeploymentAssets(resolved.analysis);
    assert.ok(assets.length >= 2);
    assert.ok(resolved.blueprint);
  });

  it("Prospect Current Version with Deployment Assets and Blueprint renders both", () => {
    const prospectCta =
      "PERSONALIZED_OUTREACH_EMAIL:\nHello Acme\n\nFOLLOW_UP_EMAIL:\nChecking in\n\nLINKEDIN_CONNECTION:\nConnect?\n\nRECOMMENDED_CTA:\nBook a call";
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({ suggested_cta: prospectCta }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_CURRENT),
        },
      }),
      blueprintById: null,
      liveIntelligence: null,
    });

    const assets = buildDiscussionDeploymentAssets(resolved.analysis);
    assert.equal(assets[0]?.title, "Personalized Outreach Email");
    assert.equal(resolved.blueprint?.id, BLUEPRINT_CURRENT);
    assert.ok(assets.length >= 3);
  });

  it("Historical Prospect Version keeps its own assets and does not borrow Current", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        intelligence: {
          analysis: analysis({
            suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\nhistorical outreach",
          }),
          opportunity: null,
          briefing: null,
          blueprint: blueprint(BLUEPRINT_HISTORICAL),
        },
      }),
      blueprintById: blueprint(BLUEPRINT_HISTORICAL),
      liveIntelligence: {
        analysis: analysis({
          suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\ncurrent outreach",
        }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.match(resolved.analysis.suggested_cta ?? "", /historical outreach/);
    assert.equal(resolved.blueprint?.id, BLUEPRINT_HISTORICAL);
  });

  it("Original Prospect Version without Deployment Assets stays empty", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        intelligence: {
          analysis: analysis({ suggested_cta: "" }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: {
        analysis: analysis({
          suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\nlive only",
        }),
        opportunity: null,
        briefing: null,
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });

    assert.equal(
      buildDiscussionDeploymentAssets(resolved.analysis).length,
      0,
    );
    assert.equal(resolved.blueprint, null);
  });

  it("Missing Deployment Assets does not hide a valid Blueprint", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({ suggested_cta: "" }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: blueprint(BLUEPRINT_CURRENT),
      liveIntelligence: null,
    });

    assert.equal(resolved.blueprint?.id, BLUEPRINT_CURRENT);
    assert.equal(
      buildDiscussionDeploymentAssets(resolved.analysis).length,
      0,
    );
  });

  it("Missing Blueprint does not hide valid Deployment Assets", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({
            suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\nKeep me",
          }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: null,
    });

    assert.equal(resolved.blueprint, null);
    assert.equal(
      buildDiscussionDeploymentAssets(resolved.analysis).length,
      1,
    );
  });

  it("composeSuggestedCtaFromBriefing appends CALL_TO_ACTION when missing", () => {
    const composed = composeSuggestedCtaFromBriefing({
      recommended_response: "COMMUNITY_REPLY:\nHello",
      cta: "Book a call",
    });
    assert.match(composed ?? "", /CALL_TO_ACTION/);
    assert.match(composed ?? "", /Book a call/);
  });

  it("extractSuggestedCtaFromAnalysisRawJson recovers prospect labeled plain text", () => {
    const recovered = extractSuggestedCtaFromAnalysisRawJson({
      deployment_assets: {
        raw_ai_response: "PERSONALIZED_OUTREACH_EMAIL:\nHello prospect",
      },
    });
    assert.match(recovered ?? "", /PERSONALIZED_OUTREACH_EMAIL/);
  });

  it("Discussion Deployment Assets remain unaffected by prospect recovery path", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: true,
        intelligence: {
          analysis: analysis({
            suggested_cta:
              "COMMUNITY_REPLY:\nHello\n\nFOLLOW_UP:\nFollow\n\nCALL_TO_ACTION:\nCTA",
          }),
          opportunity: null,
          briefing: null,
          blueprint: null,
        },
      }),
      blueprintById: null,
      liveIntelligence: null,
    });
    const assets = buildDiscussionDeploymentAssets(resolved.analysis);
    assert.equal(assets[0]?.title, "Community Reply");
  });

  it("Passive version viewing is pure resolution with no generation side effects", () => {
    const before = resolveVersionIntelligenceForDisplay({
      version: version({
        is_current: false,
        intelligence: {
          analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nold" }),
          opportunity: null,
          briefing: briefing({
            recommended_response: "COMMUNITY_REPLY:\nold briefing",
          }),
          blueprint: blueprint(BLUEPRINT_HISTORICAL),
        },
      }),
      blueprintById: blueprint(BLUEPRINT_HISTORICAL),
      liveIntelligence: {
        analysis: analysis({ suggested_cta: "COMMUNITY_REPLY:\nlive" }),
        opportunity: null,
        briefing: briefing({
          recommended_response: "COMMUNITY_REPLY:\nlive briefing",
        }),
        blueprint: blueprint(BLUEPRINT_CURRENT),
      },
    });
    assert.match(before.analysis.suggested_cta ?? "", /old/);
    assert.equal(before.blueprint?.id, BLUEPRINT_HISTORICAL);
  });
});
