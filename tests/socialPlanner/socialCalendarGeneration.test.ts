import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import { SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION } from "../../services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import { SOCIAL_PLANNER_ASSET_PROMPT_VERSION } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SOCIAL_PLANNER_REPAIR_PROMPT_VERSION } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  generateSocialCalendarPackage,
  parseSocialPlannerStructuredOutput,
} from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import { validateSocialPlannerIntelligence } from "../../services/socialPlanner/intelligence/validateSocialPlannerIntelligence";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
} from "./socialPlannerGenerationFixtures";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function scriptedReview(replies: string[]) {
  const prompts: string[] = [];
  const metas: Array<GenerateReviewOptions | undefined> = [];
  let index = 0;
  return {
    prompts,
    metas,
    generateReview: async (prompt: string, meta?: GenerateReviewOptions) => {
      prompts.push(prompt);
      metas.push(meta);
      const reply = replies[index];
      index += 1;
      if (reply == null) {
        throw new Error("Unexpected extra generateReview call");
      }
      return reply;
    },
  };
}

describe("Social Planner L4 generation pipeline", () => {
  it("accepts a trusted L3 context fixture", () => {
    const context = validateSocialPlannerIntelligence(buildGenerationContext());
    assert.equal(context.organization.id, "org-social-planner");
  });

  it("returns a validated seven-date package from structured provider JSON", async () => {
    const context = buildGenerationContext();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    const result = await generateSocialCalendarPackage({
      context,
      userGuidance: null,
      generationMode: "standard",
      deps: { generateReview: script.generateReview },
    });

    assert.equal(result.package.schemaVersion, SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION);
    assert.equal(result.package.assets.length, 7);
    assert.deepEqual(
      result.package.assets.map((asset) => asset.date),
      context.calendarContext.period.dates,
    );
    assert.deepEqual(
      result.package.assets.map((asset) => asset.date),
      [...result.package.assets.map((asset) => asset.date)].sort(),
    );
    assert.equal(result.generationProvenance.repairUsed, false);
    assert.equal(
      result.generationProvenance.strategyPromptVersion,
      SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION,
    );
    assert.equal(
      result.generationProvenance.assetPromptVersion,
      SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
    );
    assert.equal(result.generationProvenance.provider, "openrouter");
    assert.ok(
      result.generationProvenance.stages.some(
        (stage) => stage.athenaStage === "social_calendar_strategy",
      ),
    );
  });

  it("parses fenced structured provider responses", () => {
    const parsed = parseSocialPlannerStructuredOutput(
      "```json\n{\"ok\":true,\"note\":\"fenced\"}\n```",
      "assets",
    );
    assert.deepEqual(parsed, { ok: true, note: "fenced" });
  });

  it("throws a typed failure for malformed structured output", async () => {
    const context = buildGenerationContext();
    const script = scriptedReview(["not-json{{{"]);
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          userGuidance: null,
          generationMode: "standard",
          deps: { generateReview: script.generateReview },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "MALFORMED_STRUCTURED_OUTPUT");
        return true;
      },
    );
  });

  it("throws a typed provider failure", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          userGuidance: null,
          generationMode: "standard",
          deps: {
            generateReview: async () => {
              throw new Error("OpenRouter API error: 503 unavailable");
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "PROVIDER_FAILURE");
        return true;
      },
    );
  });

  it("repairs one failed package and then stops", async () => {
    const context = buildGenerationContext();
    const invalid = buildValidPackageRaw(context, {
      0: { hook: "Did you know...?" },
      1: { hook: "Did you know...?" },
    });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(invalid),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    const result = await generateSocialCalendarPackage({
      context,
      userGuidance: "Make the week educational",
      generationMode: "standard",
      deps: { generateReview: script.generateReview },
    });

    assert.equal(result.generationProvenance.repairUsed, true);
    assert.equal(
      result.generationProvenance.repairPromptVersion,
      SOCIAL_PLANNER_REPAIR_PROMPT_VERSION,
    );
    assert.equal(script.prompts.length, 3);
    assert.match(script.prompts[2], /Duplicate normalized hook|Fix only these failures/i);
  });

  it("throws REPAIR_VALIDATION_FAILED after one unsuccessful repair", async () => {
    const context = buildGenerationContext();
    const invalid = buildValidPackageRaw(context, {
      0: { hook: "Same hook" },
      1: { hook: "Same hook" },
    });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(invalid),
      JSON.stringify(invalid),
    ]);

    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          userGuidance: null,
          generationMode: "standard",
          deps: { generateReview: script.generateReview },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "REPAIR_VALIDATION_FAILED");
        return true;
      },
    );
    assert.equal(script.prompts.length, 3);
  });

  it("rejects unsupported generation modes before any provider call", async () => {
    const context = buildGenerationContext();
    let called = false;
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          generationMode: "think_differently",
          deps: {
            generateReview: async () => {
              called = true;
              return "{}";
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );
    assert.equal(called, false);

    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          generationMode: "conversation_revision",
          deps: { generateReview: async () => "{}" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );
  });

  it("injects configured Trend Social as a bounded instruction and records the revision", async () => {
    const context = buildGenerationContext({ trendConfigured: true });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: { generateReview: script.generateReview },
    });
    assert.match(script.prompts[0], /BEGIN_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION/);
    assert.match(script.prompts[0], /Prefer native short-form hooks/);
    assert.match(script.prompts[0], /must not:[\s\S]*create calendar events/);
    assert.equal(result.generationProvenance.trendSocialPrompt.revisionId, "trend-rev-1");
    assert.equal(result.generationProvenance.trendSocialPrompt.configured, true);
  });

  it("continues when Trend Social is unconfigured without inventing policy", async () => {
    const context = buildGenerationContext({ trendConfigured: false });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: { generateReview: script.generateReview },
    });
    assert.match(script.prompts[0], /TREND SOCIAL PROMPT \(UNCONFIGURED\)/);
    assert.doesNotMatch(script.prompts[0], /BEGIN_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION/);
    assert.equal(result.generationProvenance.trendSocialPrompt.configured, false);
    assert.equal(result.package.assets.length, 7);
  });

  it("treats blank user guidance as Athena-led and passes supplied guidance into prompts", async () => {
    const context = buildGenerationContext();
    const blank = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    await generateSocialCalendarPackage({
      context,
      userGuidance: "   ",
      generationMode: "standard",
      deps: { generateReview: blank.generateReview },
    });
    assert.match(blank.prompts[0], /BEGIN_USER_GUIDANCE/);
    assert.match(blank.prompts[0], /\(blank\)/);

    const guided = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    await generateSocialCalendarPackage({
      context,
      userGuidance: "Focus on our new laser treatment",
      generationMode: "standard",
      deps: { generateReview: guided.generateReview },
    });
    assert.match(guided.prompts[0], /Focus on our new laser treatment/);
    assert.match(guided.prompts[1], /Focus on our new laser treatment/);
    assert.match(guided.prompts[0], /BUSINESS CONTEXT \/ DATA/);
  });

  it("does not persist calendars or query historical Social Planner rows", () => {
    const service = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    assert.doesNotMatch(service, /athena_social_calendars/);
    assert.doesNotMatch(service, /\.from\(/);
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upsert\(/);
    assert.doesNotMatch(service, /claim_athena_social_calendar/);
    assert.match(service, /generateReview/);
    assert.match(service, /athenaStage: STRATEGY_STAGE/);
    assert.match(service, /social_calendar_strategy/);
  });

  it("routes through additive OpenRouter stages without changing existing mappings", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /social_calendar_strategy: "premiumStrategicOutput"/);
    assert.match(routing, /social_calendar_assets: "premiumStrategicOutput"/);
    assert.match(routing, /social_calendar_repair: "analysis"/);
    assert.match(routing, /social_calendar_diversity_repair: "analysis"/);
    assert.match(routing, /estimate_package: "premiumStrategicOutput"/);
    assert.match(routing, /ad_campaign_strategy: "premiumStrategicOutput"/);
    assert.match(routing, /discussion_analysis/);
  });

  it("injects optional Social Memory text without querying history", async () => {
    const context = buildGenerationContext();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    await generateSocialCalendarPackage({
      context,
      generationMode: "standard",
      socialMemoryText: "=== RECENT SOCIAL MEMORY — DO NOT REPEAT ===\nAvoid exact hook three quiet signs",
      deps: { generateReview: script.generateReview },
    });
    assert.match(script.prompts[0], /RECENT SOCIAL MEMORY — DO NOT REPEAT/);
    assert.match(script.prompts[1], /RECENT SOCIAL MEMORY — DO NOT REPEAT/);
    const service = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    assert.doesNotMatch(service, /athena_social_calendars/);
    assert.doesNotMatch(service, /\.from\(/);
  });
});
