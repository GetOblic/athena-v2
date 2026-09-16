import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { generateSocialPlannerPackageByKind } from "../../services/socialPlanner/generation/dispatchSocialPlannerGeneration";
import { generateEvergreenSocialCalendarPackage } from "../../services/socialPlanner/generation/generateEvergreenSocialCalendarPackage";
import { SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  buildEvergreenDraftPrompt,
  buildEvergreenRepairPrompt,
} from "../../services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts";
import { planEvergreenWeekFormats } from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
  validateAndNormalizeSocialCalendarEvergreenPackage,
  validateSocialPlannerEvergreenWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import {
  buildGenerationContext,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function longDraft(format: string, seed: string): string {
  const body = [
    `${seed} opens with a specific Harbor Clinic observation about delayed preventive care.`,
    "Parents wait until a small problem becomes urgent, usually after a school event or a weekend that finally leaves room.",
    "This draft gives a manager a usable piece they can edit today, not a suggestion to start writing later.",
    "The first movement names the delay. The second movement shows the calmer first conversation.",
    "The third movement offers one evening slot, one Saturday slot, and a written reminder the parent can keep.",
    "Close with a restrained next step. Do not turn this into a daily social caption or a network rotation.",
    "Keep the language local and useful. Mention pickup times, school calendars, and the cost of waiting.",
  ];
  if (format === "skool_course_idea") {
    body.push(
      "Course name: Preventive Care Confidence.",
      "Learner outcome: Operators can run a calmer first-visit conversation.",
      "Module 1: The delayed-care pattern.",
      "Module 2: The first-visit script.",
      "Module 3: The follow-up habit.",
    );
  }
  return body.join("\n\n");
}

function evergreenStrategyRaw(context = buildGenerationContext()) {
  const dates = context.calendarContext.period.dates;
  const assigned = planEvergreenWeekFormats(dates);
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
  };
}

function evergreenPackageRaw(context = buildGenerationContext()) {
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
  return {
    schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen",
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day is a working draft a manager can edit.",
    days: assigned.map((assignment, index) => ({
      date: assignment.date,
      evergreenFormat: assignment.evergreenFormat,
      title: `Harbor ${assignment.evergreenFormat} ${index + 1}`,
      concept: `Angle ${index + 1} for delayed preventive care.`,
      draft: longDraft(assignment.evergreenFormat, `Day ${index + 1}`),
      cta: "Invite the family to book the overdue visit.",
      publishingGuidance: "Publish in the native format.",
      audience: "Busy parents",
      personaIds: ["persona-parent"],
      topic: `preventive care ${index + 1}`,
      angle: `practical delay ${index + 1}`,
      contentArchetype: "educational",
      primaryObjective: "educate",
      calendarAnchors: [],
      calendarReason: null,
      sourceSignals: [{ type: "brain", id: null }],
    })),
  };
}

const CALENDAR_36E3ECBE_SOURCE_SIGNAL_FAILURES = [
  "days[0].sourceSignals[1].type is unsupported.",
  "days[0].sourceSignals[2].type is unsupported.",
  "days[1].sourceSignals[1].type is unsupported.",
  "days[1].sourceSignals[2].type is unsupported.",
  "days[2].sourceSignals[1].type is unsupported.",
  "days[2].sourceSignals[2].type is unsupported.",
  "days[3].sourceSignals[0].type is unsupported.",
  "days[3].sourceSignals[2].type is unsupported.",
  "days[4].sourceSignals[0].type is unsupported.",
  "days[4].sourceSignals[2].type is unsupported.",
  "days[5].sourceSignals[1].type is unsupported.",
  "days[5].sourceSignals[2].type is unsupported.",
  "days[6].sourceSignals[0].type is unsupported.",
  "days[6].sourceSignals[2].type is unsupported.",
] as const;

function sourceSignalsFor36e3ecbe(dayIndex: number) {
  const valid = { type: "brain", id: null };
  const inventedA = { type: "research", id: null };
  const inventedB = { type: "content", id: null };
  if (dayIndex === 0 || dayIndex === 1 || dayIndex === 2 || dayIndex === 5) {
    return [valid, inventedA, inventedB];
  }
  return [inventedA, valid, inventedB];
}

function evergreenPackageWith36e3ecbeSourceSignals(
  context = buildGenerationContext(),
) {
  const raw = evergreenPackageRaw(context);
  return {
    ...raw,
    days: raw.days.map((day, index) => ({
      ...day,
      sourceSignals: sourceSignalsFor36e3ecbe(index),
    })),
  };
}

describe("Social Planner Evergreen generation dispatch", () => {
  it("Evergreen generation never invokes Daily package generation", async () => {
    const dailyService = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    const evergreenService = read(
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
    );
    const dispatch = read(
      "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
    );
    assert.match(dispatch, /if \(input\.plannerKind === "daily_social"\)/);
    assert.match(dispatch, /if \(input\.plannerKind === "evergreen"\)/);
    assert.match(dispatch, /generateEvergreenSocialCalendarPackage/);
    assert.match(dispatch, /generateSocialCalendarPackage/);
    assert.doesNotMatch(evergreenService, /generateSocialCalendarPackage\(/);
    assert.doesNotMatch(evergreenService, /generateDeploymentAssets\(/);
    assert.doesNotMatch(evergreenService, /validateAndNormalizeSocialCalendarPackage\(/);
    assert.doesNotMatch(dailyService, /generateEvergreenSocialCalendarPackage/);

    const context = buildGenerationContext();
    let dailyCalls = 0;
    const result = await generateSocialPlannerPackageByKind({
      plannerKind: "evergreen",
      context,
      generationMode: "standard",
      deps: {
        generateReview: async () => {
          dailyCalls += 1;
          if (dailyCalls === 1) return JSON.stringify(evergreenStrategyRaw(context));
          return JSON.stringify(evergreenPackageRaw(context));
        },
      },
    });
    assert.equal(result.package.schemaVersion, SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION);
    assert.equal("days" in result.package, true);
    assert.equal("assets" in result.package, false);
    assert.equal(dailyCalls, 2);
  });

  it("direct Evergreen generator produces assigned formats and rejects Daily leakage in source", async () => {
    const context = buildGenerationContext();
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (_prompt, options) => {
          assert.match(String(options?.stage ?? ""), /evergreen/);
          if (String(options?.stage ?? "").includes("strategy")) {
            return JSON.stringify(evergreenStrategyRaw(context));
          }
          return JSON.stringify(evergreenPackageRaw(context));
        },
      },
    });
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    assert.deepEqual(
      generated.package.days.map((day) => day.evergreenFormat),
      assigned.map((entry) => entry.evergreenFormat),
    );
    assert.equal(generated.package.plannerKind, "evergreen");
  });

  it("calendar 90b84313: literal newlines in Evergreen draft JSON recover instead of MALFORMED_STRUCTURED_OUTPUT", async () => {
    // Stored job 085b0168 for calendar 90b84313-a82a-4a96-a6b3-71a9d61c1948:
    // error_code=MALFORMED_STRUCTURED_OUTPUT
    // error_message=Social Planner assets generation produced malformed JSON.
    // generation_stage=assets, error_metadata=null, attempt_count=3
    const context = buildGenerationContext();
    const malformedAssetsJson = JSON.stringify(
      evergreenPackageRaw(context),
      null,
      2,
    ).replace(/\\n/g, "\n");

    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (_prompt, options) => {
          if (String(options?.stage ?? "").includes("strategy")) {
            return JSON.stringify(evergreenStrategyRaw(context));
          }
          return malformedAssetsJson;
        },
      },
    });

    assert.equal(generated.package.plannerKind, "evergreen");
    assert.equal(generated.package.days.length, 7);
    assert.match(generated.package.days[0].draft, /\n/);
    assert.equal(generated.package.generationMetadata.repairUsed, false);
  });

  it("calendar 36e3ecbe: unsupported sourceSignals types fail repair with the stored errors", async () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const failingPackage = evergreenPackageWith36e3ecbeSourceSignals(context);
    const storedFailures = CALENDAR_36E3ECBE_SOURCE_SIGNAL_FAILURES;

    try {
      validateAndNormalizeSocialCalendarEvergreenPackage({
        raw: failingPackage,
        context,
        metadata: {
          ...testMetadata(),
          packageSchemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
          plannerKind: "evergreen",
          strategyPromptVersion: "social_planner_evergreen_strategy_v1",
          assetPromptVersion: "social_planner_evergreen_v1",
        },
        assignedFormats: assigned,
      });
      assert.fail("expected sourceSignals validation to fail");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.equal(error.message, storedFailures[0]);
      assert.deepEqual(
        "failures" in error ? error.failures : [],
        storedFailures,
      );
    }

    let repairPrompt = "";
    let draftPrompt = "";
    try {
      await generateEvergreenSocialCalendarPackage({
        context,
        generationMode: "standard",
        deps: {
          generateReview: async (prompt, options) => {
            const stage = String(options?.stage ?? "");
            if (stage.includes("strategy")) {
              return JSON.stringify(evergreenStrategyRaw(context));
            }
            if (stage.includes("repair")) {
              repairPrompt = prompt;
              return JSON.stringify(failingPackage);
            }
            draftPrompt = prompt;
            return JSON.stringify(failingPackage);
          },
        },
      });
      assert.fail("expected REPAIR_VALIDATION_FAILED");
    } catch (error) {
      assert.ok(error instanceof SocialPlannerGenerationError);
      assert.equal(error.code, "REPAIR_VALIDATION_FAILED");
      assert.equal(error.stage, "repair_validation");
      assert.equal(error.retryable, false);
      assert.equal(error.message, "days[0].sourceSignals[1].type is unsupported.");
      assert.deepEqual(error.failures, storedFailures);
    }

    assert.match(draftPrompt, /sourceSignals\.type:/);
    assert.match(repairPrompt, /sourceSignals\.type:/);
    for (const type of SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES) {
      assert.match(draftPrompt, new RegExp(`\\b${type}\\b`));
      assert.match(repairPrompt, new RegExp(`\\b${type}\\b`));
    }
  });

  it("Evergreen draft and repair prompts list the closed sourceSignals enum", () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      evergreenStrategyRaw(context),
      context,
      assigned,
    );
    const draftPrompt = buildEvergreenDraftPrompt({
      context,
      userGuidance: null,
      strategy,
      assignedFormats: assigned,
    });
    const repairPrompt = buildEvergreenRepairPrompt({
      context,
      userGuidance: null,
      strategy,
      assignedFormats: assigned,
      invalidPackage: evergreenPackageWith36e3ecbeSourceSignals(context),
      failures: [...CALENDAR_36E3ECBE_SOURCE_SIGNAL_FAILURES],
    });
    assert.match(draftPrompt, /sourceSignals\.type:/);
    assert.match(repairPrompt, /sourceSignals\.type:/);
    for (const type of SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES) {
      assert.match(draftPrompt, new RegExp(`\\b${type}\\b`));
      assert.match(repairPrompt, new RegExp(`\\b${type}\\b`));
    }
  });

  it("does not persist Evergreen output into Deployment Asset suggested_cta", () => {
    const files = [
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
      "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
      "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /generateDeploymentAssets\(/);
      assert.doesNotMatch(source, /suggested_cta/);
    }
  });
});
