import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  EVERGREEN_SOCIAL_PLANNER_MODEL,
  getLLMModelRoles,
  openRouterModelAcceptsTemperature,
  resolveModelForStage,
  type AthenaExtendedLLMStage,
} from "../../lib/llm/modelRouting";
import { isReasoningSupportedByModel } from "../../lib/reasoningProfiles";
import { generateReview } from "../../services/aiService";

const GEMINI = "google/gemini-2.5-flash";
const OTHER_PREMIUM = "anthropic/claude-sonnet-4";
const COMPLETION_URL = "https://openrouter.ai/api/v1/chat/completions";

const EVERGREEN_STAGES = [
  "social_calendar_evergreen_strategy",
  "social_calendar_evergreen_assets",
  "social_calendar_evergreen_repair",
] as const satisfies readonly AthenaExtendedLLMStage[];

const DAILY_STAGES = [
  "social_calendar_strategy",
  "social_calendar_assets",
  "social_calendar_repair",
] as const satisfies readonly AthenaExtendedLLMStage[];

const TRACKED_ENV = [
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
  "OPENROUTER_ANALYSIS_MODEL",
  "OPENROUTER_PREMIUM_REASONING_EFFORT",
  "OPENROUTER_ANALYSIS_REASONING_EFFORT",
  "OPENROUTER_REASONING_ENABLED",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MAX_TOKENS",
] as const;

type TrackedEnv = (typeof TRACKED_ENV)[number];

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

function useGeminiPremium(): void {
  restoreEnv();
  process.env.OPENROUTER_STRATEGIC_BLUEPRINT_MODEL = OTHER_PREMIUM;
  process.env.OPENROUTER_PREMIUM_MODEL = GEMINI;
  process.env.OPENROUTER_MODEL = GEMINI;
  process.env.OPENROUTER_ANALYSIS_MODEL = GEMINI;
  process.env.OPENROUTER_PREMIUM_REASONING_EFFORT = "high";
  process.env.OPENROUTER_ANALYSIS_REASONING_EFFORT = "medium";
  delete process.env.OPENROUTER_REASONING_ENABLED;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.OPENROUTER_MAX_TOKENS;
}

describe("Evergreen Claude Sonnet 5.5 routing", () => {
  before(() => {
    rememberEnv();
  });

  after(() => {
    restoreEnv();
  });

  it("selects Claude Sonnet 5.5 for Evergreen strategy, assets, and repair", () => {
    useGeminiPremium();

    for (const stage of EVERGREEN_STAGES) {
      const route = resolveModelForStage(stage);
      assert.equal(route.model, EVERGREEN_SOCIAL_PLANNER_MODEL, stage);
      assert.equal(route.model, "anthropic/claude-sonnet-5.5", stage);
      assert.equal(route.role, "premiumStrategicOutput", stage);
      assert.equal(route.reasoningEffort, "high", stage);
      assert.notEqual(route.model, GEMINI, stage);
    }

    assert.equal(getLLMModelRoles().premiumStrategicOutput.model, GEMINI);
    assert.equal(getLLMModelRoles().analysis.model, GEMINI);
    assert.equal(isReasoningSupportedByModel(EVERGREEN_SOCIAL_PLANNER_MODEL), true);
    assert.equal(openRouterModelAcceptsTemperature(EVERGREEN_SOCIAL_PLANNER_MODEL), false);
    assert.equal(openRouterModelAcceptsTemperature(GEMINI), true);
  });

  it("leaves Daily Social Planner and other premium stages on Gemini", () => {
    useGeminiPremium();

    assert.equal(resolveModelForStage("social_calendar_strategy").model, GEMINI);
    assert.equal(resolveModelForStage("social_calendar_assets").model, GEMINI);
    assert.equal(resolveModelForStage("social_calendar_repair").model, GEMINI);
    assert.equal(resolveModelForStage("social_calendar_repair").role, "analysis");
    assert.equal(resolveModelForStage("ad_campaign_strategy").model, GEMINI);
    assert.equal(resolveModelForStage("strategic_blueprint").model, OTHER_PREMIUM);
    assert.equal(resolveModelForStage("discussion_analysis").model, GEMINI);
    assert.equal(resolveModelForStage("deployment_assets").model, GEMINI);

    for (const stage of DAILY_STAGES) {
      assert.notEqual(resolveModelForStage(stage).model, EVERGREEN_SOCIAL_PLANNER_MODEL);
    }
  });

  it("sends Sonnet 5.5 for both Evergreen calls and does not fall back to Gemini", async () => {
    useGeminiPremium();
    const captured: Array<Record<string, unknown>> = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      assert.equal(String(input), COMPLETION_URL);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      await generateReview("plan the week", {
        athenaStage: "social_calendar_evergreen_strategy",
        reasoningProfile: "EXECUTIVE",
        stage: "socialPlanner.evergreen.strategy",
      });
      await generateReview("write the seven drafts", {
        athenaStage: "social_calendar_evergreen_assets",
        reasoningProfile: "EXECUTIVE",
        stage: "socialPlanner.evergreen.assets",
      });
      await generateReview("repair the package", {
        athenaStage: "social_calendar_evergreen_repair",
        reasoningProfile: "BALANCED",
        stage: "socialPlanner.evergreen.repair",
      });
      await generateReview("daily strategy", {
        athenaStage: "social_calendar_strategy",
        reasoningProfile: "EXECUTIVE",
        stage: "socialPlanner.daily.strategy",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    assert.equal(captured.length, 4);
    for (const body of captured.slice(0, 3)) {
      assert.equal(body.model, "anthropic/claude-sonnet-5.5");
      assert.equal(body.max_tokens, 64000);
      assert.equal("temperature" in body, false);
      assert.notEqual(body.model, GEMINI);
    }
    assert.deepEqual(captured[0]?.reasoning, { effort: "high" });
    assert.deepEqual(captured[1]?.reasoning, { effort: "high" });
    assert.deepEqual(captured[2]?.reasoning, { effort: "medium" });
    assert.equal(captured[3]?.model, GEMINI);
    assert.equal(captured[3]?.temperature, 0.2);
    assert.equal("reasoning" in (captured[3] ?? {}), false);
  });
});
