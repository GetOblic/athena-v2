import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  appendThinkDifferentlyInstruction,
  THINK_DIFFERENTLY_INSTRUCTION,
  THINK_DIFFERENTLY_INSTRUCTION_MARKER,
} from "../../services/brain/generationContracts/thinkDifferentlyInstruction";
import {
  isThinkDifferentlyExecutiveVersion,
  type ExecutiveIntelligencePayload,
  type ExecutiveIntelligenceVersion,
} from "../../services/executiveVersions/executiveVersionTypes";
import { resolveVersionIntelligenceForDisplay } from "../../services/executiveVersions/executiveVersionDisplay";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Think Differently Phase 2B — prompt strength", () => {
  it("A. strengthened instruction requires a material strategic alternative", () => {
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /deliberately question the assumptions that naturally lead to the most obvious recommendation/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /Do not select the second-most-obvious variation of the original direction/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /materially different strategic thesis/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /Do not treat a change in wording, channel, content format, tactic, example, tone, metaphor, emphasis, or ordering as a different strategy/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /Deployment Assets must operationalize the new strategic thesis/,
    );
    assert.doesNotMatch(THINK_DIFFERENTLY_INSTRUCTION, /GetOblic|clinic|receptionist/i);
    assert.doesNotMatch(THINK_DIFFERENTLY_INSTRUCTION, /doctrine/i);

    const once = appendThinkDifferentlyInstruction("STANDARD PROMPT");
    assert.equal(
      once.split(THINK_DIFFERENTLY_INSTRUCTION_MARKER).length - 1,
      1,
    );
    assert.throws(() => appendThinkDifferentlyInstruction(once));
  });

  it("A. Standard assemblers remain free of Think Differently instruction", () => {
    const blueprintAssembly = read(
      "services/brain/generationContracts/generationPromptAssembly.ts",
    );
    const daAssembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.doesNotMatch(
      blueprintAssembly,
      /THINK_DIFFERENTLY|ATHENA THINK DIFFERENTLY/,
    );
    assert.doesNotMatch(daAssembly, /ATHENA THINK DIFFERENTLY/);
  });
});

describe("Think Differently Phase 2B — button styling", () => {
  it("B. Think Differently uses Athena success green; Generate Intelligence stays orange", () => {
    const thinkButton = read(
      "components/discussions/ThinkDifferentlyButton.tsx",
    );
    assert.match(thinkButton, /var\(--athena-success\)/);
    assert.match(thinkButton, /border-\[var\(--athena-success\)\]\/30/);
    assert.match(thinkButton, /bg-\[var\(--athena-success\)\]\/15/);
    assert.match(thinkButton, /text-\[var\(--athena-success\)\]/);
    assert.match(thinkButton, /hover:bg-\[var\(--athena-success\)\]\/25/);
    assert.match(thinkButton, /focus-visible:ring-\[var\(--athena-success\)\]\/50/);
    assert.match(thinkButton, /disabled:opacity-50/);
    assert.match(thinkButton, /Thinking Differently/);
    assert.doesNotMatch(thinkButton, /--athena-orange/);

    const continueBtn = read("components/deployment/ContinueButton.tsx");
    assert.match(continueBtn, /var\(--athena-success\)/);

    const analyzeButton = read(
      "components/discussions/AnalyzeDiscussionButton.tsx",
    );
    assert.match(analyzeButton, /var\(--athena-orange\)/);

    const prospectButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(
      prospectButton,
      /bg-\[var\(--athena-orange\)\][\s\S]*Generate Intelligence/,
    );
    assert.match(
      prospectButton,
      /border-\[var\(--athena-success\)\]\/30[\s\S]*Think Differently/,
    );
    assert.match(prospectButton, /disabled=\{busy\}/);
    assert.match(prospectButton, /Thinking Differently/);
  });
});

describe("Think Differently Phase 2B — version metadata + badge", () => {
  it("C. publication persists explicit generationMode marker; Standard does not", () => {
    const publisher = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.match(publisher, /generationMode\?: ExecutiveIntelligencePayload\["generationMode"\]/);
    assert.match(
      publisher,
      /generationMode === "think_differently"[\s\S]*generationMode: "think_differently"/,
    );
    assert.match(
      publisher,
      /delete intelligenceSnapshot\.generationMode/,
    );

    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.match(workflow, /generationMode:\s*"think_differently"/);
    assert.match(workflow, /forceNewVersion:\s*true/);

    const endToEnd = read("services/workflows/discussionWorkflow.ts");
    assert.doesNotMatch(endToEnd, /generationMode:\s*"think_differently"/);

    assert.doesNotMatch(publisher, /CREATE TABLE|alter table/i);
  });

  it("C/D. marker survives serialization and drives badge helper", () => {
    const tdVersion = {
      intelligence: { generationMode: "think_differently" },
    } as Pick<ExecutiveIntelligenceVersion, "intelligence">;
    const standardVersion = {
      intelligence: {} as ExecutiveIntelligencePayload,
    } as Pick<ExecutiveIntelligenceVersion, "intelligence">;

    assert.equal(isThinkDifferentlyExecutiveVersion(tdVersion), true);
    assert.equal(isThinkDifferentlyExecutiveVersion(standardVersion), false);

    const serialized = JSON.parse(
      JSON.stringify({
        analysis: { id: "a" },
        opportunity: null,
        briefing: null,
        blueprint: null,
        generationMode: "think_differently",
      }),
    ) as ExecutiveIntelligencePayload;
    assert.equal(serialized.generationMode, "think_differently");
    assert.equal(
      isThinkDifferentlyExecutiveVersion({ intelligence: serialized }),
      true,
    );
  });

  it("D. display resolution preserves generationMode marker", () => {
    const version = {
      id: "v1",
      discussion_id: "d1",
      organization_id: "o1",
      user_id: null,
      version_number: 2,
      is_current: false,
      generated_at: "2026-07-18T00:00:00.000Z",
      generation_duration_ms: null,
      models_used: null,
      routing_profile: null,
      reasoning_profile: null,
      reasoning_effort: null,
      pipeline_version: "executive_intelligence_v1",
      regeneration_run_id: null,
      analysis_id: "a1",
      opportunity_id: null,
      review_id: null,
      blueprint_id: null,
      created_at: "2026-07-18T00:00:00.000Z",
      intelligence: {
        analysis: {
          id: "a1",
          organization_id: "o1",
          discussion_id: "d1",
          user_id: null,
          community_id: null,
          status: "completed",
          summary: "s",
          sentiment: null,
          intent: null,
          buyer_stage: null,
          pain_points: null,
          opportunity_detected: false,
          opportunity_title: null,
          opportunity_reason: null,
          recommended_action: null,
          suggested_cta: "CTA",
          risk_level: null,
          confidence: null,
          strategy_key: null,
          strategy_prompt_version: null,
          analysis_prompt_version: null,
          model: null,
          generation_time_ms: null,
          raw_json: null,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        },
        opportunity: null,
        briefing: null,
        blueprint: null,
        generationMode: "think_differently" as const,
      },
    } satisfies ExecutiveIntelligenceVersion;

    const resolved = resolveVersionIntelligenceForDisplay({
      version,
      blueprintById: null,
      liveIntelligence: null,
    });
    assert.equal(resolved.generationMode, "think_differently");
    assert.equal(
      isThinkDifferentlyExecutiveVersion({ intelligence: resolved }),
      true,
    );
  });

  it("D. workspace renders Think Differently badge from persisted metadata only", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /isThinkDifferentlyExecutiveVersion\(version\)/);
    assert.match(workspace, /Think Differently/);
    assert.match(workspace, /var\(--athena-success\)/);
    assert.match(workspace, /Current ✓/);
    assert.match(workspace, /Archived/);
    assert.doesNotMatch(workspace, /newest blueprint|title\.includes|Date\.parse/);
    // Status badges unchanged.
    assert.match(
      workspace,
      /border-\[var\(--athena-orange\)\]\/30[\s\S]*Current ✓/,
    );
  });
});

describe("Think Differently Phase 2B — regression scope", () => {
  it("E. no full-pipeline redesign; TD DA premium stage is explicit and isolated", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /deployment_assets: roles\.analysis/);
    assert.match(routing, /deployment_assets_think_differently/);

    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.doesNotMatch(workflow, /await\s+processDiscussionEndToEnd\s*\(/);
    assert.match(workflow, /getLatestDiscussionAnalysis/);
    assert.match(workflow, /generateDeploymentAssets/);
    assert.match(workflow, /createAssetBlueprintForBriefing/);
  });
});
