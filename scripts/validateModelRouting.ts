/**
 * Run: npx tsx scripts/validateModelRouting.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveAthenaStageFromGenerationKind,
  resolveModelForStage,
  resolveRoleForStage,
} from "@/lib/llm/modelRouting";

const DEFAULT_ANALYSIS_MODEL = "google/gemini-2.5-flash";
const DEFAULT_PREMIUM_MODEL = "anthropic/claude-sonnet-4";

const CORE_STAGES = [
  "discussion_analysis",
  "opportunity_generation",
  "executive_briefing",
  "deployment_assets",
  "strategic_blueprint",
] as const;

const ANALYSIS_EXTENDED_STAGES = [
  "community_intelligence",
  "production_intelligence",
  "identity_profile",
  "generic_review",
  "prospect_deployment_assets",
] as const;

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function isClaudeModel(model: string): boolean {
  return model.toLowerCase().includes("claude");
}

console.log("Athena LLM Routing\n");

for (const stage of CORE_STAGES) {
  const role = resolveRoleForStage(stage);
  const model = resolveModelForStage(stage).model;
  console.log(`${stage} -> ${role} -> ${model}`);
}

console.log("");

for (const stage of CORE_STAGES) {
  const route = resolveModelForStage(stage);
  if (!route.model) {
    fail(`${stage} resolved to undefined model`);
    continue;
  }
  pass(`${stage} resolves to ${route.model}`);
}

const analysisModel = resolveModelForStage("discussion_analysis").model;
const premiumModel = resolveModelForStage("strategic_blueprint").model;

if (analysisModel === DEFAULT_ANALYSIS_MODEL) {
  pass(`Analysis default is ${DEFAULT_ANALYSIS_MODEL}`);
} else {
  fail(
    `Expected analysis default ${DEFAULT_ANALYSIS_MODEL}, got ${analysisModel}`,
  );
}

if (premiumModel === DEFAULT_PREMIUM_MODEL) {
  pass(`Premium default is ${DEFAULT_PREMIUM_MODEL}`);
} else {
  fail(
    `Expected premium default ${DEFAULT_PREMIUM_MODEL}, got ${premiumModel}`,
  );
}

if (analysisModel !== premiumModel) {
  pass("Analysis and premium stages use distinct default models");
} else {
  fail("Analysis and premium stages must not share the same default model");
}

for (const stage of [...CORE_STAGES, ...ANALYSIS_EXTENDED_STAGES]) {
  const route = resolveModelForStage(stage);
  if (route.role === "analysis" && isClaudeModel(route.model)) {
    fail(`${stage} analysis role must not default to Claude outside env override`);
  }
}

for (const stage of [
  "deployment_assets",
  "prospect_deployment_assets",
] as const) {
  const route = resolveModelForStage(stage);
  if (route.role !== "analysis") {
    fail(`${stage} must use analysis role (Gemini)`);
  } else if (isClaudeModel(route.model)) {
    fail(`${stage} analysis role must not default to Claude`);
  } else {
    pass(`${stage} analysis role defaults to Gemini (${route.model})`);
  }
}

{
  const route = resolveModelForStage("strategic_blueprint");
  if (route.role !== "premiumStrategicOutput" || !isClaudeModel(route.model)) {
    fail("strategic_blueprint premium role must default to Claude");
  } else {
    pass("strategic_blueprint premium role defaults to Claude");
  }
}

if (
  resolveAthenaStageFromGenerationKind("opportunity_review") ===
  "opportunity_generation"
) {
  pass("opportunity_review generation kind maps to opportunity_generation stage");
} else {
  fail("opportunity_review stage mapping incorrect");
}

const openrouterSource = readFileSync(
  join(process.cwd(), "lib/openrouter.ts"),
  "utf8",
);
const aiServiceSource = readFileSync(
  join(process.cwd(), "services/aiService.ts"),
  "utf8",
);
const modelRoutingSource = readFileSync(
  join(process.cwd(), "lib/llm/modelRouting.ts"),
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

if (openrouterSource.includes("reasoning=")) {
  pass("OpenRouter wrapper logs reasoning in Athena LLM routing metadata");
} else {
  fail("OpenRouter wrapper missing reasoning in Athena LLM routing logs");
}

if (!modelRoutingSource.includes("google/gemini-2.5-flash")) {
  fail("modelRouting.ts missing Gemini analysis default");
} else {
  pass("modelRouting.ts defines Gemini analysis default");
}

if (!aiServiceSource.includes("process.env.OPENROUTER_MODEL")) {
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
