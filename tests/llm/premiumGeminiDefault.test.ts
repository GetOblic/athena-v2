import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  resolveModelForGenerationKind,
  resolveModelForStage,
  resolveOpenRouterFallbackModel,
  type AthenaExtendedLLMStage,
} from "../../lib/llm/modelRouting";

const GEMINI_FLASH = "google/gemini-2.5-flash";
const RETIRED_PREMIUM_MODEL = "anthropic/claude-sonnet-4";
const EXPLICIT_PREMIUM_OVERRIDE = "anthropic/claude-sonnet-4";
const EXPLICIT_BLUEPRINT_OVERRIDE = "anthropic/claude-sonnet-4.6";
const EXPLICIT_FALLBACK_OVERRIDE = "openai/gpt-4.1";

const OVERRIDE_KEYS = [
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
] as const;

type OverrideKey = (typeof OVERRIDE_KEYS)[number];

const PREMIUM_STAGES: AthenaExtendedLLMStage[] = [
  "strategic_blueprint",
  "deployment_assets_think_differently",
  "ad_campaign_strategy",
  "seo_executive_assessment",
  "seo_roadmap",
  "estimate_package",
  "social_calendar_strategy",
  "social_calendar_assets",
  "social_calendar_conversation_revision",
];

const originalEnv = new Map<OverrideKey, string | undefined>();

function rememberEnv(): void {
  for (const key of OVERRIDE_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const key of OVERRIDE_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function useOverrides(
  values: Partial<Record<OverrideKey, string | undefined>>,
): void {
  restoreEnv();
  for (const key of OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      continue;
    }
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearOverrides(): void {
  useOverrides({
    OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: undefined,
    OPENROUTER_PREMIUM_MODEL: undefined,
    OPENROUTER_MODEL: undefined,
  });
}

describe("premium Gemini default", () => {
  before(() => {
    rememberEnv();
  });

  after(() => {
    restoreEnv();
  });

  it("resolves every premium stage and the fallback to Gemini when overrides are absent", () => {
    clearOverrides();

    assert.equal(resolveOpenRouterFallbackModel(), GEMINI_FLASH);
    assert.equal(
      resolveModelForGenerationKind("strategic_blueprint").model,
      GEMINI_FLASH,
    );

    for (const stage of PREMIUM_STAGES) {
      const route = resolveModelForStage(stage);
      assert.equal(route.role, "premiumStrategicOutput", stage);
      assert.equal(route.model, GEMINI_FLASH, stage);
      assert.notEqual(route.model, RETIRED_PREMIUM_MODEL, stage);
    }

    const analysis = resolveModelForStage("discussion_analysis");
    const deploymentAssets = resolveModelForStage("deployment_assets");
    assert.equal(analysis.role, "analysis");
    assert.equal(analysis.model, GEMINI_FLASH);
    assert.equal(deploymentAssets.role, "analysis");
    assert.equal(deploymentAssets.model, GEMINI_FLASH);
  });

  it("treats blank overrides as absent", () => {
    useOverrides({
      OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: "   ",
      OPENROUTER_PREMIUM_MODEL: "   ",
      OPENROUTER_MODEL: "   ",
    });

    assert.equal(resolveOpenRouterFallbackModel(), GEMINI_FLASH);
    for (const stage of PREMIUM_STAGES) {
      assert.equal(resolveModelForStage(stage).model, GEMINI_FLASH, stage);
    }
  });

  it("keeps OPENROUTER_MODEL ahead of the built-in premium default", () => {
    useOverrides({
      OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: undefined,
      OPENROUTER_PREMIUM_MODEL: undefined,
      OPENROUTER_MODEL: EXPLICIT_FALLBACK_OVERRIDE,
    });

    assert.equal(resolveOpenRouterFallbackModel(), EXPLICIT_FALLBACK_OVERRIDE);
    for (const stage of PREMIUM_STAGES) {
      assert.equal(
        resolveModelForStage(stage).model,
        EXPLICIT_FALLBACK_OVERRIDE,
        stage,
      );
    }
    assert.equal(
      resolveModelForStage("discussion_analysis").model,
      GEMINI_FLASH,
    );
  });

  it("keeps OPENROUTER_PREMIUM_MODEL ahead of OPENROUTER_MODEL for premium stages only", () => {
    useOverrides({
      OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: undefined,
      OPENROUTER_PREMIUM_MODEL: EXPLICIT_PREMIUM_OVERRIDE,
      OPENROUTER_MODEL: EXPLICIT_FALLBACK_OVERRIDE,
    });

    assert.equal(resolveOpenRouterFallbackModel(), EXPLICIT_FALLBACK_OVERRIDE);
    for (const stage of PREMIUM_STAGES) {
      assert.equal(
        resolveModelForStage(stage).model,
        EXPLICIT_PREMIUM_OVERRIDE,
        stage,
      );
    }
    assert.equal(
      resolveModelForStage("discussion_analysis").model,
      GEMINI_FLASH,
    );
    assert.equal(
      resolveModelForStage("ad_platform_assets").model,
      GEMINI_FLASH,
    );
  });

  it("keeps OPENROUTER_STRATEGIC_BLUEPRINT_MODEL local to strategic_blueprint", () => {
    useOverrides({
      OPENROUTER_STRATEGIC_BLUEPRINT_MODEL: EXPLICIT_BLUEPRINT_OVERRIDE,
      OPENROUTER_PREMIUM_MODEL: EXPLICIT_PREMIUM_OVERRIDE,
      OPENROUTER_MODEL: EXPLICIT_FALLBACK_OVERRIDE,
    });

    assert.equal(
      resolveModelForStage("strategic_blueprint").model,
      EXPLICIT_BLUEPRINT_OVERRIDE,
    );
    assert.equal(
      resolveModelForGenerationKind("strategic_blueprint").model,
      EXPLICIT_BLUEPRINT_OVERRIDE,
    );
    assert.equal(resolveOpenRouterFallbackModel(), EXPLICIT_FALLBACK_OVERRIDE);

    for (const stage of PREMIUM_STAGES) {
      if (stage === "strategic_blueprint") continue;
      assert.equal(
        resolveModelForStage(stage).model,
        EXPLICIT_PREMIUM_OVERRIDE,
        stage,
      );
      assert.notEqual(
        resolveModelForStage(stage).model,
        EXPLICIT_BLUEPRINT_OVERRIDE,
        stage,
      );
    }
  });

  it("does not assign retired Claude Sonnet 4 as the built-in premium default", () => {
    const routing = readFileSync(
      join(process.cwd(), "lib/llm/modelRouting.ts"),
      "utf8",
    );
    assert.match(
      routing,
      /const DEFAULT_PREMIUM_MODEL = "google\/gemini-2\.5-flash"/,
    );
    assert.doesNotMatch(
      routing,
      /const DEFAULT_PREMIUM_MODEL = "anthropic\/claude-sonnet-4"/,
    );

    clearOverrides();
    assert.notEqual(resolveOpenRouterFallbackModel(), RETIRED_PREMIUM_MODEL);
    for (const stage of PREMIUM_STAGES) {
      assert.notEqual(
        resolveModelForStage(stage).model,
        RETIRED_PREMIUM_MODEL,
        stage,
      );
    }
  });
});
