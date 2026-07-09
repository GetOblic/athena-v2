/**
 * Run: npx tsx scripts/validateOutputPromptQuality.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDiscussionAnalysisPrompt } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { buildOpportunityReviewPrompt } from "@/services/ai/prompts/opportunityReviewPrompt";
import { SHARED_FORBIDDEN_PHRASES } from "@/services/ai/prompts/sharedPromptConstraints";
import {
  ASSET_BLUEPRINT_GENERATION_RULES,
  ASSET_BLUEPRINT_PROMPT_VERSION,
  getAssetBlueprintOutputSchemaForDebug,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import {
  getReasoningProfile,
  getReasoningProfileForGeneration,
} from "@/lib/reasoningProfiles";
import { generateReview } from "@/services/aiService";

const paths = {
  sharedConstraints: join(
    process.cwd(),
    "services/ai/prompts/sharedPromptConstraints.ts",
  ),
  reasoningProfiles: join(process.cwd(), "lib/reasoningProfiles.ts"),
  openrouter: join(process.cwd(), "lib/openrouter.ts"),
  aiService: join(process.cwd(), "services/aiService.ts"),
  businessContext: join(
    process.cwd(),
    "services/brain/generationContracts/businessContextBlock.ts",
  ),
  promptAssembly: join(
    process.cwd(),
    "services/brain/generationContracts/generationPromptAssembly.ts",
  ),
  reasoningFormatting: join(
    process.cwd(),
    "services/brain/reasoningPipeline/reasoningPipelinePromptFormatting.ts",
  ),
  blueprintPrompt: join(
    process.cwd(),
    "services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
  ),
  deploymentInstructions: join(
    process.cwd(),
    "services/ai/prompts/deploymentAssetsInstructions.ts",
  ),
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]),
) as Record<keyof typeof paths, string>;

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

function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(re) ?? []).length;
}

console.log("Athena Output Prompt Quality Validation\n");

const sampleDiscussion = {
  id: "discussion-test",
  title: "PMU artists, after your training how did you start your business?",
  body: "I finished training but I'm not sure I'm ready for paying clients.",
  organization_id: "org-test",
} as never;

const sampleContext = `
=== BUSINESS CONTEXT (provided — use directly, do not re-infer) ===
ORGANIZATION BRAIN:
- Operator: Liana
- About: PMU educator
BUYER STAGE:
- consideration
`.trim();

const analysisPrompt = buildDiscussionAnalysisPrompt(
  sampleDiscussion,
  sampleContext,
);
const briefingPrompt = buildOpportunityReviewPrompt({
  id: "opp-test",
  title: "Post-training readiness gap",
  reason: "Uncertainty after certification",
} as never);

requirePhrases(sources.sharedConstraints, [
  "SHARED_ANTI_GENERIC_RULES",
  "SHARED_OUTPUT_DIVERSITY_RULES",
  "Expression diversity",
], "shared prompt constraints");

requirePhrases(sources.reasoningProfiles, [
  "getReasoningProfile",
  "getReasoningProfileForGeneration",
  'EXECUTIVE: "high"',
  'STRATEGIC: "xhigh"',
], "reasoning profiles");

requirePhrases(sources.openrouter, [
  "reasoningProfile",
  "isReasoningSupportedByModel",
], "openrouter reasoning integration");

requirePhrases(sources.aiService, [
  "getReasoningProfileForGeneration",
  "generationKind",
  "reasoningProfile",
], "ai service reasoning wiring");

requirePhrases(sources.businessContext, [
  "formatStructuredBusinessContext",
  "ORGANIZATION BRAIN",
  "BUYER STAGE",
  "CURRENT BUSINESS OBJECTIVE",
], "structured business context block");

requirePhrases(sources.promptAssembly, [
  "formatStructuredBusinessContext",
  "formatReasoningPipelineCompactForPrompt",
], "prompt assembly");

if (sources.reasoningFormatting.includes("formatReasoningPipelineCompactForPrompt")) {
  pass("Compact reasoning pipeline formatter present");
} else {
  fail("Compact reasoning pipeline formatter missing");
}

if (
  !sources.reasoningFormatting.includes("DO NOT CONTRADICT") ||
  sources.reasoningFormatting.includes("inform reasoning")
) {
  pass("Reasoning pipeline uses signal language instead of hard lock-in");
} else {
  fail("Reasoning pipeline still uses contradictory lock-in language");
}

requirePhrases(analysisPrompt, [
  "=== OBJECTIVE ===",
  "=== BUSINESS CONTEXT ===",
  "=== REQUIRED OUTPUT ===",
  "=== QUALITY STANDARD ===",
  "COMMUNITY_REPLY",
  "Expression diversity",
], "discussion analysis prompt");

requirePhrases(briefingPrompt, [
  "=== OBJECTIVE ===",
  "=== REQUIRED OUTPUT ===",
  "COMMUNITY_REPLY",
], "executive briefing prompt");

requirePhrases(sources.blueprintPrompt, [
  "executive strategy consultant",
  "Why this asset matters",
  "why now",
  "why_this_asset",
  "SHARED_OUTPUT_DIVERSITY_RULES",
], "blueprint prompt source");

if (getAssetBlueprintOutputSchemaForDebug().includes("why_this_asset")) {
  pass("Blueprint output schema includes why_this_asset");
} else {
  fail("Blueprint output schema missing why_this_asset");
}

if (ASSET_BLUEPRINT_PROMPT_VERSION.includes("executive_consultant")) {
  pass(`Blueprint prompt version (${ASSET_BLUEPRINT_PROMPT_VERSION})`);
} else {
  fail("Blueprint prompt version not updated for reasoning sprint");
}

const executiveProfile = getReasoningProfile("EXECUTIVE");
const strategicProfile = getReasoningProfile("STRATEGIC");
if (executiveProfile.reasoning.effort === "high") {
  pass("EXECUTIVE reasoning profile uses high effort");
} else {
  fail("EXECUTIVE reasoning profile misconfigured");
}
if (strategicProfile.reasoning.effort === "xhigh") {
  pass("STRATEGIC reasoning profile uses xhigh effort");
} else {
  fail("STRATEGIC reasoning profile misconfigured");
}

if (getReasoningProfileForGeneration("discussion_analysis") === "EXECUTIVE") {
  pass("Discussion analysis mapped to EXECUTIVE reasoning");
} else {
  fail("Discussion analysis reasoning mapping incorrect");
}

if (getReasoningProfileForGeneration("strategic_blueprint") === "STRATEGIC") {
  pass("Strategic blueprint mapped to STRATEGIC reasoning");
} else {
  fail("Strategic blueprint reasoning mapping incorrect");
}

const generateReviewSource = sources.aiService;
if (!generateReviewSource.includes("await callOpenRouter")) {
  fail("generateReview must call centralized OpenRouter helper");
} else {
  pass("generateReview uses centralized OpenRouter helper");
}

const forbiddenDuplicationThreshold = 3;
for (const phrase of ["comprehensive guide", "join our webinar"]) {
  const analysisCount = countPhrase(analysisPrompt, phrase);
  if (analysisCount <= forbiddenDuplicationThreshold) {
    pass(`Analysis prompt "${phrase}" duplication acceptable (${analysisCount})`);
  } else {
    fail(
      `Analysis prompt over-duplicates "${phrase}" (${analysisCount} > ${forbiddenDuplicationThreshold})`,
    );
  }
}

if (analysisPrompt.includes("BUSINESS CONTEXT")) {
  pass("Analysis prompt accepts structured business context");
} else {
  fail("Analysis prompt missing business context section");
}

if (analysisPrompt.length < 8000) {
  pass(`Analysis base prompt length reasonable (${analysisPrompt.length} chars)`);
} else {
  fail(`Analysis base prompt oversized (${analysisPrompt.length} chars)`);
}

if (
  sources.deploymentInstructions.includes("sharedPromptConstraints") ||
  sources.deploymentInstructions.includes("SHARED_DEPLOYMENT_QUALITY")
) {
  pass("Deployment instructions deduplicated via shared constraints");
} else {
  fail("Deployment instructions not deduplicated");
}

if (SHARED_FORBIDDEN_PHRASES.length >= 8) {
  pass("Shared forbidden phrase list populated");
} else {
  fail("Shared forbidden phrase list too small");
}

if (typeof generateReview === "function") {
  pass("generateReview export available for reasoning profile enforcement");
}

console.log("");
if (failures === 0) {
  console.log("All output prompt quality checks passed.");
  process.exit(0);
}

console.error(`\n${failures} check(s) failed.`);
process.exit(1);
