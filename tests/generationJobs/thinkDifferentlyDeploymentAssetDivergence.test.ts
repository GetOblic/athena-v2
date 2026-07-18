import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  appendThinkDifferentlyDeploymentAssetRepairInstruction,
  appendThinkDifferentlyDeploymentAssetsAddendum,
  evaluateThinkDifferentlyDeploymentAssetDivergence,
  parseCanonicalDeploymentAssetMap,
  stripPriorDeploymentAssetsFromPromptContext,
  THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER,
  THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO,
} from "../../services/brain/generationContracts/thinkDifferentlyDeploymentAssetDivergence";
import { appendThinkDifferentlyInstruction } from "../../services/brain/generationContracts/thinkDifferentlyInstruction";
import { parseLabeledDeploymentAssets } from "../../lib/deploymentAssets";
import {
  resolveModelForStage,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE,
} from "../../lib/llm/modelRouting";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";
import { canonicalDeploymentAssetType } from "../../services/assetInteractions/assetInteractionKeys";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function labeledPackage(
  sentinel: string,
  overrides: Partial<Record<string, string>> = {},
): string {
  const sections: Record<string, string> = {
    PERSONALIZED_OUTREACH_EMAIL: `${sentinel}_EMAIL`,
    FOLLOW_UP_EMAIL: `${sentinel}_FOLLOWUP`,
    LINKEDIN_CONNECTION: `${sentinel}_LINKEDIN`,
    LINKEDIN_FOLLOW_UP: `${sentinel}_LINKEDIN_FU`,
    COLD_CALL_OPENING: `${sentinel}_COLD_CALL`,
    DISCOVERY_QUESTIONS: `${sentinel}_DISCOVERY`,
    PERSONALIZED_VALUE_PROPOSITION: `${sentinel}_VP`,
    OBJECTION_ANTICIPATION: `${sentinel}_OBJECTION`,
    MEETING_PREPARATION: `${sentinel}_MEETING`,
    RECOMMENDED_CTA: `${sentinel}_CTA`,
    FOLLOW_UP_SEQUENCE: `${sentinel}_SEQUENCE`,
    PERSONALIZED_VIDEO_SCRIPT: `${sentinel}_VIDEO`,
    NEWSLETTER_IDEA: `${sentinel}_NEWSLETTER`,
    BLOG_POST_IDEA: `${sentinel}_BLOG`,
    WHATSAPP_OUTREACH: `${sentinel}_WHATSAPP`,
    KNOWLEDGE_BASE_ENHANCEMENT: `${sentinel}_KB`,
    HIDDEN_GEMS: `${sentinel}_GEMS`,
    SUBSTACK_POST: `${sentinel}_SUBSTACK_POST`,
    SUBSTACK_NOTE: `${sentinel}_SUBSTACK_NOTE`,
    REDDIT_POST: `${sentinel}_REDDIT`,
    SKOOL_POST: `${sentinel}_SKOOL_POST`,
    SKOOL_COURSE_IDEA: `${sentinel}_SKOOL_COURSE`,
    SOCIAL_VOICE_POST: `${sentinel}_VOICE`,
    SHORT_VIDEO_PROMPT: `${sentinel}_SHORT_VIDEO`,
    VISUAL_MESSAGE_PROMPT: `${sentinel}_VISUAL`,
    LOCAL_OUTREACH_IMAGE_PROMPT: `${sentinel}_LOCAL_IMAGE`,
    ...overrides,
  };

  return Object.entries(sections)
    .map(([key, value]) => `${key}:\n${value}`)
    .join("\n\n");
}

describe("Think Differently Deployment Asset divergence — evaluation", () => {
  it("rejects 25/26 exact duplicate cards (production failure mode)", () => {
    const previous = labeledPackage("HISTORICAL_V8");
    const next = labeledPackage("HISTORICAL_V8", {
      KNOWLEDGE_BASE_ENHANCEMENT: "HISTORICAL_V8_KB_CHANGED_ONLY",
    });

    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });

    assert.equal(result.accepted, false);
    assert.ok(result.duplicateRatio > THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO);
    assert.ok(result.duplicateCount >= 20);
    assert.ok(result.coreDuplicateKeys.length >= 6);
    assert.match(String(result.reason), /exact duplicates|Core assets unchanged/);
  });

  it("rejects 26/26 exact duplicates (V10===V11 production mode)", () => {
    const previous = labeledPackage("IDENTICAL");
    const next = labeledPackage("IDENTICAL");
    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.duplicateRatio, 1);
    assert.equal(result.priorPayloadSha16, result.candidatePayloadSha16);
  });

  it("accepts materially different packages with stable factual KB card", () => {
    const previous = labeledPackage("PRIOR");
    const next = labeledPackage("ALTERNATIVE", {
      KNOWLEDGE_BASE_ENHANCEMENT: "PRIOR_KB",
    });

    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.duplicateCount, 0);
    assert.deepEqual(result.coreDuplicateKeys, []);
    assert.equal(result.reason, null);
  });

  it("rejects when any core outreach asset is unchanged", () => {
    const previous = labeledPackage("PRIOR");
    const next = labeledPackage("ALTERNATIVE", {
      PERSONALIZED_OUTREACH_EMAIL: "PRIOR_EMAIL",
    });

    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });

    assert.equal(result.accepted, false);
    assert.ok(result.coreDuplicateKeys.includes("email_outreach"));
  });

  it("accepts when there is no prior package", () => {
    const next = labeledPackage("FIRST");
    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: "",
      nextSuggestedCta: next,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.baselineMissing, true);
  });

  it("detects equivalent aliases as the same canonical card", () => {
    const previous = "PERSONALIZED_OUTREACH_EMAIL:\nSAME_BODY\n\nRECOMMENDED_CTA:\nCTA";
    const next = "COLD_EMAIL:\nSAME_BODY\n\nRECOMMENDED_CTA:\nCTA";
    const prevMap = parseCanonicalDeploymentAssetMap(previous);
    const nextMap = parseCanonicalDeploymentAssetMap(next);
    assert.equal(prevMap.get("email_outreach"), nextMap.get("email_outreach"));
    assert.equal(
      canonicalDeploymentAssetType("PERSONALIZED_OUTREACH_EMAIL"),
      "email_outreach",
    );
    assert.equal(canonicalDeploymentAssetType("COLD_EMAIL"), "email_outreach");

    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });
    assert.ok(result.coreDuplicateKeys.includes("email_outreach"));
    assert.equal(result.accepted, false);
  });

  it("uses the same canonical parser as UI Deployment Assets", () => {
    const payload = labeledPackage("SHARED_PARSER");
    const uiCards = parseLabeledDeploymentAssets(payload);
    const divergenceMap = parseCanonicalDeploymentAssetMap(payload);
    assert.equal(uiCards.length, divergenceMap.size);
    for (const card of uiCards) {
      assert.ok(card.assetKey);
      assert.equal(divergenceMap.get(card.assetKey!), card.content.trim());
    }
  });
});

describe("Think Differently Deployment Asset divergence — prompt isolation", () => {
  it("strips prior suggested_cta from Think Differently prompt context", () => {
    const prior = labeledPackage("PRIOR_PACKAGE");
    const stripped = stripPriorDeploymentAssetsFromPromptContext({
      analysis: {
        id: "a1",
        summary: "Executive summary stays",
        suggested_cta: prior,
        raw_json: {
          deployment_assets: {
            raw_ai_response: prior,
            regeneration_run_id: "run-prior",
          },
          other: "keep",
        },
      },
      opportunity: {
        id: "o1",
        title: "Opp",
        suggested_cta: prior,
      },
      briefing: {
        id: "b1",
        summary: "Brief",
        recommended_response: prior,
        cta: "old-cta",
        raw_json: {
          deployment_assets: { model: "x" },
          keep: true,
        },
      },
    });

    assert.equal(stripped.analysis.suggested_cta, null);
    assert.equal(stripped.opportunity?.suggested_cta, null);
    assert.equal(stripped.briefing?.recommended_response, null);
    assert.equal(stripped.briefing?.cta, null);
    assert.equal(stripped.analysis.summary, "Executive summary stays");
    assert.equal(
      (stripped.analysis.raw_json as Record<string, unknown>).other,
      "keep",
    );
    assert.equal(
      (stripped.analysis.raw_json as Record<string, unknown>).deployment_assets,
      undefined,
    );

    const serialized = JSON.stringify(stripped);
    assert.doesNotMatch(serialized, /PRIOR_PACKAGE/);
    assert.match(serialized, /Executive summary stays/);
  });

  it("appends Deployment Assets addendum and repair instruction once", () => {
    const base = appendThinkDifferentlyInstruction("STANDARD DA PROMPT");
    const withAddendum = appendThinkDifferentlyDeploymentAssetsAddendum(base);
    assert.equal(
      withAddendum.split(THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER)
        .length - 1,
      1,
    );
    assert.match(withAddendum, /Prior Deployment Assets are intentionally omitted/);
    assert.match(withAddendum, /supersedes any prior execution strategy/);
    assert.throws(() =>
      appendThinkDifferentlyDeploymentAssetsAddendum(withAddendum),
    );

    const repaired = appendThinkDifferentlyDeploymentAssetRepairInstruction(
      withAddendum,
      ["email_outreach", "recommended_cta"],
    );
    assert.match(repaired, /DIVERGENCE REPAIR/);
    assert.match(repaired, /email_outreach, recommended_cta/);
  });
});

describe("Think Differently Deployment Asset — model routing", () => {
  it("1. Standard DA remains on Gemini Flash analysis role", () => {
    const route = resolveModelForStage("deployment_assets");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini-2\.5-flash|google\//);
  });

  it("2–3. Think Differently DA uses premium Claude family for generate and retries", () => {
    const route = resolveModelForStage(THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE);
    assert.equal(route.stage, "deployment_assets_think_differently");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude|anthropic\//);

    const blueprint = resolveModelForStage("strategic_blueprint");
    assert.equal(route.role, blueprint.role);
    assert.equal(route.model, blueprint.model);

    const daWorkflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(daWorkflow, /THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE/);
    assert.match(daWorkflow, /reasoningProfile:\s*[\s\S]*STRATEGIC/);
    // Retries call the same generateDeploymentAssets path — no Flash fallback stage.
    assert.doesNotMatch(
      daWorkflow,
      /think_differently[\s\S]*athenaStage:\s*"deployment_assets"/,
    );
  });

  it("12. Strategic Assets / blueprint routing remains premium", () => {
    const route = resolveModelForStage("strategic_blueprint");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude|anthropic\//);
  });
});

describe("Think Differently Deployment Asset divergence — workflow wiring", () => {
  it("4. Previous Current frozen payload is captured before analysis mutation", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.match(workflow, /previousDeploymentAssetPayload/);
    assert.match(workflow, /getCurrentExecutiveVersion/);
    assert.match(workflow, /frozenCurrentSuggestedCta/);

    const baselineIdx = workflow.indexOf("previousDeploymentAssetPayload");
    const generateIdx = workflow.indexOf("generateDeploymentAssets(");
    const persistIdx = workflow.indexOf("persistDeploymentAssets(");
    const publishIdx = workflow.indexOf(
      "publishExecutiveIntelligenceVersion(",
    );
    assert.ok(baselineIdx > 0 && baselineIdx < generateIdx);
    assert.ok(persistIdx > generateIdx);
    assert.ok(publishIdx > persistIdx);
  });

  it("5–10. Gate, retries, persistence/publication bypass, terminal failure", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const executor = read(
      "services/generationJobs/generationJobExecutor.ts",
    );
    const daWorkflow = read("services/workflows/deploymentAssetsWorkflow.ts");

    assert.match(workflow, /ATHENA_TD_DA_DIVERGENCE/);
    assert.match(
      workflow,
      /evaluateThinkDifferentlyDeploymentAssetDivergence/,
    );
    assert.match(
      workflow,
      /deployment_assets_insufficient_divergence/,
    );
    assert.match(workflow, /divergenceRepairDuplicateKeys/);
    assert.match(workflow, /reject_exhausted/);

    const evaluateIdx = workflow.indexOf(
      "evaluateThinkDifferentlyDeploymentAssetDivergence(",
    );
    const persistIdx = workflow.indexOf("persistDeploymentAssets(");
    const publishIdx = workflow.indexOf(
      "publishExecutiveIntelligenceVersion(",
    );
    const failIdx = workflow.indexOf(
      "deployment_assets_insufficient_divergence",
    );
    assert.ok(evaluateIdx > 0 && evaluateIdx < persistIdx);
    assert.ok(failIdx > 0 && failIdx < persistIdx);
    assert.ok(failIdx < publishIdx);

    assert.match(executor, /generationJobId:\s*job\.id/);
    assert.match(
      executor,
      /DEPLOYMENT_ASSETS_INSUFFICIENT_DIVERGENCE/,
    );
    assert.match(
      executor,
      /divergenceTerminal[\s\S]*retryable:\s*divergenceTerminal[\s\S]*false/,
    );

    const classified = classifyGenerationError(
      "deployment_assets_insufficient_divergence: Think Differently Deployment Assets were not materially distinct from the prior package.",
    );
    assert.equal(classified.classification, "terminal");
    assert.equal(
      classified.code,
      "DEPLOYMENT_ASSETS_INSUFFICIENT_DIVERGENCE",
    );

    assert.match(daWorkflow, /stripPriorDeploymentAssetsFromPromptContext/);
    assert.equal(THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS, 3);
    assert.ok(
      THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS.includes("email_outreach"),
    );
  });

  it("11. Materially different accepted candidates can reach persist/publish", () => {
    const previous = labeledPackage("PRIOR");
    const next = labeledPackage("PREMIUM_DISTINCT");
    const result = evaluateThinkDifferentlyDeploymentAssetDivergence({
      previousSuggestedCta: previous,
      nextSuggestedCta: next,
    });
    assert.equal(result.accepted, true);

    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const acceptBreak = workflow.indexOf("generatedAssets = candidate");
    const persistIdx = workflow.indexOf("persistDeploymentAssets(");
    assert.ok(acceptBreak > 0 && acceptBreak < persistIdx);
  });

  it("13. Discussion Think Differently shares premium DA routing via generationMode", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.match(workflow, /generationMode:\s*"think_differently"/);
    assert.doesNotMatch(workflow, /platform === .*prospect/);
    const daWorkflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(
      daWorkflow,
      /generationMode === "think_differently"[\s\S]*THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE/,
    );
  });

  it("UI version-bound Deployment Asset key fix remains present", () => {
    const deploymentAssets = read("components/deployment/DeploymentAssets.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(deploymentAssets, /executiveVersionId/);
    assert.match(deploymentAssets, /buildDeploymentAssetCards/);
    assert.match(workspace, /executiveVersionId=\{viewModel\.executiveVersionId\}/);
  });

  it("Standard discussion workflow remains free of Think Differently divergence gate", () => {
    const endToEnd = read("services/workflows/discussionWorkflow.ts");
    assert.doesNotMatch(
      endToEnd,
      /evaluateThinkDifferentlyDeploymentAssetDivergence/,
    );
    assert.doesNotMatch(
      endToEnd,
      /deployment_assets_insufficient_divergence/,
    );
    assert.doesNotMatch(endToEnd, /stripPriorDeploymentAssetsFromPromptContext/);
    assert.doesNotMatch(endToEnd, /deployment_assets_think_differently/);
  });
});
