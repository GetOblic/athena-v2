/**
 * Run: npx tsx scripts/validateModelRouting.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getLLMStageRoutes,
  resolveAthenaStageFromGenerationKind,
  resolveModelForStage,
  resolveOpenRouterFallbackModel,
  resolveRoleForStage,
} from "@/lib/llm/modelRouting";

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Athena Model Routing Validation\n");

const fallback = resolveOpenRouterFallbackModel();
const analysisModel = resolveModelForStage("discussion_analysis").model;
const premiumModel = resolveModelForStage("strategic_blueprint").model;

if (analysisModel === fallback && premiumModel === fallback) {
  pass("Analysis and premium stages default to the same fallback model");
} else {
  fail("Unexpected default model divergence without role-specific env vars");
}

if (resolveRoleForStage("discussion_analysis") === "analysis") {
  pass("discussion_analysis maps to analysis role");
} else {
  fail("discussion_analysis role mapping incorrect");
}

if (resolveRoleForStage("strategic_blueprint") === "premiumStrategicOutput") {
  pass("strategic_blueprint maps to premiumStrategicOutput role");
} else {
  fail("strategic_blueprint role mapping incorrect");
}

if (
  resolveAthenaStageFromGenerationKind("opportunity_review") ===
  "opportunity_generation"
) {
  pass("opportunity_review generation kind maps to opportunity_generation stage");
} else {
  fail("opportunity_review stage mapping incorrect");
}

const stageRoutes = getLLMStageRoutes();
for (const stage of [
  "discussion_analysis",
  "opportunity_generation",
  "executive_briefing",
  "deployment_assets",
  "strategic_blueprint",
] as const) {
  if (stageRoutes[stage]?.model) {
    pass(`Stage route configured for ${stage}`);
  } else {
    fail(`Missing stage route for ${stage}`);
  }
}

const openrouterSource = readFileSync(
  join(process.cwd(), "lib/openrouter.ts"),
  "utf8",
);
const aiServiceSource = readFileSync(
  join(process.cwd(), "services/aiService.ts"),
  "utf8",
);

for (const [file, source] of [
  ["lib/openrouter.ts", openrouterSource],
  ["services/aiService.ts", aiServiceSource],
] as const) {
  if (source.includes("resolveModelForStage")) {
    pass(`${file} resolves models through centralized routing`);
  } else {
    fail(`${file} missing centralized model routing`);
  }
}

if (openrouterSource.includes("[Athena LLM]")) {
  pass("OpenRouter wrapper logs Athena LLM routing metadata");
} else {
  fail("OpenRouter wrapper missing Athena LLM routing logs");
}

if (!aiServiceSource.includes('process.env.OPENROUTER_MODEL')) {
  pass("aiService no longer reads OPENROUTER_MODEL directly");
} else {
  fail("aiService still reads OPENROUTER_MODEL directly");
}

console.log("");
if (failures === 0) {
  console.log("All model routing checks passed.");
  process.exit(0);
}

console.error(`\n${failures} check(s) failed.`);
process.exit(1);
