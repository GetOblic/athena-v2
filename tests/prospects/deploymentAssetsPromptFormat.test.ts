import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  extractProspectDeploymentAssetKeys,
  isCompleteProspectDeploymentAssetSet,
  unwrapProspectDeploymentAssetResponse,
} from "../../lib/prospectDeploymentAssetContract";
import { PROSPECT_DEPLOYMENT_SECTION_LABELS } from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import { DEPLOYMENT_SECTION_LABELS } from "../../services/ai/prompts/sharedPromptConstraints";
import {
  buildDeploymentAssetsRequiredOutputInstructions,
  getProspectDeploymentGenerationHeadings,
} from "../../services/brain/generationContracts/deploymentAssetsRequiredOutput";

const ROOT = join(process.cwd());
const ASSEMBLY_PATH = join(
  ROOT,
  "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
);
const WORKFLOW_PATH = join(
  ROOT,
  "services/workflows/deploymentAssetsWorkflow.ts",
);

describe("Deployment Assets prompt — Gemini plain-text canonical format", () => {
  it("Prospect required output contains all 14 canonical headings", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });

    for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }
    assert.equal(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.length, 14);
    assert.equal(getProspectDeploymentGenerationHeadings().length, 18);
  });

  it("requires each canonical heading exactly once", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });

    for (const key of getProspectDeploymentGenerationHeadings()) {
      const matches = block.match(new RegExp(`${key}:`, "g")) ?? [];
      assert.equal(matches.length, 1, `${key} must appear exactly once`);
    }
  });

  it("forbids JSON and code fences in required output instructions", () => {
    const prospect = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    const discussion = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: false,
    });

    for (const block of [prospect, discussion]) {
      assert.match(block, /Do not return JSON/i);
      assert.match(block, /Do not wrap the response in Markdown code fences/i);
      assert.match(block, /Return ONLY plain text/i);
      assert.doesNotMatch(block, /Return ONLY valid JSON/);
      assert.doesNotMatch(block, /"suggested_cta"/);
      assert.doesNotMatch(block, /```/);
    }
  });

  it("preserves the existing Prospect completeness contract key set", () => {
    assert.deepEqual(
      [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS],
      [
        "PERSONALIZED_OUTREACH_EMAIL",
        "FOLLOW_UP_EMAIL",
        "LINKEDIN_CONNECTION",
        "LINKEDIN_FOLLOW_UP",
        "COLD_CALL_OPENING",
        "DISCOVERY_QUESTIONS",
        "PERSONALIZED_VALUE_PROPOSITION",
        "OBJECTION_ANTICIPATION",
        "MEETING_PREPARATION",
        "RECOMMENDED_CTA",
        "FOLLOW_UP_SEQUENCE",
        "PERSONALIZED_VIDEO_SCRIPT",
        "NEWSLETTER_IDEA",
        "BLOG_POST_IDEA",
      ],
    );

    const labeled = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map(
      (key) => `${key}:\nContent`,
    ).join("\n\n");
    const parsedKeys = extractProspectDeploymentAssetKeys(labeled);
    assert.equal(isCompleteProspectDeploymentAssetSet(parsedKeys), true);
    assert.equal(unwrapProspectDeploymentAssetResponse(labeled).isComplete, true);

    for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
      assert.match(PROSPECT_DEPLOYMENT_SECTION_LABELS, new RegExp(`${key}:`));
    }
  });

  it("is shared by Prospect and Discussion generation through one assembly path", () => {
    const assembly = readFileSync(ASSEMBLY_PATH, "utf8");
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const requiredOutputModule = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsRequiredOutput.ts",
      ),
      "utf8",
    );

    assert.match(assembly, /export function assembleDeploymentAssetsPrompt/);
    assert.match(
      assembly,
      /buildDeploymentAssetsRequiredOutputInstructions/,
    );
    assert.match(workflow, /assembleDeploymentAssetsPrompt/);
    assert.doesNotMatch(assembly, /SHARED_JSON_OUTPUT_RULES/);
    assert.doesNotMatch(requiredOutputModule, /SHARED_JSON_OUTPUT_RULES/);
    assert.match(requiredOutputModule, /SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES/);

    const discussionBlock = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: false,
    });
    assert.match(discussionBlock, /COMMUNITY_REPLY:/);
    assert.equal(
      discussionBlock.includes(DEPLOYMENT_SECTION_LABELS.trim()),
      true,
    );

    const prospectBlock = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    assert.match(prospectBlock, /PERSONALIZED_OUTREACH_EMAIL:/);
    assert.doesNotMatch(prospectBlock, /COMMUNITY_REPLY:/);
  });
});

