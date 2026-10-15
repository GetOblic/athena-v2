import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  getLLMModelRoles,
  resolveModelForGenerationKind,
  resolveModelForStage,
  THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE,
  type AthenaExtendedLLMStage,
} from "../../lib/llm/modelRouting";
import {
  getReasoningProfile,
  getReasoningProfileForGeneration,
  isReasoningSupportedByModel,
  type ReasoningProfileType,
} from "../../lib/reasoningProfiles";
import { generateReview } from "../../services/aiService";

const PREMIUM_MODEL = "anthropic/claude-sonnet-4";
const SONNET_46_MODEL = "anthropic/claude-sonnet-4.6";
const FALLBACK_MODEL = "openai/gpt-4.1";
const ANALYSIS_MODEL = "google/gemini-2.5-flash";

const TRACKED_ENV = [
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
  "OPENROUTER_PREMIUM_REASONING_EFFORT",
  "OPENROUTER_ANALYSIS_MODEL",
  "OPENROUTER_ANALYSIS_REASONING_EFFORT",
  "OPENROUTER_REASONING_ENABLED",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MAX_TOKENS",
] as const;

type TrackedEnv = (typeof TRACKED_ENV)[number];

const ISOLATED_PREMIUM_STAGES: AthenaExtendedLLMStage[] = [
  "ad_campaign_strategy",
  "seo_executive_assessment",
  "seo_roadmap",
  "estimate_package",
  "social_calendar_strategy",
  "social_calendar_assets",
  "social_calendar_conversation_revision",
  THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE,
];

const originalEnv = new Map<TrackedEnv, string | undefined>();

function rememberEnv(): void {
  for (const key of TRACKED_ENV) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const key of TRACKED_ENV) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function useRoutingEnv(
  values: Partial<Record<TrackedEnv, string | undefined>>,
): void {
  restoreEnv();
  for (const [key, value] of Object.entries(values) as Array<
    [TrackedEnv, string | undefined]
  >) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function usePremiumRouting(override?: string): void {
  useRoutingEnv({
    OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: override,
    OPENROUTER_PREMIUM_MODEL: PREMIUM_MODEL,
    OPENROUTER_MODEL: FALLBACK_MODEL,
    OPENROUTER_ANALYSIS_MODEL: ANALYSIS_MODEL,
    OPENROUTER_PREMIUM_REASONING_EFFORT: "high",
    OPENROUTER_ANALYSIS_REASONING_EFFORT: "medium",
    OPENROUTER_REASONING_ENABLED: undefined,
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MAX_TOKENS: undefined,
  });
}

const COMPLETION_URL = "https://openrouter.ai/api/v1/chat/completions";

type CapturedCompletion = {
  url: string;
  body: Record<string, unknown>;
};

function completionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function captureCompletions(
  run: () => Promise<void>,
): Promise<CapturedCompletion[]> {
  const captured: CapturedCompletion[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    captured.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return completionResponse("ok");
  };
  try {
    await run();
    return captured;
  } finally {
    globalThis.fetch = previousFetch;
  }
}

describe("strategic blueprint Sonnet 4.6 stage override", () => {
  before(() => {
    rememberEnv();
  });

  after(() => {
    restoreEnv();
  });

  it("uses OPENROUTER_STRATEGIC_BLUEPRINT_MODEL for strategic_blueprint only", () => {
    usePremiumRouting(SONNET_46_MODEL);

    const route = resolveModelForStage("strategic_blueprint");
    const byKind = resolveModelForGenerationKind("strategic_blueprint");

    assert.equal(route.stage, "strategic_blueprint");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.equal(route.model, SONNET_46_MODEL);
    assert.equal(route.reasoningEffort, "high");
    assert.equal(byKind.model, SONNET_46_MODEL);
    assert.equal(byKind.role, "premiumStrategicOutput");
    assert.equal(byKind.reasoningEffort, "high");
    assert.equal(
      getLLMModelRoles().premiumStrategicOutput.model,
      PREMIUM_MODEL,
    );
    assert.equal(
      getLLMModelRoles().premiumStrategicOutput.reasoningEffort,
      "high",
    );
  });

  it("falls back to premium routing when the variable is absent or blank", () => {
    usePremiumRouting(undefined);
    const absent = resolveModelForStage("strategic_blueprint");
    assert.equal(absent.role, "premiumStrategicOutput");
    assert.equal(absent.model, PREMIUM_MODEL);
    assert.equal(absent.reasoningEffort, "high");

    usePremiumRouting("   ");
    assert.equal(
      resolveModelForStage("strategic_blueprint").model,
      PREMIUM_MODEL,
    );
  });

  it("falls back through OPENROUTER_MODEL when the premium variable is also absent", () => {
    useRoutingEnv({
      OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: undefined,
      OPENROUTER_PREMIUM_MODEL: undefined,
      OPENROUTER_MODEL: FALLBACK_MODEL,
      OPENROUTER_ANALYSIS_MODEL: ANALYSIS_MODEL,
      OPENROUTER_PREMIUM_REASONING_EFFORT: undefined,
      OPENROUTER_ANALYSIS_REASONING_EFFORT: undefined,
      OPENROUTER_REASONING_ENABLED: undefined,
    });

    assert.equal(
      resolveModelForStage("strategic_blueprint").model,
      FALLBACK_MODEL,
    );
    assert.equal(
      resolveModelForStage("ad_campaign_strategy").model,
      FALLBACK_MODEL,
    );
  });

  it("does not change Ads, SEO, Estimates, Social, or Think Differently routing", () => {
    usePremiumRouting(SONNET_46_MODEL);

    for (const stage of ISOLATED_PREMIUM_STAGES) {
      const route = resolveModelForStage(stage);
      assert.equal(route.role, "premiumStrategicOutput", stage);
      assert.equal(route.model, PREMIUM_MODEL, stage);
      assert.equal(route.reasoningEffort, "high", stage);
      assert.notEqual(route.model, SONNET_46_MODEL, stage);
    }

    const analysis = resolveModelForStage("discussion_analysis");
    const deploymentAssets = resolveModelForStage("deployment_assets");
    assert.equal(analysis.role, "analysis");
    assert.equal(analysis.model, ANALYSIS_MODEL);
    assert.equal(deploymentAssets.role, "analysis");
    assert.equal(deploymentAssets.model, ANALYSIS_MODEL);
  });

  it("reads the override once, inside resolveModelForStage only", () => {
    const routing = readFileSync(
      join(process.cwd(), "lib/llm/modelRouting.ts"),
      "utf8",
    );
    const fallbackBody = routing.slice(
      routing.indexOf("export function resolveOpenRouterFallbackModel"),
      routing.indexOf("export function getLLMModelRoles"),
    );
    const rolesBody = routing.slice(
      routing.indexOf("export function getLLMModelRoles"),
      routing.indexOf("export function getLLMStageRoutes"),
    );
    const resolveBody = routing.slice(
      routing.indexOf("export function resolveModelForStage"),
      routing.indexOf("export function resolveModelForGenerationKind"),
    );
    assert.match(fallbackBody, /OPENROUTER_MODEL/);
    assert.doesNotMatch(fallbackBody, /OPENROUTER_STRATEGIC_BLUEPRINT_MODEL/);
    assert.match(rolesBody, /OPENROUTER_PREMIUM_MODEL/);
    assert.doesNotMatch(rolesBody, /OPENROUTER_STRATEGIC_BLUEPRINT_MODEL/);
    assert.match(routing, /strategic_blueprint: roles\.premiumStrategicOutput/);
    assert.match(resolveBody, /OPENROUTER_STRATEGIC_BLUEPRINT_MODEL/);
    assert.equal(
      routing.split("OPENROUTER_STRATEGIC_BLUEPRINT_MODEL").length - 1,
      1,
    );

    const consumers = [
      "services/ads/adsGenerationPipeline.ts",
      "services/seo/seoGenerationPipeline.ts",
      "services/estimate/estimateGenerationPipeline.ts",
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
      "services/workflows/deploymentAssetsWorkflow.ts",
      "services/workflows/thinkDifferentlyWorkflow.ts",
      "services/assetBlueprints/assetBlueprintService.ts",
      "lib/reasoningProfiles.ts",
      "lib/openrouter.ts",
    ];
    for (const relativePath of consumers) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      assert.doesNotMatch(
        source,
        /OPENROUTER_STRATEGIC_BLUEPRINT_MODEL/,
        relativePath,
      );
    }
  });

  it("keeps the existing STRATEGIC profile for Sonnet 4.6", () => {
    const reasoning = readFileSync(
      join(process.cwd(), "lib/reasoningProfiles.ts"),
      "utf8",
    );
    assert.equal(getReasoningProfileForGeneration("strategic_blueprint"), "STRATEGIC");
    assert.deepEqual(getReasoningProfile("STRATEGIC"), {
      reasoning: { effort: "xhigh" },
    });
    assert.equal(isReasoningSupportedByModel(SONNET_46_MODEL), true);
    assert.equal(isReasoningSupportedByModel(PREMIUM_MODEL), true);
    assert.doesNotMatch(reasoning, /HAIKU_45|GPT_OSS_120B|resolveOutgoingReasoningPayload/);
  });

  it("sends reasoning.effort xhigh when Strategic Blueprint uses Sonnet 4.6", async () => {
    usePremiumRouting(SONNET_46_MODEL);
    const prompt = "Select one strategic asset and specify its production prompts.";

    const captured = await captureCompletions(async () => {
      const content = await generateReview(prompt, {
        generationKind: "strategic_blueprint",
        athenaStage: "strategic_blueprint",
        stage: "strategic_blueprint.quality_gate.attempt_1",
      });
      assert.equal(content, "ok");
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, COMPLETION_URL);
    assert.equal(captured[0].body.model, SONNET_46_MODEL);
    assert.equal(captured[0].body.max_tokens, 64000);
    assert.equal(captured[0].body.temperature, 0.2);
    assert.deepEqual(captured[0].body.reasoning, { effort: "xhigh" });
    const messages = captured[0].body.messages as Array<{
      role: string;
      content: string;
    }>;
    assert.equal(messages[1]?.role, "user");
    assert.equal(messages[1]?.content, prompt);
  });

  it("keeps existing reasoning on other stages while Blueprint uses Sonnet 4.6", async () => {
    usePremiumRouting(SONNET_46_MODEL);

    const cases: Array<{
      stage: AthenaExtendedLLMStage;
      profile: ReasoningProfileType;
      model: string;
      reasoning: { effort: "xhigh" | "high" } | null;
    }> = [
      {
        stage: "ad_campaign_strategy",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: "seo_executive_assessment",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: "seo_roadmap",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: "estimate_package",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: "social_calendar_strategy",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: "social_calendar_assets",
        profile: "EXECUTIVE",
        model: PREMIUM_MODEL,
        reasoning: { effort: "high" },
      },
      {
        stage: THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_STAGE,
        profile: "STRATEGIC",
        model: PREMIUM_MODEL,
        reasoning: { effort: "xhigh" },
      },
      {
        stage: "discussion_analysis",
        profile: "EXECUTIVE",
        model: ANALYSIS_MODEL,
        reasoning: null,
      },
      {
        stage: "deployment_assets",
        profile: "EXECUTIVE",
        model: ANALYSIS_MODEL,
        reasoning: null,
      },
    ];

    for (const entry of cases) {
      const captured = await captureCompletions(() =>
        generateReview(`${entry.stage} prompt`, {
          athenaStage: entry.stage,
          reasoningProfile: entry.profile,
          stage: entry.stage,
        }).then(() => undefined),
      );
      assert.equal(captured.length, 1, entry.stage);
      assert.equal(captured[0].body.model, entry.model, entry.stage);
      assert.equal(captured[0].body.max_tokens, 64000, entry.stage);
      assert.equal(captured[0].body.temperature, 0.2, entry.stage);
      if (entry.reasoning) {
        assert.deepEqual(captured[0].body.reasoning, entry.reasoning, entry.stage);
      } else {
        assert.equal("reasoning" in captured[0].body, false, entry.stage);
      }
      assert.notEqual(captured[0].body.model, SONNET_46_MODEL, entry.stage);
    }
  });
});
