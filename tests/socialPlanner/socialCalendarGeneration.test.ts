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
import {
  buildSocialPlannerAssetPrompt,
  buildSocialPlannerPackageOutputContract,
  buildSocialPlannerRepairPrompt,
} from "../../services/socialPlanner/generation/socialPlannerGenerationPrompts";
import { validateAndNormalizeSocialCalendarPackage } from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import { testMetadata } from "./socialPlannerGenerationFixtures";
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
    assert.match(script.prompts[2], /Duplicate normalized hook/i);
    assert.match(script.prompts[2], /COMPLETE corrected weekly Social Calendar package/i);
    assert.match(script.prompts[2], /visualDirection/);
    assert.match(script.prompts[2], /shotPlan/);
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

  it("generation and repair prompts share the complete productionSpec contract", () => {
    const context = buildGenerationContext();
    const contract = buildSocialPlannerPackageOutputContract();
    const assetPrompt = buildSocialPlannerAssetPrompt({
      context,
      userGuidance: null,
      strategy: buildValidStrategyRaw(context) as never,
    });
    const repairPrompt = buildSocialPlannerRepairPrompt({
      context,
      userGuidance: null,
      strategy: buildValidStrategyRaw(context) as never,
      invalidPackage: { schemaVersion: "social_calendar_package_v1" },
      failures: ["assets[0].productionSpec.slides must be an array."],
    });

    assert.ok(contract.includes('"kind": "static"'));
    assert.ok(contract.includes('"kind": "carousel"'));
    assert.ok(contract.includes("visualDirection"));
    assert.ok(contract.includes("slides MUST be an array of 3-8"));
    assert.ok(contract.includes("shotPlan MUST be an array of 2-8"));
    assert.ok(contract.includes("sections MUST be an array of 2-8"));
    assert.ok(contract.includes("options are REQUIRED only for poll and quiz"));
    assert.ok(contract.includes('Never emit kind "image"'));
    assert.ok(contract.includes("cta is REQUIRED when primaryObjective is convert or promote"));
    assert.ok(contract.includes("whyThisWeekWorks 80-700 chars AND 2-4 concise sentences"));
    assert.ok(contract.includes("calendarReason MUST be null or omitted when calendarAnchors is empty"));
    assert.ok(assetPrompt.includes(contract));
    assert.ok(repairPrompt.includes(contract));
    assert.match(repairPrompt, /COMPLETE corrected weekly Social Calendar package/i);
    assert.match(repairPrompt, /entire corrected package, not a patch/i);
    assert.match(repairPrompt, /All seven assets must remain present/i);
  });

  it("repairs a production-shaped carousel contract failure into a valid package", async () => {
    const context = buildGenerationContext();
    const invalid = buildValidPackageRaw(context, {
      0: {
        productionSpec: {
          kind: "carousel",
          visualDirection: "Warm clinic photography",
          designPrompt: "Soft daylight carousel",
        } as never,
      },
    });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(invalid),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    const result = await generateSocialCalendarPackage({
      context,
      userGuidance: null,
      generationMode: "standard",
      deps: { generateReview: script.generateReview },
    });

    assert.equal(result.generationProvenance.repairUsed, true);
    assert.equal(result.package.assets.length, 7);
    assert.equal(result.package.assets[0].productionSpec.kind, "carousel");
    assert.match(script.prompts[2], /slides must be an array/i);
    assert.ok(script.prompts[2].includes(buildSocialPlannerPackageOutputContract()));
    const validated = validateAndNormalizeSocialCalendarPackage({
      raw: result.package as unknown as Record<string, unknown>,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.equal(validated.assets.length, 7);
  });

  it("throws REPAIR_VALIDATION_FAILED when repair still omits carousel slides", async () => {
    const context = buildGenerationContext();
    const invalid = buildValidPackageRaw(context, {
      0: {
        productionSpec: {
          kind: "carousel",
          designPrompt: "Soft daylight carousel",
        } as never,
      },
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
        assert.equal(error.stage, "repair_validation");
        assert.ok(
          error.failures.some((failure) =>
            /productionSpec\.slides must be an array|visualDirection is required/i.test(
              failure,
            ),
          ),
        );
        return true;
      },
    );
    assert.equal(script.prompts.length, 3);
  });
});
