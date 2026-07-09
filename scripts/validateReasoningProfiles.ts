/**
 * Run: npx tsx scripts/validateReasoningProfiles.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_GENERATION_KINDS,
  ALL_OUTPUT_TYPES,
  BUNDLED_OUTPUT_TYPES,
  getReasoningProfile,
  getReasoningProfileForGeneration,
  getReasoningProfileForOutputType,
  isReasoningSupportedByModel,
  resolveReasoningAttachment,
} from "@/lib/reasoningProfiles";

const paths = {
  openrouter: join(process.cwd(), "lib/openrouter.ts"),
  reasoningProfiles: join(process.cwd(), "lib/reasoningProfiles.ts"),
  aiService: join(process.cwd(), "services/aiService.ts"),
  workflow: join(process.cwd(), "services/workflows/discussionWorkflow.ts"),
  blueprintService: join(process.cwd(), "services/assetBlueprints/assetBlueprintService.ts"),
  promptAssembly: join(
    process.cwd(),
    "services/brain/generationContracts/generationPromptAssembly.ts",
  ),
  blueprintPrompt: join(
    process.cwd(),
    "services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
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

console.log("Athena Reasoning Profiles Validation\n");

for (const outputType of ALL_OUTPUT_TYPES) {
  const profile = getReasoningProfileForOutputType(outputType);
  pass(`${outputType} → ${profile}`);
}

if (getReasoningProfileForOutputType("community_reply") === "FAST") {
  pass("Community Reply uses FAST");
} else {
  fail("Community Reply must use FAST");
}

if (getReasoningProfileForOutputType("private_message") === "FAST") {
  pass("Private Message uses FAST");
} else {
  fail("Private Message must use FAST");
}

if (getReasoningProfileForOutputType("strategic_asset_blueprint") === "STRATEGIC") {
  pass("Strategic Asset Blueprint uses STRATEGIC");
} else {
  fail("Strategic Asset Blueprint must use STRATEGIC");
}

if (getReasoningProfileForOutputType("pdf_prompt") === "STRATEGIC") {
  pass("PDF Prompt uses STRATEGIC");
} else {
  fail("PDF Prompt must use STRATEGIC");
}

if (getReasoningProfileForGeneration("strategic_blueprint") === "STRATEGIC") {
  pass("strategic_blueprint call uses STRATEGIC");
} else {
  fail("strategic_blueprint call must use STRATEGIC");
}

if (getReasoningProfileForGeneration("discussion_analysis") === "EXECUTIVE") {
  pass("discussion_analysis bundled call uses EXECUTIVE");
} else {
  fail("discussion_analysis bundled call must use EXECUTIVE");
}

const strategicPayload = getReasoningProfile("STRATEGIC");
if (strategicPayload.reasoning.effort === "xhigh") {
  pass("STRATEGIC profile uses xhigh effort");
} else {
  fail("STRATEGIC profile must use xhigh effort");
}

if (!("max_tokens" in strategicPayload.reasoning)) {
  pass("Reasoning payload uses effort only (no max_tokens)");
} else {
  fail("Reasoning payload must not include max_tokens");
}

const supported = resolveReasoningAttachment({
  model: "openai/o3-mini",
  profile: "EXECUTIVE",
});
if (supported.attach && supported.effort === "high") {
  pass("Supported model attaches EXECUTIVE reasoning");
} else {
  fail("Supported model should attach EXECUTIVE reasoning");
}

const unsupported = resolveReasoningAttachment({
  model: "meta-llama/llama-3.1-8b-instruct",
  profile: "STRATEGIC",
});
if (!unsupported.attach) {
  pass("Unsupported model omits reasoning safely");
} else {
  fail("Unsupported model should omit reasoning");
}

const requiredSourceChecks = [
  ["openrouter", "reasoningProfile"],
  ["openrouter", "resolveReasoningAttachment"],
  ["openrouter", "retry_without_reasoning"],
  ["openrouter", "buildTokenBudgetSchedule"],
  ["openrouter", "max_tokens:"],
  ["openrouter", 'NODE_ENV === "development"'],
  ["aiService", "getReasoningProfileForGeneration"],
  ["aiService", "generationKind"],
  ["aiService", "await callOpenRouter"],
  ["workflow", 'generationKind: "discussion_analysis"'],
  ["workflow", 'generationKind: "executive_briefing"'],
  ["blueprintService", 'generationKind: "strategic_blueprint"'],
  ["promptAssembly", "formatReasoningContextForBlueprintSelection"],
  ["promptAssembly", "blueprintSelection: true"],
  ["blueprintPrompt", "You must decide asset_type yourself"],
] as const;

for (const [label, phrase] of requiredSourceChecks) {
  if (sources[label].includes(phrase)) {
    pass(`${label} includes "${phrase}"`);
  } else {
    fail(`${label} missing "${phrase}"`);
  }
}

const duplicateConfigPatterns = [
  /reasoning:\s*{\s*effort:/g,
];
for (const [file, source] of Object.entries(sources)) {
  if (file === "reasoningProfiles") {
    continue;
  }
  const matches = source.match(duplicateConfigPatterns[0]) ?? [];
  if (matches.length > 0) {
    fail(`${file} duplicates inline reasoning config (${matches.length})`);
  } else {
    pass(`${file} has no duplicate inline reasoning config`);
  }
}

for (const kind of ALL_GENERATION_KINDS) {
  const profile = getReasoningProfileForGeneration(kind);
  if (profile) {
    pass(`Generation kind ${kind} resolves to ${profile}`);
  } else {
    fail(`Generation kind ${kind} missing profile`);
  }
}

for (const [kind, outputs] of Object.entries(BUNDLED_OUTPUT_TYPES)) {
  if (outputs.length === 0) {
    continue;
  }
  const callProfile = getReasoningProfileForGeneration(kind as typeof ALL_GENERATION_KINDS[number]);
  const outputProfiles = outputs.map(getReasoningProfileForOutputType);
  pass(
    `${kind} bundled call=${callProfile}; outputs=${outputProfiles.join(",")}`,
  );
}

if (isReasoningSupportedByModel("anthropic/claude-sonnet-4")) {
  pass("Claude Sonnet 4 detected as reasoning-capable");
} else {
  pass("Claude Sonnet 4 not auto-detected (use OPENROUTER_REASONING_ENABLED=true if needed)");
}

console.log("");
if (failures === 0) {
  console.log("All reasoning profile checks passed.");
  process.exit(0);
}

console.error(`\n${failures} check(s) failed.`);
process.exit(1);
