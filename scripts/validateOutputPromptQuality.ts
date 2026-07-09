/**
 * Run: npx tsx scripts/validateOutputPromptQuality.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDiscussionAnalysisPrompt } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { buildOpportunityReviewPrompt } from "@/services/ai/prompts/opportunityReviewPrompt";
import {
  ASSET_BLUEPRINT_GENERATION_RULES,
  ASSET_BLUEPRINT_PROMPT_VERSION,
  getAssetBlueprintOutputSchemaForDebug,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";

const contractHelpersPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);
const deploymentInstructionsPath = join(
  process.cwd(),
  "services/ai/prompts/deploymentAssetsInstructions.ts",
);
const blueprintPromptPath = join(
  process.cwd(),
  "services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
);

const contractHelpersSource = readFileSync(contractHelpersPath, "utf8");
const deploymentInstructionsSource = readFileSync(deploymentInstructionsPath, "utf8");
const blueprintPromptSource = readFileSync(blueprintPromptPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function requirePhrases(source: string, phrases: string[], label: string) {
  for (const phrase of phrases) {
    if (source.toLowerCase().includes(phrase.toLowerCase())) {
      pass(`${label} includes "${phrase}"`);
    } else {
      fail(`${label} missing "${phrase}"`);
    }
  }
}

console.log("Athena Output Prompt Quality Validation\n");

const sampleDiscussion = {
  id: "discussion-test",
  title: "PMU artists, after your training how did you start your business?",
  body: "I finished training but I'm not sure I'm ready for paying clients.",
  organization_id: "org-test",
} as never;

const analysisPrompt = buildDiscussionAnalysisPrompt(sampleDiscussion, "Brain: PMU educator");
const briefingPrompt = buildOpportunityReviewPrompt({
  id: "opp-test",
  title: "Post-training readiness gap",
  reason: "Uncertainty after certification",
} as never);

requirePhrases(deploymentInstructionsSource, [
  "ANTI-GENERIC",
  "SELF-CHECK",
  "COMMUNITY_REPLY",
  "PRIVATE_MESSAGE",
  "FOLLOW_UP",
  "SOCIAL_POST",
  "non-obvious insight",
  "comprehensive guide",
  "commercial strategist",
], "deployment instructions");

requirePhrases(analysisPrompt, [
  "COMMUNITY_REPLY",
  "SELF-CHECK",
  "commercial strategist",
  "certificate is not the business",
], "discussion analysis prompt");

requirePhrases(briefingPrompt, [
  "COMMUNITY_REPLY",
  "SELF-CHECK",
  "commercial strategist",
  "did this help",
], "executive briefing prompt");

requirePhrases(blueprintPromptSource, [
  "commercial strategist",
  "SELF-CHECK",
  "why_this_asset",
  "Readiness Scorecard",
  "image_prompt",
  "pdf_prompt",
  "social_prompt",
  "REJECTED GENERIC OPTION",
], "blueprint prompt source");

requirePhrases(ASSET_BLUEPRINT_GENERATION_RULES, [
  "comprehensive guide",
  "why_this_asset",
], "blueprint generation rules");

requirePhrases(contractHelpersSource, [
  "LinkedIn-style educational filler",
  "why_this_asset must reject",
  "community reply must sound natural",
], "generation contracts");

if (getAssetBlueprintOutputSchemaForDebug().includes("why_this_asset")) {
  pass("Blueprint output schema includes why_this_asset");
} else {
  fail("Blueprint output schema missing why_this_asset");
}

if (ASSET_BLUEPRINT_PROMPT_VERSION.includes("output_quality")) {
  pass(`Blueprint prompt version bumped (${ASSET_BLUEPRINT_PROMPT_VERSION})`);
} else {
  fail("Blueprint prompt version not bumped for output quality sprint");
}

console.log("");
if (failures === 0) {
  console.log("All output prompt quality checks passed.");
  process.exit(0);
}

console.error(`\n${failures} check(s) failed.`);
process.exit(1);
