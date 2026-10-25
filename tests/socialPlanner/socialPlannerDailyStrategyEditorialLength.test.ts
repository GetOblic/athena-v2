import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import {
  EVERGREEN_SOCIAL_PLANNER_MODEL,
  resolveModelForStage,
} from "../../lib/llm/modelRouting";
import type { SocialCalendarOpportunity } from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import { SOCIAL_PLANNER_PACKAGE_LIMITS } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
  validateSocialPlannerEvergreenWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerStrategyValidationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import { generateSocialCalendarPackage } from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import {
  buildSocialPlannerAssetPrompt,
  buildSocialPlannerStrategyPrompt,
} from "../../services/socialPlanner/generation/socialPlannerGenerationPrompts";
import { planEvergreenWeekFormats } from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  validateAndNormalizeSocialCalendarPackage,
  validateSocialPlannerWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import { classifySocialCalendarExecutorError } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor";
import type { SocialPlannerGenerationContextV1 } from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

const GEMINI = "google/gemini-2.5-flash";
const ROOT = process.cwd();

const ENV_KEYS = [
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
  "OPENROUTER_ANALYSIS_MODEL",
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function repeatTo(text: string, minChars: number): string {
  let value = "";
  while (value.length < minChars) value += text;
  return value;
}

function paddedNarrative(text: string, minChars: number, tail: string): string {
  return `  ${repeatTo(text, minChars)}${tail}  `;
}

const creativeDirection = paddedNarrative(
  "Warm, local, documentary direction for the clinic week. ",
  1000,
  "UNIQUE_CREATIVE_DIRECTION_TAIL",
);
const userGuidanceInterpretation = paddedNarrative(
  "The operator asked for practical local proof and no invented offers. ",
  1000,
  "UNIQUE_GUIDANCE_TAIL",
);
const audienceNarrative = paddedNarrative(
  "Parents who need after-school cleanings and a clear next step. ",
  300,
  "UNIQUE_AUDIENCE_TAIL",
);

function withNarrative(
  raw: Record<string, unknown>,
  fields: {
    creativeDirection?: string;
    userGuidanceInterpretation?: string | number | null;
    audience?: string | number | null;
  },
): Record<string, unknown> {
  const next = structuredClone(raw);
  if ("creativeDirection" in fields) next.creativeDirection = fields.creativeDirection;
  if ("userGuidanceInterpretation" in fields) {
    next.userGuidanceInterpretation = fields.userGuidanceInterpretation;
  }
  if ("audience" in fields) {
    const plan = next.audiencePlan as Array<Record<string, unknown>>;
    plan[0] = { ...plan[0], audience: fields.audience };
  }
  return next;
}

function expectStrategyFailure(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
): SocialPlannerStrategyValidationError {
  try {
    validateSocialPlannerWeeklyStrategy(raw, context);
  } catch (error) {
    assert.ok(error instanceof SocialPlannerStrategyValidationError);
    return error;
  }
  assert.fail("expected strategy validation to fail");
}

function expectPackageFailure(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
  metadata = testMetadata(),
): SocialCalendarPackageValidationError {
  try {
    validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata,
    });
  } catch (error) {
    assert.ok(error instanceof SocialCalendarPackageValidationError);
    return error;
  }
  assert.fail("expected package validation to fail");
}

async function withRoutingEnv<T>(run: () => Promise<T> | T): Promise<T> {
  const previous = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  process.env.OPENROUTER_PREMIUM_MODEL = GEMINI;
  process.env.OPENROUTER_MODEL = GEMINI;
  process.env.OPENROUTER_ANALYSIS_MODEL = GEMINI;
  process.env.OPENROUTER_STRATEGIC_BLUEPRINT_MODEL = "anthropic/claude-sonnet-4";
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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

function evergreenStrategyRaw(
  context: SocialPlannerGenerationContextV1,
  overrides: Record<string, unknown> = {},
) {
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
  return {
    schemaVersion: SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: "Teach delayed preventive care through durable formats.",
    secondaryObjectives: ["build_authority"],
    audiencePlan: [
      { audience: "Busy parents", personaId: "persona-parent", role: "primary" },
    ],
    topicPlan: [{ topic: "delayed care", rationale: "Supported by clinic context." }],
    formatPlan: assigned.map((entry) => ({
      date: entry.date,
      evergreenFormat: entry.evergreenFormat,
      contentArchetype: "educational",
      primaryObjective: "educate",
    })),
    calendarOpportunityPlan: { selected: [], ignored: [] },
    contentBalance: {
      promotionalWeight: "low",
      educationalWeight: "high",
      communityWeight: "moderate",
      funnelNotes: "Teach first.",
    },
    narrativeArc: "Move from the delay pattern to a usable next step.",
    creativeDirection: "Plain, local, useful.",
    avoidances: ["Daily social copy"],
    userGuidanceInterpretation: null,
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day is a working draft a manager can edit.",
    ...overrides,
  };
}

describe("Daily Social Planner strategy editorial length", () => {
  it("A. accepts creativeDirection longer than 400 characters and keeps the full wording", () => {
    const context = buildGenerationContext();
    assert.ok(creativeDirection.trim().length > 400);
    assert.ok(creativeDirection.trim().length > SOCIAL_PLANNER_PACKAGE_LIMITS.creativeDirectionMaxChars);

    const strategy = validateSocialPlannerWeeklyStrategy(
      withNarrative(buildValidStrategyRaw(context), { creativeDirection }),
      context,
    );

    assert.equal(strategy.creativeDirection, creativeDirection.trim());
    assert.ok(strategy.creativeDirection.endsWith("UNIQUE_CREATIVE_DIRECTION_TAIL"));
    assert.equal(strategy.creativeDirection.includes("UNIQUE_CREATIVE_DIRECTION_TAIL"), true);
  });

  it("B. accepts userGuidanceInterpretation longer than 400 characters and keeps the full wording", () => {
    const context = buildGenerationContext();
    assert.ok(
      userGuidanceInterpretation.trim().length >
        SOCIAL_PLANNER_PACKAGE_LIMITS.userGuidanceInterpretationMaxChars,
    );

    const strategy = validateSocialPlannerWeeklyStrategy(
      withNarrative(buildValidStrategyRaw(context), { userGuidanceInterpretation }),
      context,
    );

    assert.equal(strategy.userGuidanceInterpretation, userGuidanceInterpretation.trim());
    assert.ok(strategy.userGuidanceInterpretation?.endsWith("UNIQUE_GUIDANCE_TAIL"));
  });

  it("C. accepts audiencePlan audience longer than 220 characters and keeps the full wording", () => {
    const context = buildGenerationContext();
    assert.ok(audienceNarrative.trim().length > SOCIAL_PLANNER_PACKAGE_LIMITS.audienceMaxChars);

    const strategy = validateSocialPlannerWeeklyStrategy(
      withNarrative(buildValidStrategyRaw(context), { audience: audienceNarrative }),
      context,
    );

    assert.equal(strategy.audiencePlan[0]?.audience, audienceNarrative.trim());
    assert.ok(strategy.audiencePlan[0]?.audience.endsWith("UNIQUE_AUDIENCE_TAIL"));
    assert.equal(strategy.audiencePlan[0]?.personaId, "persona-parent");
    assert.equal(strategy.audiencePlan[0]?.role, "primary");
  });

  it("D. passes a combined long-field strategy into the existing asset stage", async () => {
    await withRoutingEnv(async () => {
      const context = buildGenerationContext();
      const strategyRaw = withNarrative(buildValidStrategyRaw(context), {
        creativeDirection,
        userGuidanceInterpretation,
        audience: audienceNarrative,
      });
      const script = scriptedReview([
        JSON.stringify(strategyRaw),
        JSON.stringify(buildValidPackageRaw(context)),
      ]);

      const result = await generateSocialCalendarPackage({
        context,
        userGuidance: null,
        generationMode: "standard",
        deps: { generateReview: script.generateReview },
      });

      assert.equal(script.prompts.length, 2);
      assert.equal(script.metas[0]?.athenaStage, "social_calendar_strategy");
      assert.equal(script.metas[1]?.athenaStage, "social_calendar_assets");
      assert.equal(script.prompts[1]?.includes(creativeDirection.trim()), true);
      assert.equal(script.prompts[1]?.includes(userGuidanceInterpretation.trim()), true);
      assert.equal(script.prompts[1]?.includes(audienceNarrative.trim()), true);
      assert.equal(result.package.assets.length, 7);
      assert.equal(result.generationProvenance.repairUsed, false);
      assert.deepEqual(
        result.generationProvenance.stages.map((stage) => stage.pass),
        ["strategy", "assets"],
      );
      assert.deepEqual(
        result.generationProvenance.stages.map((stage) => stage.model),
        [GEMINI, GEMINI],
      );
    });
  });

  it("E. still rejects missing, blank, wrong-type, and structurally invalid required strategy fields", () => {
    const context = buildGenerationContext();
    const base = () =>
      withNarrative(buildValidStrategyRaw(context), {
        creativeDirection,
        userGuidanceInterpretation,
        audience: audienceNarrative,
      });

    const missingCreative = base();
    delete missingCreative.creativeDirection;
    assert.ok(
      expectStrategyFailure(missingCreative, context).failures.includes(
        "creativeDirection is required.",
      ),
    );

    assert.ok(
      expectStrategyFailure(
        withNarrative(base(), { creativeDirection: "   " }),
        context,
      ).failures.includes("creativeDirection must not be empty."),
    );
    assert.ok(
      expectStrategyFailure(
        withNarrative(base(), { creativeDirection: 12 as unknown as string }),
        context,
      ).failures.includes("creativeDirection must be a string."),
    );

    const missingAudience = base();
    delete (missingAudience.audiencePlan as Array<Record<string, unknown>>)[0].audience;
    assert.ok(
      expectStrategyFailure(missingAudience, context).failures.includes(
        "audiencePlan[0].audience is required.",
      ),
    );
    assert.ok(
      expectStrategyFailure(
        withNarrative(base(), { audience: "   " }),
        context,
      ).failures.includes("audiencePlan[0].audience must not be empty."),
    );
    assert.ok(
      expectStrategyFailure(
        withNarrative(base(), { audience: 12 }),
        context,
      ).failures.includes("audiencePlan[0].audience must be a string."),
    );

    const blankGuidance = validateSocialPlannerWeeklyStrategy(
      withNarrative(base(), { userGuidanceInterpretation: "   " }),
      context,
    );
    assert.equal(blankGuidance.userGuidanceInterpretation, null);
    const wrongTypeGuidance = validateSocialPlannerWeeklyStrategy(
      withNarrative(base(), { userGuidanceInterpretation: 12 }),
      context,
    );
    assert.equal(wrongTypeGuidance.userGuidanceInterpretation, null);

    const badSchema = base();
    badSchema.schemaVersion = "not_a_strategy";
    assert.ok(
      expectStrategyFailure(badSchema, context).failures.includes(
        "Weekly strategy schemaVersion must be social_planner_weekly_strategy_v1.",
      ),
    );

    const shortWeek = base();
    (shortWeek.formatPlan as unknown[]).pop();
    assert.ok(
      expectStrategyFailure(shortWeek, context).failures.includes(
        "formatPlan must contain exactly seven day slots.",
      ),
    );

    const overlongObjective = base();
    overlongObjective.weeklyObjective = "W".repeat(281);
    const objectiveError = expectStrategyFailure(overlongObjective, context);
    assert.ok(
      objectiveError.failures.includes("weeklyObjective exceeds 280 characters."),
    );
    assert.equal(
      objectiveError.failures.some((failure) => failure.includes("creativeDirection exceeds")),
      false,
    );

    const overlongArc = base();
    overlongArc.narrativeArc = "N".repeat(601);
    assert.ok(
      expectStrategyFailure(overlongArc, context).failures.includes(
        "narrativeArc exceeds 600 characters.",
      ),
    );

    const badRole = base();
    (badRole.audiencePlan as Array<Record<string, unknown>>)[0].role = "tertiary";
    assert.ok(
      expectStrategyFailure(badRole, context).failures.includes(
        "audiencePlan[0].role is invalid.",
      ),
    );
  });

  it("F. keeps privacy, geography, package-size, asset audience, and structural protections", () => {
    const context = buildGenerationContext({ prospectName: "Hidden Dental Group LLC" });
    const privateCopy = expectPackageFailure(
      buildValidPackageRaw(context, {
        0: { socialCopy: "Shoutout to Hidden Dental Group LLC for the idea." },
      }),
      context,
    );
    assert.equal(privateCopy.kind, "portfolio");
    assert.ok(
      privateCopy.failures.some((failure) =>
        failure.includes("Generated Social Calendar output must not expose Prospect business identity."),
      ),
    );

    const foreign: SocialCalendarOpportunity = {
      id: "test-holiday:2026-05-11",
      label: "Bank Holiday",
      date: context.calendarContext.period.dates[1],
      category: "civic_observance",
      scope: "country",
      jurisdictionCountryCode: "GB",
      jurisdictionRegionCode: null,
      jurisdictionHemisphere: null,
      selectionStatus: "candidate",
      ruleId: "test-holiday",
      observedKind: "actual",
      providerRule: "test",
    };
    context.calendarContext.opportunities.push(foreign);
    const outside = expectPackageFailure(
      buildValidPackageRaw(context, {
        1: {
          calendarAnchors: [
            {
              sourceCandidateId: foreign.id,
              date: foreign.date,
              label: foreign.label,
              category: foreign.category,
              scope: foreign.scope,
              jurisdictionCountryCode: foreign.jurisdictionCountryCode,
              jurisdictionRegionCode: foreign.jurisdictionRegionCode,
              jurisdictionHemisphere: foreign.jurisdictionHemisphere,
              reason: "Model memory",
            },
          ],
          calendarReason: "Foreign observance",
        },
      }),
      context,
    );
    assert.ok(
      outside.failures.some((failure) =>
        failure.includes("is outside the trusted jurisdiction."),
      ),
    );

    const invented = buildValidStrategyRaw(context);
    (invented.audiencePlan as Array<{ personaId: string }>)[0].personaId = "persona-invented";
    assert.ok(
      expectStrategyFailure(invented, context).failures.some((failure) =>
        failure.includes("invented Persona id persona-invented"),
      ),
    );

    const assetAudience = expectPackageFailure(
      buildValidPackageRaw(context, {
        0: { audience: "A".repeat(221) },
      }),
      context,
    );
    assert.ok(
      assetAudience.failures.includes("assets[0].audience exceeds 220 characters."),
    );

    const oversizedAsset = expectPackageFailure(
      buildValidPackageRaw(context, {
        3: {
          productionSpec: {
            kind: "document",
            documentConcept: "One-page first-visit checklist for parents.",
            designPrompt: "Clean one-page PDF.",
            sections: Array.from({ length: 8 }, (_, index) => ({
              heading: `Section ${index + 1}`,
              content: "X".repeat(SOCIAL_PLANNER_PACKAGE_LIMITS.productionPromptMaxChars),
            })),
          },
        },
      }),
      context,
    );
    assert.equal(oversizedAsset.kind, "structural");
    assert.ok(
      oversizedAsset.failures.includes("assets[3] exceeds the 12000 character budget."),
    );

    const oversizedPackage = expectPackageFailure(
      buildValidPackageRaw(context),
      context,
      testMetadata({ calendarResolverVersion: "v".repeat(100_000) }),
    );
    assert.equal(oversizedPackage.kind, "budget");
    assert.ok(
      oversizedPackage.failures.some((failure) =>
        failure.includes("Package exceeds the 96000 character hard budget"),
      ),
    );

    const shortPackage = buildValidPackageRaw(context);
    (shortPackage.assets as unknown[]).pop();
    assert.ok(
      expectPackageFailure(shortPackage, context).failures.includes(
        "Package must contain exactly seven assets.",
      ),
    );

    const strategyPrompt = buildSocialPlannerStrategyPrompt({
      context,
      userGuidance: null,
    });
    assert.equal(strategyPrompt.includes("creativeDirection maximum"), false);
    assert.equal(strategyPrompt.includes("creativeDirection must be at most"), false);
    assert.equal(strategyPrompt.includes("audience ≤ 220"), false);
    assert.match(strategyPrompt, /"creativeDirection": string/);
    assert.match(strategyPrompt, /"userGuidanceInterpretation": string\|null/);

    const assetPrompt = buildSocialPlannerAssetPrompt({
      context,
      userGuidance: null,
      strategy: validateSocialPlannerWeeklyStrategy(buildValidStrategyRaw(context), context),
    });
    assert.match(assetPrompt, /audience ≤ 220/);

    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /TENANT_MISMATCH/);
    assert.match(executor, /calendar\.organization_id !== job\.organization_id/);
  });

  it("G. keeps Daily strategy, assets, and repair on Gemini 2.5 Flash", async () => {
    await withRoutingEnv(async () => {
      assert.equal(resolveModelForStage("social_calendar_strategy").model, GEMINI);
      assert.equal(resolveModelForStage("social_calendar_strategy").role, "premiumStrategicOutput");
      assert.equal(resolveModelForStage("social_calendar_assets").model, GEMINI);
      assert.equal(resolveModelForStage("social_calendar_assets").role, "premiumStrategicOutput");
      assert.equal(resolveModelForStage("social_calendar_repair").model, GEMINI);
      assert.equal(resolveModelForStage("social_calendar_repair").role, "analysis");

      const service = read("services/socialPlanner/generation/socialPlannerGenerationService.ts");
      const routing = read("lib/llm/modelRouting.ts");
      assert.match(service, /const STRATEGY_STAGE = "social_calendar_strategy"/);
      assert.match(service, /const ASSET_STAGE = "social_calendar_assets"/);
      assert.match(service, /const REPAIR_STAGE = "social_calendar_repair"/);
      assert.doesNotMatch(service, /claude-sonnet-5\.5/);
      assert.doesNotMatch(service, /EVERGREEN_SOCIAL_PLANNER_MODEL/);
      assert.match(routing, /social_calendar_strategy: "premiumStrategicOutput"/);
      assert.match(routing, /social_calendar_assets: "premiumStrategicOutput"/);
      assert.match(routing, /social_calendar_repair: "analysis"/);
      assert.equal(EVERGREEN_SOCIAL_PLANNER_MODEL, "anthropic/claude-sonnet-5.5");
      assert.notEqual(resolveModelForStage("social_calendar_strategy").model, EVERGREEN_SOCIAL_PLANNER_MODEL);
    });
  });

  it("H. keeps Evergreen long narratives valid and Claude Sonnet 5.5 routing unchanged", async () => {
    await withRoutingEnv(async () => {
      const context = buildGenerationContext();
      const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
      const weeklyObjective = paddedNarrative(
        "Teach delayed preventive care through a usable draft. ",
        400,
        "UNIQUE_EVERGREEN_OBJECTIVE_TAIL",
      );
      const evergreenCreative = paddedNarrative(
        "Plain, local, and useful for a manager who will edit the draft. ",
        500,
        "UNIQUE_EVERGREEN_CREATIVE_TAIL",
      );
      const narrativeArc = paddedNarrative(
        "Move from the delay pattern to one usable next step. ",
        700,
        "UNIQUE_EVERGREEN_ARC_TAIL",
      );
      const evergreenAudience = paddedNarrative(
        "Managers who will edit a durable draft before it is published. ",
        300,
        "UNIQUE_EVERGREEN_AUDIENCE_TAIL",
      );
      const evergreenGuidance = paddedNarrative(
        "Keep the Evergreen drafts specific to the clinic and editable. ",
        500,
        "UNIQUE_EVERGREEN_GUIDANCE_TAIL",
      );

      const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
        evergreenStrategyRaw(context, {
          weeklyObjective,
          creativeDirection: evergreenCreative,
          narrativeArc,
          userGuidanceInterpretation: evergreenGuidance,
          audiencePlan: [
            {
              audience: evergreenAudience,
              personaId: "persona-parent",
              role: "primary",
            },
          ],
        }),
        context,
        assigned,
      );

      assert.equal(strategy.weeklyObjective, weeklyObjective.trim());
      assert.equal(strategy.creativeDirection, evergreenCreative.trim());
      assert.equal(strategy.narrativeArc, narrativeArc.trim());
      assert.equal(strategy.audiencePlan[0]?.audience, evergreenAudience.trim());
      assert.equal(strategy.userGuidanceInterpretation, evergreenGuidance.trim());
      assert.ok(strategy.creativeDirection.endsWith("UNIQUE_EVERGREEN_CREATIVE_TAIL"));

      assert.equal(
        resolveModelForStage("social_calendar_evergreen_strategy").model,
        "anthropic/claude-sonnet-5.5",
      );
      assert.equal(
        resolveModelForStage("social_calendar_evergreen_assets").model,
        "anthropic/claude-sonnet-5.5",
      );
      assert.equal(
        resolveModelForStage("social_calendar_evergreen_repair").model,
        "anthropic/claude-sonnet-5.5",
      );
      assert.equal(
        resolveModelForStage("social_calendar_evergreen_strategy").role,
        "premiumStrategicOutput",
      );

      const generator = read(
        "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
      );
      const prompts = read(
        "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
      );
      assert.match(generator, /const STRATEGY_STAGE = "social_calendar_evergreen_strategy"/);
      assert.doesNotMatch(generator, /normalizeEvergreenStrategyNarrativeFields/);
      assert.match(
        prompts,
        /creativeDirection maximum is \$\{EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS\} characters/,
      );
    });
  });

  it("I. does not add a strategy repair pass or an extra model call", async () => {
    const context = buildGenerationContext();
    const invalid = buildValidStrategyRaw(context);
    delete invalid.creativeDirection;
    const script = scriptedReview([JSON.stringify(invalid)]);

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
        assert.equal(error.code, "STRATEGY_VALIDATION_FAILED");
        assert.equal(error.stage, "strategy");
        assert.equal(error.retryable, true);
        assert.ok(error.failures.includes("creativeDirection is required."));
        return true;
      },
    );
    assert.equal(script.prompts.length, 1);
    assert.equal(script.metas[0]?.athenaStage, "social_calendar_strategy");

    const classified = classifySocialCalendarExecutorError(
      new SocialPlannerGenerationError({
        code: "STRATEGY_VALIDATION_FAILED",
        message: "creativeDirection is required.",
        stage: "strategy",
        retryable: true,
        failures: ["creativeDirection is required."],
      }),
    );
    assert.equal(classified.retryable, true);
    assert.equal(classified.code, "STRATEGY_VALIDATION_FAILED");
    assert.equal(classified.stage, "strategy");

    const service = read("services/socialPlanner/generation/socialPlannerGenerationService.ts");
    const validator = read("services/socialPlanner/generation/validateSocialCalendarPackage.ts");
    const jobs = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes.ts",
    );
    assert.equal((service.match(/pass: "repair"/g) ?? []).length, 1);
    assert.match(service, /code: "STRATEGY_VALIDATION_FAILED"/);
    assert.match(service, /retryable: true/);
    assert.doesNotMatch(service, /strategy_repair/);
    assert.doesNotMatch(validator, /creativeDirectionMaxChars/);
    assert.doesNotMatch(validator, /userGuidanceInterpretationMaxChars/);
    assert.equal((validator.match(/LIMITS\.audienceMaxChars/g) ?? []).length, 1);
    assert.match(validator, /weeklyObjectiveMaxChars/);
    assert.match(validator, /packageMaxChars/);
    assert.match(jobs, /max_attempts: Number\(row\.max_attempts \?\? 3\)/);
  });
});
