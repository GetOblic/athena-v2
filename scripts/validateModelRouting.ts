/**
 * Run: npx tsx scripts/validateModelRouting.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EVERGREEN_SOCIAL_PLANNER_MODEL,
  getLLMModelRoles,
  resolveAthenaStageFromGenerationKind,
  resolveModelForStage,
  resolveOpenRouterFallbackModel,
  resolveRoleForStage,
} from "@/lib/llm/modelRouting";

const DEFAULT_ANALYSIS_MODEL = "google/gemini-2.5-flash";
const DEFAULT_PREMIUM_MODEL = "google/gemini-2.5-flash";
const RETIRED_PREMIUM_MODEL = "anthropic/claude-sonnet-4";

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
  "ad_platform_assets",
  "ad_keyword_themes",
  "seo_accompanying_email",
] as const;

const ADS_PREMIUM_EXTENDED_STAGES = ["ad_campaign_strategy"] as const;

const PREMIUM_STAGES = [
  "strategic_blueprint",
  "deployment_assets_think_differently",
  "ad_campaign_strategy",
  "seo_executive_assessment",
  "seo_roadmap",
  "estimate_package",
  "social_calendar_strategy",
  "social_calendar_assets",
  "social_calendar_conversation_revision",
] as const;

const EVERGREEN_STAGES = [
  "social_calendar_evergreen_strategy",
  "social_calendar_evergreen_assets",
  "social_calendar_evergreen_repair",
] as const;

const ROUTING_OVERRIDE_KEYS = [
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
] as const;

function withoutRoutingOverrides(run: () => void): void {
  const saved = ROUTING_OVERRIDE_KEYS.map(
    (key) => [key, process.env[key]] as const,
  );
  for (const key of ROUTING_OVERRIDE_KEYS) {
    delete process.env[key];
  }
  try {
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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

const blueprintOverride =
  process.env.OPENROUTER_STRATEGIC_BLUEPRINT_MODEL?.trim() || "";

withoutRoutingOverrides(() => {
  const analysisModel = resolveModelForStage("discussion_analysis").model;
  const premiumModel = resolveModelForStage("ad_campaign_strategy").model;
  const fallbackModel = resolveOpenRouterFallbackModel();

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

  if (fallbackModel === DEFAULT_PREMIUM_MODEL) {
    pass(`Fallback resolver default is ${DEFAULT_PREMIUM_MODEL}`);
  } else {
    fail(
      `Expected fallback default ${DEFAULT_PREMIUM_MODEL}, got ${fallbackModel}`,
    );
  }

  if (
    premiumModel === RETIRED_PREMIUM_MODEL ||
    fallbackModel === RETIRED_PREMIUM_MODEL
  ) {
    fail(
      `${RETIRED_PREMIUM_MODEL} must not be the built-in premium or fallback default`,
    );
  } else {
    pass("Retired Claude Sonnet 4 is not the built-in premium default");
  }

  if (
    resolveRoleForStage("discussion_analysis") === "analysis" &&
    resolveRoleForStage("ad_campaign_strategy") === "premiumStrategicOutput"
  ) {
    pass("Analysis and premium roles stay distinct");
  } else {
    fail("Analysis and premium roles must stay distinct");
  }

  for (const stage of PREMIUM_STAGES) {
    const route = resolveModelForStage(stage);
    if (route.role !== "premiumStrategicOutput") {
      fail(`${stage} must use premiumStrategicOutput role`);
    } else if (route.model !== DEFAULT_PREMIUM_MODEL) {
      fail(
        `${stage} must default to ${DEFAULT_PREMIUM_MODEL}, got ${route.model}`,
      );
    } else if (route.model === RETIRED_PREMIUM_MODEL) {
      fail(`${stage} resolved to retired ${RETIRED_PREMIUM_MODEL}`);
    } else {
      pass(`${stage} defaults to ${route.model}`);
    }
  }

  for (const stage of EVERGREEN_STAGES) {
    const route = resolveModelForStage(stage);
    if (route.role !== "premiumStrategicOutput") {
      fail(`${stage} must use premiumStrategicOutput role`);
    } else if (route.model !== EVERGREEN_SOCIAL_PLANNER_MODEL) {
      fail(
        `${stage} must use ${EVERGREEN_SOCIAL_PLANNER_MODEL}, got ${route.model}`,
      );
    } else {
      pass(`${stage} uses ${route.model}`);
    }
  }

  process.env.OPENROUTER_PREMIUM_MODEL = DEFAULT_PREMIUM_MODEL;
  process.env.OPENROUTER_MODEL = DEFAULT_PREMIUM_MODEL;
  for (const stage of EVERGREEN_STAGES) {
    const route = resolveModelForStage(stage);
    if (route.model !== EVERGREEN_SOCIAL_PLANNER_MODEL) {
      fail(`${stage} followed Gemini instead of ${EVERGREEN_SOCIAL_PLANNER_MODEL}`);
    }
  }
  if (
    resolveModelForStage("social_calendar_strategy").model ===
      DEFAULT_PREMIUM_MODEL &&
    resolveModelForStage("social_calendar_assets").model ===
      DEFAULT_PREMIUM_MODEL &&
    resolveModelForStage("discussion_analysis").model === DEFAULT_ANALYSIS_MODEL
  ) {
    pass("Evergreen Sonnet routing does not replace Daily or analysis models");
  } else {
    fail("Evergreen routing changed Daily Social Planner or analysis models");
  }
});

for (const stage of [...CORE_STAGES, ...ANALYSIS_EXTENDED_STAGES]) {
  const route = resolveModelForStage(stage);
  if (route.role === "analysis" && isClaudeModel(route.model)) {
    fail(`${stage} analysis role must not default to Claude outside env override`);
  }
}

{
  const route = resolveModelForStage("deployment_assets");
  if (route.role !== "analysis" || isClaudeModel(route.model)) {
    fail("deployment_assets must use analysis role (Gemini)");
  } else {
    pass(`deployment_assets analysis role defaults to Gemini (${route.model})`);
  }
}

{
  const route = resolveModelForStage("strategic_blueprint");
  const livePremiumModel = resolveModelForStage("ad_campaign_strategy").model;
  if (route.role !== "premiumStrategicOutput") {
    fail("strategic_blueprint must keep the premiumStrategicOutput role");
  } else if (blueprintOverride) {
    if (route.model !== blueprintOverride) {
      fail(
        `strategic_blueprint override expected ${blueprintOverride}, got ${route.model}`,
      );
    } else if (
      getLLMModelRoles().premiumStrategicOutput.model !== blueprintOverride &&
      livePremiumModel === blueprintOverride
    ) {
      fail("strategic_blueprint override leaked into ad_campaign_strategy");
    } else {
      pass(
        `strategic_blueprint uses OPENROUTER_STRATEGIC_BLUEPRINT_MODEL (${route.model})`,
      );
    }
  } else if (route.model !== livePremiumModel) {
    fail(
      `strategic_blueprint must follow shared premium routing (${livePremiumModel}), got ${route.model}`,
    );
  } else {
    pass(`strategic_blueprint follows shared premium routing (${route.model})`);
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

for (const stage of ADS_PREMIUM_EXTENDED_STAGES) {
  const route = resolveModelForStage(stage);
  if (route.role !== "premiumStrategicOutput") {
    fail(`${stage} must use premiumStrategicOutput role`);
  } else {
    pass(`${stage} routes to premiumStrategicOutput (${route.model})`);
  }
}

{
  const platform = resolveModelForStage("ad_platform_assets");
  const keywords = resolveModelForStage("ad_keyword_themes");
  if (platform.role === "analysis" && keywords.role === "analysis") {
    pass("Ads platform/keyword stages use analysis role");
  } else {
    fail("Ads platform/keyword stages must use analysis role");
  }
}

{
  const route = resolveModelForStage("seo_accompanying_email");
  const analysisRoute = resolveModelForStage("seo_section_analysis");
  if (route.role !== "analysis") {
    fail("seo_accompanying_email must use the analysis role");
  } else if (route.model !== analysisRoute.model) {
    fail(
      `seo_accompanying_email must follow the analysis model (${analysisRoute.model}), got ${route.model}`,
    );
  } else if (route.reasoningEffort !== analysisRoute.reasoningEffort) {
    fail("seo_accompanying_email must keep analysis reasoning effort");
  } else {
    pass(
      `seo_accompanying_email uses analysis role (${route.model}, reasoning ${route.reasoningEffort})`,
    );
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

if (
  modelRoutingSource.includes(
    `const DEFAULT_PREMIUM_MODEL = "${DEFAULT_PREMIUM_MODEL}"`,
  )
) {
  pass(`modelRouting.ts premium default is ${DEFAULT_PREMIUM_MODEL}`);
} else {
  fail(
    `modelRouting.ts premium default must be ${DEFAULT_PREMIUM_MODEL}`,
  );
}

if (
  modelRoutingSource.includes(
    `const DEFAULT_PREMIUM_MODEL = "${RETIRED_PREMIUM_MODEL}"`,
  )
) {
  fail(
    `modelRouting.ts still assigns retired ${RETIRED_PREMIUM_MODEL} as DEFAULT_PREMIUM_MODEL`,
  );
} else {
  pass("modelRouting.ts does not assign retired Claude Sonnet 4 as the premium default");
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
