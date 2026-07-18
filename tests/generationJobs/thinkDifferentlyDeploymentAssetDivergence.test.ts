import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  appendThinkDifferentlyDeploymentAssetRepairInstruction,
  appendThinkDifferentlyDeploymentAssetsAddendum,
  evaluateThinkDifferentlyDeploymentAssetDivergence,
  stripPriorDeploymentAssetsFromPromptContext,
  THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER,
  THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO,
} from "../../services/brain/generationContracts/thinkDifferentlyDeploymentAssetDivergence";
import { appendThinkDifferentlyInstruction } from "../../services/brain/generationContracts/thinkDifferentlyInstruction";

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

    // Serialized SOURCE INTELLIGENCE must not reintroduce prior package text.
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

describe("Think Differently Deployment Asset divergence — workflow wiring", () => {
  it("workflow generates freshly, validates divergence, retries, and refuses publish on exhaustion", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const daWorkflow = read("services/workflows/deploymentAssetsWorkflow.ts");

    assert.match(workflow, /previousSuggestedCta/);
    assert.match(
      workflow,
      /evaluateThinkDifferentlyDeploymentAssetDivergence/,
    );
    assert.match(
      workflow,
      /THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS/,
    );
    assert.match(
      workflow,
      /deployment_assets_insufficient_divergence/,
    );
    assert.match(workflow, /divergenceRepairDuplicateKeys/);

    const generateIdx = workflow.indexOf("generateDeploymentAssets(");
    const evaluateIdx = workflow.indexOf(
      "evaluateThinkDifferentlyDeploymentAssetDivergence(",
    );
    const persistIdx = workflow.indexOf("persistDeploymentAssets(");
    const publishIdx = workflow.indexOf(
      "publishExecutiveIntelligenceVersion(",
    );
    assert.ok(generateIdx > 0 && evaluateIdx > generateIdx);
    assert.ok(persistIdx > evaluateIdx);
    assert.ok(publishIdx > persistIdx);

    const failIdx = workflow.indexOf(
      "deployment_assets_insufficient_divergence",
    );
    assert.ok(failIdx > 0 && failIdx < publishIdx);

    assert.match(daWorkflow, /stripPriorDeploymentAssetsFromPromptContext/);
    assert.match(daWorkflow, /appendThinkDifferentlyDeploymentAssetsAddendum/);
    assert.match(
      daWorkflow,
      /appendThinkDifferentlyDeploymentAssetRepairInstruction/,
    );
    assert.match(daWorkflow, /divergenceRepairDuplicateKeys/);

    // Standard path must not strip or add TD DA addendum unconditionally.
    assert.match(
      daWorkflow,
      /generationMode === "think_differently"[\s\S]*stripPriorDeploymentAssetsFromPromptContext/,
    );

    assert.equal(THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS, 3);
    assert.ok(THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS.includes("email_outreach"));
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
  });
});
