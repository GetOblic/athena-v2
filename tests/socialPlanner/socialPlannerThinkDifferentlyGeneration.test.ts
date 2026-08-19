import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import { generateThinkDifferentlySocialCalendar } from "../../services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar";
import { generateSocialCalendarPackage } from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import { generateHistoricallyDiverseSocialCalendar } from "../../services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import {
  SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
  SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
} from "../../services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import { buildSourceNegativeContext } from "../../services/socialPlanner/thinkDifferently/socialPlannerSourceDivergence";
import type { SocialPlannerHistoryLoader } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  TEST_ORG,
  buildAlternatePackageRaw,
  buildGenerationContext,
  buildHistoryRow,
  buildValidatedPackage,
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

function emptyLoader(): SocialPlannerHistoryLoader {
  return {
    async listReadyCalendars() {
      return [];
    },
  };
}

describe("Social Planner L8 Think Differently generation", () => {
  it("accepts the first divergent generation without an L8 repair", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);
    const result = await generateThinkDifferentlySocialCalendar({
      context,
      userGuidance: "Focus this week on our new laser treatment.",
      sourceCalendar: {
        id: "source-1",
        root_calendar_id: null,
        version_number: 1,
      },
      sourcePackage: source,
      derivativeVersionNumber: 2,
      deps: {
        generateReview: script.generateReview,
        historyLoader: emptyLoader(),
      },
    });

    assert.equal(result.sourceDivergence.accepted, true);
    assert.equal(result.sourceDivergenceRepairUsed, false);
    assert.equal(result.generationProvenance.generationMode, "think_differently");
    assert.equal(
      result.generationProvenance.thinkDifferentlyPromptVersion,
      SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
    );
    assert.equal(
      result.generationProvenance.sourceDivergenceAlgorithmVersion,
      SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
    );
    assert.equal(result.generationProvenance.sourceCalendarId, "source-1");
    assert.equal(result.generationProvenance.rootCalendarId, "source-1");
    assert.equal(result.generationProvenance.newVersionNumber, 2);
    assert.equal(script.prompts.length, 2);
    assert.equal(
      script.metas.some(
        (meta) => meta?.athenaStage === "social_calendar_think_differently_repair",
      ),
      false,
    );
    assert.match(script.prompts[0], /THINK DIFFERENTLY/);
    assert.match(script.prompts[0], /WHAT NOT TO REPEAT/);
    assert.match(script.prompts[0], /Focus this week on our new laser treatment/);
    assert.doesNotMatch(script.prompts[0], /sourceSignals/);
  });

  it("repairs once when the first result is too similar to the source", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);
    const result = await generateThinkDifferentlySocialCalendar({
      context,
      userGuidance: null,
      sourceCalendar: {
        id: "source-1",
        root_calendar_id: "source-1",
        version_number: 1,
      },
      sourcePackage: source,
      derivativeVersionNumber: 2,
      deps: {
        generateReview: script.generateReview,
        historyLoader: emptyLoader(),
      },
    });

    assert.equal(result.sourceDivergenceRepairUsed, true);
    assert.equal(result.sourceDivergence.accepted, true);
    assert.equal(script.prompts.length, 3);
    assert.equal(
      script.metas[2]?.athenaStage,
      "social_calendar_think_differently_repair",
    );
    assert.match(script.prompts[2], /DIVERGENCE VIOLATIONS/);
  });

  it("fails permanently when the one L8 repair is still too similar", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    await assert.rejects(
      () =>
        generateThinkDifferentlySocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar: {
            id: "source-1",
            root_calendar_id: null,
            version_number: 1,
          },
          sourcePackage: source,
          derivativeVersionNumber: 2,
          deps: {
            generateReview: script.generateReview,
            historyLoader: emptyLoader(),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "THINK_DIFFERENTLY_DIVERGENCE_FAILED");
        assert.equal(error.retryable, false);
        return true;
      },
    );
    assert.equal(script.prompts.length, 3);
  });

  it("rejects an L8 repair that breaks the L4 package", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify({ schemaVersion: "social_calendar_package_v1", assets: [] }),
    ]);

    await assert.rejects(
      () =>
        generateThinkDifferentlySocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar: {
            id: "source-1",
            root_calendar_id: null,
            version_number: 1,
          },
          sourcePackage: source,
          derivativeVersionNumber: 2,
          deps: {
            generateReview: script.generateReview,
            historyLoader: emptyLoader(),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "THINK_DIFFERENTLY_REPAIR_FAILED");
        return true;
      },
    );
  });

  it("rejects an L8 repair that breaks L5 historical diversity", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const historical = buildValidatedPackage(
      context,
      buildAlternatePackageRaw(context),
    );
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);

    await assert.rejects(
      () =>
        generateThinkDifferentlySocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar: {
            id: "source-1",
            root_calendar_id: null,
            version_number: 1,
          },
          sourcePackage: source,
          derivativeVersionNumber: 2,
          deps: {
            generateReview: script.generateReview,
            historyLoader: {
              async listReadyCalendars() {
                return [
                  buildHistoryRow({
                    id: "hist-alt",
                    createdAt: "2026-05-01T10:00:00.000Z",
                    socialPackage: historical,
                  }),
                ];
              },
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "THINK_DIFFERENTLY_REPAIR_FAILED");
        return true;
      },
    );
  });

  it("keeps the source in L5 Social Memory and still applies L8 divergence", async () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);
    const result = await generateThinkDifferentlySocialCalendar({
      context,
      userGuidance: null,
      sourceCalendar: {
        id: "source-ready",
        root_calendar_id: null,
        version_number: 1,
      },
      sourcePackage: source,
      derivativeVersionNumber: 2,
      deps: {
        generateReview: script.generateReview,
        historyLoader: {
          async listReadyCalendars() {
            return [
              buildHistoryRow({
                id: "source-ready",
                createdAt: "2026-05-09T10:00:00.000Z",
                socialPackage: source,
              }),
            ];
          },
        },
      },
    });
    assert.equal(result.socialMemory.calendarsIncluded, 1);
    assert.equal(result.historicalDiversity.accepted, true);
    assert.equal(result.sourceDivergence.accepted, true);
    assert.equal(result.sourceDivergenceRepairUsed, false);
  });

  it("L4 Think Differently requires source-negative context; conversation revision stays closed", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          generationMode: "think_differently",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          generationMode: "conversation_revision",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );

    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "think_differently",
      sourceNegativeContext: buildSourceNegativeContext(buildValidatedPackage(context)),
      deps: { generateReview: script.generateReview },
    });
    assert.equal(result.generationProvenance.generationMode, "think_differently");
    assert.match(script.prompts[0], /THINK DIFFERENTLY/);
  });

  it("does not force standard L5 generation through Think Differently context", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        generateHistoricallyDiverseSocialCalendar({
          context,
          generationMode: "think_differently",
          deps: {
            generateReview: async () => "{}",
            historyLoader: emptyLoader(),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );

    const standard = read(
      "services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar.ts",
    );
    assert.doesNotMatch(standard, /sourceNegativeContext/);
    assert.doesNotMatch(standard, /evaluateThinkDifferentlyDivergence/);
  });

  it("reuses L4 stages and adds only a Think Differently repair stage", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /social_calendar_strategy: "premiumStrategicOutput"/);
    assert.match(routing, /social_calendar_assets: "premiumStrategicOutput"/);
    assert.match(routing, /social_calendar_repair: "analysis"/);
    assert.match(routing, /social_calendar_diversity_repair: "analysis"/);
    assert.match(routing, /social_calendar_think_differently_repair: "analysis"/);
    assert.match(routing, /deployment_assets_think_differently: "premiumStrategicOutput"/);
  });

  it("does not persist or invent a second job table", () => {
    const generator = read(
      "services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar.ts",
    );
    assert.doesNotMatch(generator, /\.insert\(|\.update\(|\.upsert\(/);
    assert.doesNotMatch(generator, /athena_social_calendar_generation_jobs/);
    assert.doesNotMatch(generator, /thinkDifferentlyWorkflow/);
    assert.equal(TEST_ORG, "org-social-planner");
  });
});
