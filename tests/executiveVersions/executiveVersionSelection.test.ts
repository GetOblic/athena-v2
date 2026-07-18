import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import {
  resolveVersionIntelligenceForDisplay,
  withResolvedVersionIntelligence,
} from "../../services/executiveVersions/executiveVersionDisplay";
import {
  buildExecutiveVersionCacheKey,
  resolveExecutiveVersionGeneratedAt,
  resolveWorkspaceVersionSelection,
} from "../../services/executiveVersions/executiveVersionSelection";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "../../services/executiveVersions/executiveVersionTypes";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";

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
const HISTORICAL_ASSET_V8 = "HISTORICAL_ASSET_V8";
const CURRENT_ASSET_V9 = "CURRENT_ASSET_V9";

function analysis(
  overrides: Partial<DiscussionAnalysis> = {},
): DiscussionAnalysis {
  return {
    id: SHARED_ANALYSIS_ID,
    organization_id: "org-1",
    discussion_id: "discussion-1",
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
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function blueprint(
  id: string,
  marker: string,
): AthenaAssetBlueprint {
  return {
    id,
    discussion_id: "discussion-1",
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
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  };
}

function version(input: {
  id: string;
  version_number: number;
  is_current: boolean;
  blueprint_id: string;
  blueprintMarker: string;
  assetMarker: string;
  generated_at: string;
}): ExecutiveIntelligenceVersion {
  const suggestedCta = [
    "PERSONALIZED_OUTREACH_EMAIL:",
    input.assetMarker,
    "FOLLOW_UP_EMAIL:",
    `${input.assetMarker}_FOLLOW_UP`,
    "LINKEDIN_CONNECTION:",
    `${input.assetMarker}_LI`,
    "COLD_CALL_OPENING:",
    `${input.assetMarker}_CALL`,
    "DISCOVERY_QUESTIONS:",
    `${input.assetMarker}_DISCOVERY`,
    "PERSONALIZED_VALUE_PROPOSITION:",
    `${input.assetMarker}_VP`,
    "OBJECTION_ANTICIPATION:",
    `${input.assetMarker}_OBJECTION`,
    "MEETING_PREPARATION:",
    `${input.assetMarker}_MEETING`,
    "RECOMMENDED_CTA:",
    `${input.assetMarker}_CTA`,
  ].join("\n");

  return {
    id: input.id,
    discussion_id: "discussion-1",
    organization_id: "org-1",
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
    created_at: input.generated_at,
    intelligence: {
      analysis: analysis({
        suggested_cta: suggestedCta,
        raw_json: {
          deployment_assets: {
            raw_ai_response: input.assetMarker,
          },
        },
      }),
      opportunity: null,
      briefing: null,
      blueprint: blueprint(input.blueprint_id, input.blueprintMarker),
      generationMode: "think_differently",
    },
  };
}

const version8 = version({
  id: VERSION_8_ID,
  version_number: 8,
  is_current: false,
  blueprint_id: BLUEPRINT_V8_ID,
  blueprintMarker: HISTORICAL_BLUEPRINT_V8,
  assetMarker: HISTORICAL_ASSET_V8,
  generated_at: "2026-07-18T10:00:00.000Z",
});

const version9 = version({
  id: VERSION_9_ID,
  version_number: 9,
  is_current: true,
  blueprint_id: BLUEPRINT_V9_ID,
  blueprintMarker: CURRENT_BLUEPRINT_V9,
  assetMarker: CURRENT_ASSET_V9,
  generated_at: "2026-07-18T11:00:00.000Z",
});

const liveCurrent: ExecutiveIntelligencePayload = {
  analysis: analysis({
    suggested_cta: version9.intelligence.analysis.suggested_cta,
  }),
  opportunity: null,
  briefing: null,
  blueprint: blueprint(BLUEPRINT_V9_ID, CURRENT_BLUEPRINT_V9),
};

function renderMarkers(intelligence: ExecutiveIntelligencePayload | null) {
  assert.ok(intelligence, "expected intelligence payload");
  const assets = buildDiscussionDeploymentAssets(intelligence.analysis, {
    prospectMode: true,
  });
  const assetText = assets.map((asset) => asset.content).join("\n");
  return {
    blueprintTitle: intelligence.blueprint?.asset_title ?? "",
    assetText,
  };
}

describe("Prospect Executive Version historical selection (CASE 1)", () => {
  it("1. Version A and Version B contain different blueprint and Deployment Asset payloads", () => {
    const a = renderMarkers(version8.intelligence);
    const b = renderMarkers(version9.intelligence);

    assert.match(a.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.match(b.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.match(a.assetText, /HISTORICAL_ASSET_V8/);
    assert.match(b.assetText, /CURRENT_ASSET_V9/);
    assert.notEqual(a.blueprintTitle, b.blueprintTitle);
    assert.notEqual(a.assetText, b.assetText);
  });

  it("2. Selecting Version A displays Version A content", () => {
    const selection = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: VERSION_8_ID,
      fallbackIntelligence: liveCurrent,
    });
    const rendered = renderMarkers(selection.intelligence);

    assert.equal(selection.selectedVersion?.id, VERSION_8_ID);
    assert.equal(selection.usedFallback, false);
    assert.match(rendered.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.match(rendered.assetText, /HISTORICAL_ASSET_V8/);
    assert.doesNotMatch(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.doesNotMatch(rendered.assetText, /CURRENT_ASSET_V9/);
  });

  it("3. Selecting Version B displays Version B content", () => {
    const selection = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: VERSION_9_ID,
      fallbackIntelligence: liveCurrent,
    });
    const rendered = renderMarkers(selection.intelligence);

    assert.equal(selection.selectedVersion?.id, VERSION_9_ID);
    assert.match(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.match(rendered.assetText, /CURRENT_ASSET_V9/);
    assert.doesNotMatch(rendered.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.doesNotMatch(rendered.assetText, /HISTORICAL_ASSET_V8/);
  });

  it("4. Selecting Current displays Current content", () => {
    const selection = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: version9.id,
      fallbackIntelligence: liveCurrent,
    });
    const rendered = renderMarkers(selection.intelligence);

    assert.equal(selection.selectedVersion?.is_current, true);
    assert.match(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.match(rendered.assetText, /CURRENT_ASSET_V9/);
  });

  it("5. Historical versions are not overwritten by current analysis or blueprint values", () => {
    const resolved = resolveVersionIntelligenceForDisplay({
      version: version8,
      blueprintById: blueprint(BLUEPRINT_V8_ID, HISTORICAL_BLUEPRINT_V8),
      liveIntelligence: liveCurrent,
    });
    const rendered = renderMarkers(resolved);

    assert.match(rendered.blueprintTitle, /HISTORICAL_BLUEPRINT_V8/);
    assert.match(rendered.assetText, /HISTORICAL_ASSET_V8/);
    assert.doesNotMatch(rendered.blueprintTitle, /CURRENT_BLUEPRINT_V9/);
    assert.doesNotMatch(rendered.assetText, /CURRENT_ASSET_V9/);
    assert.doesNotMatch(
      resolved.analysis.suggested_cta ?? "",
      /CURRENT_ASSET_V9/,
    );
  });

  it("5b. Historical selection never uses fallbackIntelligence (live Current)", () => {
    const selection = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: VERSION_8_ID,
      fallbackIntelligence: liveCurrent,
    });

    assert.equal(selection.usedFallback, false);
    assert.equal(selection.intelligence?.blueprint?.asset_title, HISTORICAL_BLUEPRINT_V8);
    assert.notEqual(
      selection.intelligence?.blueprint?.asset_title,
      liveCurrent.blueprint?.asset_title,
    );
  });

  it("6. Cache keys include Executive Version ID", () => {
    const key8 = buildExecutiveVersionCacheKey({
      sourceType: "prospect",
      sourceId: "prospect-1",
      executiveVersionId: VERSION_8_ID,
    });
    const key9 = buildExecutiveVersionCacheKey({
      sourceType: "prospect",
      sourceId: "prospect-1",
      executiveVersionId: VERSION_9_ID,
    });

    assert.match(key8, new RegExp(VERSION_8_ID));
    assert.match(key9, new RegExp(VERSION_9_ID));
    assert.notEqual(key8, key9);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /buildExecutiveVersionCacheKey/);
    assert.match(workspace, /executiveVersionId/);
    assert.match(workspace, /key=\{`deployment-assets-\$\{selectedVersion\?\.id/);
    assert.match(workspace, /key=\{`strategic-blueprint-\$\{selectedVersion\?\.id/);
  });

  it("7. Prospect bridge resolution preserves the requested Executive Version", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /getExecutiveVersionsForDiscussionPage/);
    assert.match(page, /sourceKind="prospect"/);
    assert.match(page, /prospectId=\{prospect\.id\}/);

    // Server loader passes the full version list; selection is client-side by id.
    const withResolved = withResolvedVersionIntelligence({
      version: version8,
      blueprintById: blueprint(BLUEPRINT_V8_ID, HISTORICAL_BLUEPRINT_V8),
      liveIntelligence: liveCurrent,
    });
    assert.equal(withResolved.id, VERSION_8_ID);
    assert.equal(withResolved.intelligence.blueprint?.id, BLUEPRINT_V8_ID);
    assert.match(
      withResolved.intelligence.blueprint?.asset_title ?? "",
      /HISTORICAL_BLUEPRINT_V8/,
    );
  });

  it("8. A rerender does not reset the selected historical version", () => {
    const first = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: VERSION_8_ID,
      fallbackIntelligence: liveCurrent,
    });
    const second = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: VERSION_8_ID,
      fallbackIntelligence: liveCurrent,
    });

    assert.equal(first.selectedVersion?.id, VERSION_8_ID);
    assert.equal(second.selectedVersion?.id, VERSION_8_ID);
    assert.equal(
      first.intelligence?.blueprint?.asset_title,
      second.intelligence?.blueprint?.asset_title,
    );

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    // Explicit user selection clears pending auto-select so refresh cannot steal it.
    assert.match(workspace, /clearPendingAutoSelect\(discussionId\)/);
    assert.match(
      workspace,
      /function selectVersion\(versionId: string\) \{\s*[\s\S]*clearPendingAutoSelect/,
    );
  });

  it("9. Discussion workflows remain unaffected (shared selection helper, no prompt/routing changes)", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /ExecutiveIntelligenceWorkspace/);
    assert.match(discussionPage, /getExecutiveVersionsForDiscussionPage/);

    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.doesNotMatch(workflow, /temperature\s*:/);
    assert.doesNotMatch(workflow, /THINK_DIFFERENTLY_INSTRUCTION\s*=/);

    const publisher = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.doesNotMatch(publisher, /CREATE TABLE|alter table/i);
  });

  it("missing selected version id does not silently fall back to Current content", () => {
    const selection = resolveWorkspaceVersionSelection({
      versions: [version9, version8],
      selectedVersionId: "00000000-0000-4000-8000-000000000099",
      fallbackIntelligence: liveCurrent,
    });

    assert.equal(selection.selectionMissing, true);
    assert.equal(selection.intelligence, null);
    assert.equal(selection.usedFallback, false);
  });
});

describe("Executive Version generated_at publication time", () => {
  it("two Think Differently runs with the same analysis_id get distinct generated_at", () => {
    const sharedAnalysisCreatedAt = "2026-07-01T00:00:00.000Z";
    const run1 = resolveExecutiveVersionGeneratedAt({
      generationMode: "think_differently",
      analysisCreatedAt: sharedAnalysisCreatedAt,
      nowIso: "2026-07-18T10:00:00.000Z",
    });
    const run2 = resolveExecutiveVersionGeneratedAt({
      generationMode: "think_differently",
      analysisCreatedAt: sharedAnalysisCreatedAt,
      nowIso: "2026-07-18T11:00:00.000Z",
    });

    assert.notEqual(run1, run2);
    assert.notEqual(run1, sharedAnalysisCreatedAt);
    assert.notEqual(run2, sharedAnalysisCreatedAt);
    assert.equal(run1, "2026-07-18T10:00:00.000Z");
    assert.equal(run2, "2026-07-18T11:00:00.000Z");
  });

  it("explicit generatedAt wins; Think Differently never falls back to analysis.created_at", () => {
    const explicit = resolveExecutiveVersionGeneratedAt({
      generatedAt: "2026-07-18T12:00:00.000Z",
      generationMode: "think_differently",
      analysisCreatedAt: "2026-07-01T00:00:00.000Z",
      nowIso: "2026-07-18T13:00:00.000Z",
    });
    assert.equal(explicit, "2026-07-18T12:00:00.000Z");

    const omitted = resolveExecutiveVersionGeneratedAt({
      generationMode: "think_differently",
      analysisCreatedAt: "2026-07-01T00:00:00.000Z",
      nowIso: "2026-07-18T13:00:00.000Z",
    });
    assert.equal(omitted, "2026-07-18T13:00:00.000Z");
  });

  it("publisher and Think Differently workflow pass publication-time generatedAt", () => {
    const publisher = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");

    assert.match(publisher, /resolveExecutiveVersionGeneratedAt/);
    // Authoritative TD timestamp comes from the workflow; publish must not mint a
    // second default that would override Standard analysis.created_at semantics.
    assert.match(publisher, /generatedAt:\s*input\.generatedAt/);
    assert.doesNotMatch(
      publisher,
      /const publishedAt = input\.generatedAt \?\? new Date\(\)\.toISOString\(\)/,
    );
    assert.match(workflow, /generatedAt:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(workflow, /generationMode:\s*"think_differently"/);
  });

  it("non-Think-Differently retains analysis.created_at when generatedAt omitted", () => {
    const analysisCreatedAt = "2026-07-01T00:00:00.000Z";
    const standard = resolveExecutiveVersionGeneratedAt({
      analysisCreatedAt,
      nowIso: "2026-07-18T13:00:00.000Z",
    });
    assert.equal(standard, analysisCreatedAt);

    const endToEnd = read("services/workflows/discussionWorkflow.ts");
    assert.match(endToEnd, /publishExecutiveIntelligenceVersion\(/);
    assert.doesNotMatch(endToEnd, /generatedAt:\s*new Date\(\)\.toISOString\(\)/);
  });
});

