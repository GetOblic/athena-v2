/**
 * Production-path regressions for Prospect Executive Version UI.
 *
 * Screenshot component (proven via Prospect route import):
 *   components/discussions/ExecutiveIntelligenceWorkspace.tsx
 *
 * Chain:
 *   app/prospects/[id]/page.tsx
 *     → ExecutiveIntelligenceWorkspace (sourceKind="prospect")
 *       → buildSelectedExecutiveVersionViewModel
 *         → StrategicAssetBlueprint / DeploymentAssets / metadata
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollapsiblePromptBlock } from "../../components/assetBlueprints/CollapsiblePromptBlock";
import {
  buildDeploymentAssetCards,
  DeploymentAssets,
} from "../../components/deployment/DeploymentAssets";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";
import {
  archivedVersionExpandedCopy,
  buildSelectedExecutiveVersionViewModel,
  currentVersionExpandedCopy,
  resolveExecutiveVersionDisplayTimestamp,
  resolveExecutiveVersionGeneratedAt,
  resolvePendingCurrentAutoSelect,
} from "../../services/executiveVersions/executiveVersionSelection";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "../../services/executiveVersions/executiveVersionTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const VERSION_8_ID = "cdd9e6e4-0e09-4d70-b3cb-755c178339d6";
const VERSION_9_ID = "259983f0-bd2c-437d-ad67-425c20df31df";
const BLUEPRINT_V8_ID = "451ed9d3-ef14-4863-a293-6566fce9d923";
const BLUEPRINT_V9_ID = "263f0389-a23b-4e2e-97fa-fa6df3855c8a";
const SHARED_ANALYSIS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const HISTORICAL_BLUEPRINT_V8 = "HISTORICAL_BLUEPRINT_V8";
const CURRENT_BLUEPRINT_V9 = "CURRENT_BLUEPRINT_V9";
const HISTORICAL_EMAIL_V8 = "HISTORICAL_EMAIL_V8";
const HISTORICAL_FOLLOWUP_V8 = "HISTORICAL_FOLLOWUP_V8";
const HISTORICAL_LINKEDIN_V8 = "HISTORICAL_LINKEDIN_V8";
const HISTORICAL_CTA_V8 = "HISTORICAL_CTA_V8";
const CURRENT_EMAIL_V9 = "CURRENT_EMAIL_V9";
const CURRENT_FOLLOWUP_V9 = "CURRENT_FOLLOWUP_V9";
const CURRENT_LINKEDIN_V9 = "CURRENT_LINKEDIN_V9";
const CURRENT_CTA_V9 = "CURRENT_CTA_V9";

function sha16(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function analysis(
  overrides: Partial<DiscussionAnalysis> = {},
): DiscussionAnalysis {
  return {
    id: SHARED_ANALYSIS_ID,
    organization_id: "4ba548af-28e3-41b5-bc23-6ca33ba1d4e1",
    discussion_id: "104f935a-4edf-4d9f-98ab-d50bd09fb361",
    user_id: null,
    community_id: null,
    status: "completed",
    summary: "shared analysis summary",
    sentiment: null,
    intent: null,
    buyer_stage: null,
    pain_points: null,
    opportunity_detected: false,
    opportunity_title: null,
    opportunity_reason: null,
    recommended_action: null,
    risk_level: null,
    confidence: 0.8,
    suggested_cta: "",
    strategy_key: "default",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: "test-model",
    generation_time_ms: 1000,
    raw_json: null,
    created_at: "2026-07-17T16:13:00.000Z",
    updated_at: "2026-07-17T16:13:00.000Z",
    ...overrides,
  };
}

function blueprint(id: string, marker: string): AthenaAssetBlueprint {
  return {
    id,
    discussion_id: "104f935a-4edf-4d9f-98ab-d50bd09fb361",
    opportunity_id: null,
    briefing_id: null,
    user_id: null,
    asset_title: marker,
    asset_type: "image",
    business_goal: marker,
    target_audience: "executives",
    priority: "high",
    estimated_reuse: 4,
    image_prompt: `${marker} IMAGE`,
    pdf_prompt: `${marker} PDF`,
    social_prompt: `${marker} SOCIAL`,
    notes: marker,
    status: "ready",
    raw_json: { marker },
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
  };
}

function version(input: {
  id: string;
  version_number: number;
  is_current: boolean;
  blueprint_id: string;
  blueprintMarker: string;
  email: string;
  followUp: string;
  linkedin: string;
  cta: string;
  generated_at: string;
  created_at: string;
}): ExecutiveIntelligenceVersion {
  const suggestedCta = [
    "PERSONALIZED_OUTREACH_EMAIL:",
    input.email,
    "FOLLOW_UP_EMAIL:",
    input.followUp,
    "LINKEDIN_CONNECTION:",
    input.linkedin,
    "RECOMMENDED_CTA:",
    input.cta,
  ].join("\n");

  return {
    id: input.id,
    discussion_id: "104f935a-4edf-4d9f-98ab-d50bd09fb361",
    organization_id: "4ba548af-28e3-41b5-bc23-6ca33ba1d4e1",
    user_id: null,
    version_number: input.version_number,
    is_current: input.is_current,
    generated_at: input.generated_at,
    generation_duration_ms: 12000,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: `run-${input.version_number}`,
    analysis_id: SHARED_ANALYSIS_ID,
    opportunity_id: null,
    review_id: null,
    blueprint_id: input.blueprint_id,
    created_at: input.created_at,
    intelligence: {
      analysis: analysis({
        suggested_cta: suggestedCta,
        raw_json: {
          deployment_assets: { raw_ai_response: suggestedCta },
        },
      }),
      opportunity: null,
      briefing: null,
      blueprint: blueprint(input.blueprint_id, input.blueprintMarker),
      generationMode: "think_differently",
    },
  };
}

/** Mirrors production evidence: invalid generated_at (17 Jul), correct created_at (18 Jul). */
const version8 = version({
  id: VERSION_8_ID,
  version_number: 8,
  is_current: false,
  blueprint_id: BLUEPRINT_V8_ID,
  blueprintMarker: HISTORICAL_BLUEPRINT_V8,
  email: HISTORICAL_EMAIL_V8,
  followUp: HISTORICAL_FOLLOWUP_V8,
  linkedin: HISTORICAL_LINKEDIN_V8,
  cta: HISTORICAL_CTA_V8,
  generated_at: "2026-07-17T16:13:00.000Z",
  created_at: "2026-07-18T10:00:00.000Z",
});

const version9 = version({
  id: VERSION_9_ID,
  version_number: 9,
  is_current: true,
  blueprint_id: BLUEPRINT_V9_ID,
  blueprintMarker: CURRENT_BLUEPRINT_V9,
  email: CURRENT_EMAIL_V9,
  followUp: CURRENT_FOLLOWUP_V9,
  linkedin: CURRENT_LINKEDIN_V9,
  cta: CURRENT_CTA_V9,
  generated_at: "2026-07-17T16:13:00.000Z",
  created_at: "2026-07-18T11:00:00.000Z",
});

const liveCurrent: ExecutiveIntelligencePayload = {
  analysis: analysis({
    suggested_cta: version9.intelligence.analysis.suggested_cta,
  }),
  opportunity: null,
  briefing: null,
  blueprint: blueprint(BLUEPRINT_V9_ID, CURRENT_BLUEPRINT_V9),
};

const prospectVersions = [version9, version8];

function prospectViewModel(selectedVersionId: string | null) {
  return buildSelectedExecutiveVersionViewModel({
    versions: prospectVersions,
    selectedVersionId,
    fallbackIntelligence: liveCurrent,
    sourceKind: "prospect",
  });
}

function renderedMarkers(vm: ReturnType<typeof prospectViewModel>) {
  const assetText = vm.deploymentAssets.map((a) => a.content).join("\n");
  return {
    blueprintTitle: vm.blueprint?.asset_title ?? "",
    blueprintId: vm.blueprintId,
    executiveVersionId: vm.executiveVersionId,
    assetText,
    displayGeneratedAt: vm.displayGeneratedAt,
    generationMode: vm.generationMode,
  };
}

describe("Prospect production path — ExecutiveIntelligenceWorkspace", () => {
  it("proves Prospect route imports the screenshot workspace component", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(
      page,
      /from "@\/components\/discussions\/ExecutiveIntelligenceWorkspace"/,
    );
    assert.match(page, /<ExecutiveIntelligenceWorkspace/);
    assert.match(page, /sourceKind="prospect"/);
    assert.match(page, /versions=\{versionState\.versions\}/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /title="Executive Versions"/);
    assert.match(workspace, /Current Version/);
    assert.match(workspace, /▲ Hide|▼ View/);
    assert.match(workspace, /Viewing/);
    assert.match(workspace, /buildSelectedExecutiveVersionViewModel/);
    assert.match(workspace, /currentVersionExpandedCopy\(sourceKind\)/);
    assert.match(workspace, /resolveExecutiveVersionDisplayTimestamp/);
  });

  it("1. Prospect workspace receives both versions in the view model", () => {
    const vm = prospectViewModel(VERSION_9_ID);
    assert.equal(prospectVersions.length, 2);
    assert.equal(vm.executiveVersionId, VERSION_9_ID);
    assert.equal(vm.usedFallback, false);
  });

  it("2–5. Selecting Version 8 renders HISTORICAL markers only", () => {
    const vm = prospectViewModel(VERSION_8_ID);
    const rendered = renderedMarkers(vm);

    assert.equal(rendered.executiveVersionId, VERSION_8_ID);
    assert.equal(rendered.blueprintId, BLUEPRINT_V8_ID);
    assert.match(rendered.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.doesNotMatch(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.match(rendered.assetText, /HISTORICAL_EMAIL_V8/);
    assert.doesNotMatch(rendered.assetText, /CURRENT_EMAIL_V9/);
    assert.equal(vm.usedFallback, false);
    assert.equal(vm.isHistorical, true);
  });

  it("6. Selecting Version 9 renders Current markers", () => {
    const vm = prospectViewModel(VERSION_9_ID);
    const rendered = renderedMarkers(vm);

    assert.equal(rendered.executiveVersionId, VERSION_9_ID);
    assert.match(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.match(rendered.assetText, /CURRENT_EMAIL_V9/);
    assert.doesNotMatch(rendered.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.doesNotMatch(rendered.assetText, /HISTORICAL_EMAIL_V8/);
    assert.equal(vm.isCurrent, true);
  });

  it("7. Metadata changes with the selected Executive Version", () => {
    const v8 = prospectViewModel(VERSION_8_ID);
    const v9 = prospectViewModel(VERSION_9_ID);

    assert.notEqual(v8.executiveVersionId, v9.executiveVersionId);
    assert.notEqual(v8.blueprintId, v9.blueprintId);
    assert.notEqual(v8.displayGeneratedAt, v9.displayGeneratedAt);
    assert.equal(v8.generationMode, "think_differently");
    assert.equal(v9.generationMode, "think_differently");
  });

  it("8–9. Historical card uses created_at when generated_at is legacy-invalid", () => {
    assert.equal(
      resolveExecutiveVersionDisplayTimestamp(version8),
      "2026-07-18T10:00:00.000Z",
    );
    assert.equal(
      resolveExecutiveVersionDisplayTimestamp(version9),
      "2026-07-18T11:00:00.000Z",
    );

    const vm = prospectViewModel(VERSION_8_ID);
    assert.equal(vm.displayGeneratedAt, "2026-07-18T10:00:00.000Z");
    assert.notEqual(vm.displayGeneratedAt, "2026-07-17T16:13:00.000Z");
  });

  it("10. Valid generated_at remains preferred over created_at", () => {
    const valid = resolveExecutiveVersionDisplayTimestamp({
      generated_at: "2026-07-18T12:30:00.000Z",
      created_at: "2026-07-18T12:29:00.000Z",
    });
    assert.equal(valid, "2026-07-18T12:30:00.000Z");
  });

  it("11. Prospect copy says prospect, not discussion", () => {
    assert.equal(
      currentVersionExpandedCopy("prospect"),
      "This is Athena's current executive intelligence for this prospect.",
    );
    assert.match(
      currentVersionExpandedCopy("prospect"),
      /prospect/i,
    );
    assert.doesNotMatch(
      currentVersionExpandedCopy("prospect"),
      /discussion/i,
    );
    assert.match(archivedVersionExpandedCopy(), /Previous intelligence/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    // Hardcoded Discussion string must not appear outside the discussion copy helper path.
    assert.doesNotMatch(
      workspace,
      /This is Athena's current executive intelligence for this discussion\./,
    );
    assert.match(workspace, /currentVersionExpandedCopy\(sourceKind\)/);
  });

  it("12. Unknown selected ID shows unavailable, not Current", () => {
    const vm = prospectViewModel("00000000-0000-4000-8000-000000000099");
    assert.equal(vm.selectionMissing, true);
    assert.equal(vm.intelligence, null);
    assert.equal(vm.blueprint, null);
    assert.equal(vm.deploymentAssets.length, 0);
    assert.equal(vm.usedFallback, false);
    assert.notEqual(vm.executiveVersionId, VERSION_9_ID);
  });

  it("13. Rerender / polling preserve historical selection", () => {
    const first = prospectViewModel(VERSION_8_ID);
    const second = prospectViewModel(VERSION_8_ID);
    assert.equal(first.executiveVersionId, VERSION_8_ID);
    assert.equal(second.executiveVersionId, VERSION_8_ID);
    assert.equal(
      first.blueprint?.asset_title,
      second.blueprint?.asset_title,
    );

    // Polling completion without a new Current must not force a jump.
    assert.equal(
      resolvePendingCurrentAutoSelect({
        isGenerating: false,
        pending: null,
        currentVersionId: VERSION_9_ID,
      }),
      null,
    );
  });

  it("14. Manual selection defeats stale regeneration auto-selection", () => {
    // Stale completed pending with already-advanced Current.
    const forced = resolvePendingCurrentAutoSelect({
      isGenerating: false,
      pending: {
        baselineCurrentVersionId: VERSION_8_ID,
        completed: true,
      },
      currentVersionId: VERSION_9_ID,
    });
    assert.equal(forced, VERSION_9_ID);

    // After pending is cleared (manual selectVersion clears session storage),
    // subsequent polls cannot re-force Current.
    assert.equal(
      resolvePendingCurrentAutoSelect({
        isGenerating: false,
        pending: null,
        currentVersionId: VERSION_9_ID,
      }),
      null,
    );

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(
      workspace,
      /function selectVersion\(versionId: string\) \{\s*[\s\S]*clearPendingAutoSelect/,
    );
    assert.match(workspace, /resolvePendingCurrentAutoSelect/);
  });

  it("15. Discussion routes retain Discussion-specific copy and behavior", () => {
    assert.equal(
      currentVersionExpandedCopy("discussion"),
      "This is Athena's current executive intelligence for this discussion.",
    );

    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /ExecutiveIntelligenceWorkspace/);
    assert.doesNotMatch(discussionPage, /sourceKind="prospect"/);

    const helper = read(
      "services/executiveVersions/executiveVersionSelection.ts",
    );
    assert.match(
      helper,
      /This is Athena's current executive intelligence for this discussion\./,
    );
  });

  it("live Current fallback never overwrites a selected historical version", () => {
    const vm = prospectViewModel(VERSION_8_ID);
    assert.notEqual(
      vm.blueprint?.asset_title,
      liveCurrent.blueprint?.asset_title,
    );
    assert.doesNotMatch(
      vm.analysis?.suggested_cta ?? "",
      /CURRENT_EMAIL_V9/,
    );
  });
});

describe("Prospect Deployment Assets version switching (production path)", () => {
  function cardMarkupForVersion(selectedVersionId: string) {
    const vm = prospectViewModel(selectedVersionId);
    const cards = buildDeploymentAssetCards(
      vm.deploymentAssets,
      vm.executiveVersionId,
    );
    const propsMarkup = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: vm.deploymentAssets,
        executiveVersionId: vm.executiveVersionId,
      }),
    );
    const openCardsMarkup = cards
      .map((card) =>
        renderToStaticMarkup(
          createElement(CollapsiblePromptBlock, {
            key: card.key,
            label: card.label,
            description: card.description,
            text: card.text,
            defaultOpen: true,
            assetType: card.assetType,
          }),
        ),
      )
      .join("\n");

    return {
      vm,
      cards,
      normalizedHash: sha16(JSON.stringify(vm.deploymentAssets)),
      propsHash: sha16(JSON.stringify(vm.deploymentAssets)),
      propsMarkup,
      openCardsMarkup,
    };
  }

  it("1–4. Version 8 normalized assets, props, and open cards use V8 sentinels only", () => {
    const result = cardMarkupForVersion(VERSION_8_ID);
    assert.equal(result.vm.executiveVersionId, VERSION_8_ID);
    assert.match(result.openCardsMarkup, /HISTORICAL_EMAIL_V8/);
    assert.match(result.openCardsMarkup, /HISTORICAL_FOLLOWUP_V8/);
    assert.match(result.openCardsMarkup, /HISTORICAL_LINKEDIN_V8/);
    assert.match(result.openCardsMarkup, /HISTORICAL_CTA_V8/);
    assert.doesNotMatch(result.openCardsMarkup, /CURRENT_EMAIL_V9/);
    assert.doesNotMatch(result.openCardsMarkup, /CURRENT_FOLLOWUP_V9/);
    assert.doesNotMatch(result.openCardsMarkup, /CURRENT_LINKEDIN_V9/);
    assert.doesNotMatch(result.openCardsMarkup, /CURRENT_CTA_V9/);
    assert.match(result.propsMarkup, new RegExp(VERSION_8_ID));
    for (const card of result.cards) {
      assert.match(card.key, new RegExp(`^${VERSION_8_ID}:`));
    }
  });

  it("5–6. Version 9 normalized assets and open cards use V9 sentinels only", () => {
    const result = cardMarkupForVersion(VERSION_9_ID);
    assert.equal(result.vm.executiveVersionId, VERSION_9_ID);
    assert.match(result.openCardsMarkup, /CURRENT_EMAIL_V9/);
    assert.match(result.openCardsMarkup, /CURRENT_FOLLOWUP_V9/);
    assert.match(result.openCardsMarkup, /CURRENT_LINKEDIN_V9/);
    assert.match(result.openCardsMarkup, /CURRENT_CTA_V9/);
    assert.doesNotMatch(result.openCardsMarkup, /HISTORICAL_EMAIL_V8/);
    assert.doesNotMatch(result.openCardsMarkup, /HISTORICAL_CTA_V8/);
    assert.notEqual(
      result.normalizedHash,
      cardMarkupForVersion(VERSION_8_ID).normalizedHash,
    );
  });

  it("7–8. Switching V8 → V9 → V8 restores correct card content; keys differ by version", () => {
    const first = cardMarkupForVersion(VERSION_8_ID);
    const second = cardMarkupForVersion(VERSION_9_ID);
    const third = cardMarkupForVersion(VERSION_8_ID);

    assert.equal(first.normalizedHash, third.normalizedHash);
    assert.notEqual(first.normalizedHash, second.normalizedHash);
    assert.match(first.openCardsMarkup, /HISTORICAL_EMAIL_V8/);
    assert.match(second.openCardsMarkup, /CURRENT_EMAIL_V9/);
    assert.match(third.openCardsMarkup, /HISTORICAL_EMAIL_V8/);
    assert.notEqual(first.cards[0]?.key, second.cards[0]?.key);

    // Rerender with same selection preserves V8 (no stale V9 content).
    const rerender = cardMarkupForVersion(VERSION_8_ID);
    assert.equal(rerender.normalizedHash, first.normalizedHash);
    assert.doesNotMatch(rerender.openCardsMarkup, /CURRENT_EMAIL_V9/);
  });

  it("9. Historical missing payload shows unavailable, never Current assets", () => {
    const emptyHistorical: ExecutiveIntelligenceVersion = {
      ...version8,
      intelligence: {
        ...version8.intelligence,
        analysis: analysis({ suggested_cta: "" }),
      },
    };
    const vm = buildSelectedExecutiveVersionViewModel({
      versions: [version9, emptyHistorical],
      selectedVersionId: VERSION_8_ID,
      fallbackIntelligence: liveCurrent,
      sourceKind: "prospect",
    });
    assert.equal(vm.deploymentAssets.length, 0);
    assert.doesNotMatch(
      JSON.stringify(vm.deploymentAssets),
      /CURRENT_EMAIL_V9/,
    );
    assert.equal(vm.isHistorical, true);
  });

  it("10–11. Current rendering unchanged; Discussion copy path unaffected", () => {
    const current = cardMarkupForVersion(VERSION_9_ID);
    assert.equal(current.vm.isCurrent, true);
    assert.match(current.openCardsMarkup, /CURRENT_EMAIL_V9/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /executiveVersionId=\{viewModel\.executiveVersionId\}/);
    assert.match(
      workspace,
      /key=\{`deployment-assets-\$\{viewModel\.executiveVersionId/,
    );

    assert.equal(
      currentVersionExpandedCopy("discussion"),
      "This is Athena's current executive intelligence for this discussion.",
    );
  });
});

describe("Think Differently generated_at publication (retained from 37104da)", () => {
  it("two TD publications with shared analysis_id get distinct generated_at", () => {
    const shared = "2026-07-17T16:13:00.000Z";
    const a = resolveExecutiveVersionGeneratedAt({
      generationMode: "think_differently",
      analysisCreatedAt: shared,
      nowIso: "2026-07-18T10:00:00.000Z",
    });
    const b = resolveExecutiveVersionGeneratedAt({
      generationMode: "think_differently",
      analysisCreatedAt: shared,
      nowIso: "2026-07-18T11:00:00.000Z",
    });
    assert.notEqual(a, b);
    assert.notEqual(a, shared);
  });

  it("Standard retains analysis.created_at when generatedAt omitted", () => {
    const analysisCreatedAt = "2026-07-17T16:13:00.000Z";
    assert.equal(
      resolveExecutiveVersionGeneratedAt({
        analysisCreatedAt,
        nowIso: "2026-07-18T13:00:00.000Z",
      }),
      analysisCreatedAt,
    );
  });

  it("workflow passes one publication timestamp; publish does not mint a second default", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const publisher = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.match(workflow, /generatedAt:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(publisher, /generatedAt:\s*input\.generatedAt/);
    assert.doesNotMatch(
      publisher,
      /const publishedAt = input\.generatedAt \?\? new Date\(\)\.toISOString\(\)/,
    );
  });
});
