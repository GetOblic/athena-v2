import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { generateEvergreenSocialCalendarPackage } from "../../services/socialPlanner/generation/generateEvergreenSocialCalendarPackage";
import { SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  SocialPlannerGenerationError,
  SocialPlannerStrategyValidationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT,
  buildEvergreenStrategyPrompt,
} from "../../services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts";
import { planEvergreenWeekFormats } from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS,
  EVERGREEN_STRATEGY_CREATIVE_DIRECTION_TARGET_CHARS,
  EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS,
  EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_TARGET_CHARS,
  normalizeEvergreenStrategyNarrativeFields,
} from "../../services/socialPlanner/generation/normalizeEvergreenStrategyNarratives";
import {
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
  validateSocialPlannerEvergreenWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import { buildGenerationContext } from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sentence(bodyChars: number, tail: string, glyph = "A"): string {
  return `${glyph.repeat(bodyChars - 1)}. ${tail}`;
}

function assertBoundaryPrefix(original: string, shortened: string, max: number) {
  const trimmed = original.trim();
  assert.ok(shortened.length > 0);
  assert.ok(shortened.length <= max);
  assert.equal(trimmed.startsWith(shortened), true);
  if (shortened.length < trimmed.length) {
    assert.match(trimmed[shortened.length] ?? "", /\s/);
  }
}

function evergreenStrategyRaw(
  context = buildGenerationContext(),
  overrides: Record<string, unknown> = {},
) {
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
    ...overrides,
  };
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

function failuresFrom(run: () => void): string[] {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof SocialPlannerStrategyValidationError);
    return error.failures;
  }
  assert.fail("expected strategy validation to fail");
}

describe("Evergreen strategy narrative length", () => {
  const context = buildGenerationContext();
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);

  it("keeps the established caps and asks the strategy prompt to self-check under them", () => {
    assert.equal(EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS, 280);
    assert.equal(EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS, 400);
    assert.equal(EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_TARGET_CHARS, 240);
    assert.equal(EVERGREEN_STRATEGY_CREATIVE_DIRECTION_TARGET_CHARS, 350);

    const prompt = buildEvergreenStrategyPrompt({
      context,
      userGuidance: null,
      assignedFormats: assigned,
    });
    assert.match(prompt, /NARRATIVE LENGTH:/);
    assert.match(prompt, /weeklyObjective maximum is 280 characters/);
    assert.match(prompt, /Write 240 characters or fewer/);
    assert.match(prompt, /creativeDirection maximum is 400 characters/);
    assert.match(prompt, /Write 350 characters or fewer/);
    assert.match(
      prompt,
      /Before returning JSON, count the characters in weeklyObjective and creativeDirection/,
    );
    assert.match(
      prompt,
      /Do not return JSON until both fields are within their maximums/,
    );
    assert.match(SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT, /at most 280 characters/);
    assert.match(SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT, /Prefer 240 or fewer/);
    assert.match(SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT, /at most 400 characters/);
    assert.match(SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT, /Prefer 350 or fewer/);
    assert.match(
      SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT,
      /Before returning JSON, count both fields/,
    );

    const dailyPrompt = read(
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
    );
    const dailyService = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    const singleDay = read(
      "services/socialPlanner/conversationRevision/generateSingleDayConversationRevision.ts",
    );
    assert.doesNotMatch(dailyPrompt, /NARRATIVE LENGTH:/);
    assert.doesNotMatch(dailyService, /normalizeEvergreenStrategyNarrativeFields/);
    assert.doesNotMatch(singleDay, /normalizeEvergreenStrategyNarrativeFields/);
    const validator = read(
      "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
    );
    assert.doesNotMatch(validator, /normalizeEvergreenStrategyNarrativeFields\(/);
    assert.doesNotMatch(validator, /shortenEvergreenNarrativeToLimit\(/);
  });

  it("preserves both narrative strings when they are already within the caps", () => {
    const weeklyObjective = `${"A".repeat(239)}.`;
    const creativeDirection = `  ${"B".repeat(349)}.  `;
    assert.equal(weeklyObjective.length, 240);
    assert.ok(weeklyObjective.length <= EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS);
    assert.ok(
      creativeDirection.trim().length <= EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS,
    );
    const raw = evergreenStrategyRaw(context, {
      weeklyObjective,
      creativeDirection,
    });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    assert.notEqual(normalized, raw);
    assert.equal(normalized.weeklyObjective, weeklyObjective);
    assert.equal(normalized.creativeDirection, creativeDirection.trim());
    assert.equal(normalized.formatPlan, raw.formatPlan);
    assert.equal(normalized.secondaryObjectives, raw.secondaryObjectives);
    assert.equal(normalized.topicPlan, raw.topicPlan);
    assert.equal(normalized.audiencePlan, raw.audiencePlan);
    assert.equal(normalized.avoidances, raw.avoidances);
    assert.equal(normalized.schemaVersion, raw.schemaVersion);
    assert.equal(normalized.narrativeArc, raw.narrativeArc);
    assert.equal(raw.creativeDirection, creativeDirection);

    const exact = evergreenStrategyRaw(context, {
      weeklyObjective: "A".repeat(EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS),
      creativeDirection: "B".repeat(EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS),
    });
    assert.equal(normalizeEvergreenStrategyNarrativeFields(exact), exact);

    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      normalized,
      context,
      assigned,
    );
    assert.equal(strategy.weeklyObjective, weeklyObjective);
    assert.equal(strategy.creativeDirection, creativeDirection.trim());
  });

  it("shortens an overlong weeklyObjective at a sentence boundary and leaves creativeDirection", () => {
    const weeklyObjective = sentence(250, `${"B".repeat(80)} still too long.`);
    const creativeDirection = "Plain, local, useful.";
    assert.ok(weeklyObjective.length > EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS);
    const raw = evergreenStrategyRaw(context, { weeklyObjective, creativeDirection });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    const shortened = String(normalized.weeklyObjective);
    assertBoundaryPrefix(
      weeklyObjective,
      shortened,
      EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS,
    );
    assert.equal(shortened, `${"A".repeat(249)}.`);
    assert.equal(normalized.creativeDirection, creativeDirection);
    assert.equal(normalized.topicPlan, raw.topicPlan);
    assert.equal(normalized.formatPlan, raw.formatPlan);

    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      normalized,
      context,
      assigned,
    );
    assert.equal(strategy.weeklyObjective, shortened);
    assert.equal(strategy.creativeDirection, creativeDirection);

    const direct = failuresFrom(() =>
      validateSocialPlannerEvergreenWeeklyStrategy(raw, context, assigned),
    );
    assert.deepEqual(direct, ["weeklyObjective exceeds 280 characters."]);
  });

  it("shortens an overlong creativeDirection at a word boundary when no substantial sentence fits", () => {
    const creativeDirection = Array.from({ length: 70 }, () => "useful").join(" ");
    assert.ok(creativeDirection.length > EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS);
    assert.equal(creativeDirection.includes("."), false);
    const weeklyObjective = "Teach delayed preventive care through durable formats.";
    const raw = evergreenStrategyRaw(context, { weeklyObjective, creativeDirection });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    const shortened = String(normalized.creativeDirection);
    assertBoundaryPrefix(
      creativeDirection,
      shortened,
      EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS,
    );
    assert.equal(shortened.endsWith("useful"), true);
    assert.equal(normalized.weeklyObjective, weeklyObjective);
    assert.equal(normalized.avoidances, raw.avoidances);

    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      normalized,
      context,
      assigned,
    );
    assert.equal(strategy.creativeDirection, shortened);

    const direct = failuresFrom(() =>
      validateSocialPlannerEvergreenWeeklyStrategy(raw, context, assigned),
    );
    assert.deepEqual(direct, ["creativeDirection exceeds 400 characters."]);
  });

  it("shortens both narrative strings and does not rewrite the rest of the strategy", () => {
    const weeklyObjective = `${"A".repeat(249)}. UNIQUE_WEEKLY_TAIL ${"B".repeat(40)}`;
    const creativeDirection = `${"C".repeat(359)}. UNIQUE_CREATIVE_TAIL ${"D".repeat(80)}`;
    assert.ok(weeklyObjective.length > 280);
    assert.ok(creativeDirection.length > 400);
    const raw = evergreenStrategyRaw(context, { weeklyObjective, creativeDirection });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    assertBoundaryPrefix(weeklyObjective, String(normalized.weeklyObjective), 280);
    assertBoundaryPrefix(creativeDirection, String(normalized.creativeDirection), 400);
    assert.equal(String(normalized.weeklyObjective).includes("UNIQUE_WEEKLY_TAIL"), false);
    assert.equal(
      String(normalized.creativeDirection).includes("UNIQUE_CREATIVE_TAIL"),
      false,
    );
    assert.equal(normalized.schemaVersion, raw.schemaVersion);
    assert.equal(normalized.secondaryObjectives, raw.secondaryObjectives);
    assert.equal(normalized.audiencePlan, raw.audiencePlan);
    assert.equal(normalized.topicPlan, raw.topicPlan);
    assert.equal(normalized.formatPlan, raw.formatPlan);
    assert.equal(normalized.calendarOpportunityPlan, raw.calendarOpportunityPlan);
    assert.equal(normalized.contentBalance, raw.contentBalance);
    assert.equal(normalized.narrativeArc, raw.narrativeArc);
    assert.equal(normalized.avoidances, raw.avoidances);
    assert.equal(normalized.userGuidanceInterpretation, raw.userGuidanceInterpretation);
    assert.equal(raw.weeklyObjective, weeklyObjective);
    assert.equal(raw.creativeDirection, creativeDirection);

    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      normalized,
      context,
      assigned,
    );
    assert.equal(strategy.weeklyObjective, normalized.weeklyObjective);
    assert.equal(strategy.creativeDirection, normalized.creativeDirection);
    assert.deepEqual(
      strategy.formatPlan.map((entry) => entry.evergreenFormat),
      assigned.map((entry) => entry.evergreenFormat),
    );
  });

  it("still rejects missing and non-string narrative fields", () => {
    const missingWeekly = evergreenStrategyRaw(context);
    delete (missingWeekly as { weeklyObjective?: unknown }).weeklyObjective;
    assert.deepEqual(normalizeEvergreenStrategyNarrativeFields(missingWeekly), missingWeekly);
    assert.deepEqual(
      failuresFrom(() =>
        validateSocialPlannerEvergreenWeeklyStrategy(
          normalizeEvergreenStrategyNarrativeFields(missingWeekly),
          context,
          assigned,
        ),
      ),
      ["weeklyObjective is required."],
    );

    const numericWeekly = evergreenStrategyRaw(context, { weeklyObjective: 280 });
    assert.equal(
      normalizeEvergreenStrategyNarrativeFields(numericWeekly).weeklyObjective,
      280,
    );
    assert.ok(
      failuresFrom(() =>
        validateSocialPlannerEvergreenWeeklyStrategy(
          normalizeEvergreenStrategyNarrativeFields(numericWeekly),
          context,
          assigned,
        ),
      ).includes("weeklyObjective must be a string."),
    );

    const nullCreative = evergreenStrategyRaw(context, { creativeDirection: null });
    assert.equal(
      normalizeEvergreenStrategyNarrativeFields(nullCreative).creativeDirection,
      null,
    );
    assert.ok(
      failuresFrom(() =>
        validateSocialPlannerEvergreenWeeklyStrategy(
          normalizeEvergreenStrategyNarrativeFields(nullCreative),
          context,
          assigned,
        ),
      ).includes("creativeDirection is required."),
    );

    const arrayCreative = evergreenStrategyRaw(context, {
      creativeDirection: ["Plain", "local"],
    });
    assert.equal(
      normalizeEvergreenStrategyNarrativeFields(arrayCreative).creativeDirection,
      arrayCreative.creativeDirection,
    );
    assert.ok(
      failuresFrom(() =>
        validateSocialPlannerEvergreenWeeklyStrategy(
          normalizeEvergreenStrategyNarrativeFields(arrayCreative),
          context,
          assigned,
        ),
      ).includes("creativeDirection must be a string."),
    );
  });

  it("still rejects other invalid strategy fields after narrative normalization", () => {
    const weeklyObjective = sentence(250, "tail that should be shortened away.");
    const creativeDirection = sentence(
      360,
      "tail that should be shortened away. This extra sentence must not survive.",
      "C",
    );
    const raw = evergreenStrategyRaw(context, {
      schemaVersion: "not-an-evergreen-strategy",
      weeklyObjective,
      creativeDirection,
      narrativeArc: "N".repeat(601),
      formatPlan: evergreenStrategyRaw(context).formatPlan.map((entry, index) =>
        index === 0 ? { ...entry, date: "1999-01-01", contentArchetype: "not-real" } : entry,
      ),
    });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    assert.equal(normalized.schemaVersion, "not-an-evergreen-strategy");
    assert.equal(normalized.narrativeArc, raw.narrativeArc);
    assert.equal(normalized.formatPlan, raw.formatPlan);
    assert.ok(String(normalized.weeklyObjective).length <= 280);
    assert.ok(String(normalized.creativeDirection).length <= 400);

    const reported = failuresFrom(() =>
      validateSocialPlannerEvergreenWeeklyStrategy(normalized, context, assigned),
    );
    assert.equal(
      reported.some((failure) => failure.includes("weeklyObjective exceeds")),
      false,
    );
    assert.equal(
      reported.some((failure) => failure.includes("creativeDirection exceeds")),
      false,
    );
    assert.ok(reported.includes("Evergreen strategy schemaVersion is unsupported."));
    assert.ok(reported.includes("narrativeArc exceeds 600 characters."));
    assert.ok(
      reported.includes(
        `formatPlan[0].date must be ${context.calendarContext.period.dates[0]}.`,
      ),
    );
    assert.ok(reported.includes("formatPlan[0].contentArchetype is unsupported."));
  });

  it("does not end a narrative on an abbreviation or on punctuation alone", () => {
    const head = "A".repeat(190);
    const cases = [
      {
        text: `${head} Dr. Smith reviewed the delayed-care script before the team published the durable week for parents.`,
        included: "Smith",
        excludedEnding: "Dr.",
      },
      {
        text: `${head} in the U.S. market today parents still wait until a school event forces the visit and the draft stays useful.`,
        included: "market",
        excludedEnding: "U.S.",
      },
      {
        text: `${head} e.g. parents who delay preventive care until a school event finally leaves room for the first visit.`,
        included: "parents",
        excludedEnding: "e.g.",
      },
      {
        text: `${head} at 9 a.m. the clinic opens the first visit slot and parents can book before the school run begins tomorrow morning.`,
        included: "clinic",
        excludedEnding: "a.m.",
      },
      {
        text: `${head} at St. Mary clinic parents can book the first visit before the school run and keep one written reminder.`,
        included: "Mary",
        excludedEnding: "St.",
      },
      {
        text: `${head} J. Smith reviewed the delayed-care script before the team published the durable week for parents.`,
        included: "Smith",
        excludedEnding: "J.",
      },
    ];
    for (const sample of cases) {
      assert.ok(sample.text.length > EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS);
      const raw = evergreenStrategyRaw(context, { weeklyObjective: sample.text });
      const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
      const shortened = String(normalized.weeklyObjective);
      assertBoundaryPrefix(
        sample.text,
        shortened,
        EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS,
      );
      assert.equal(shortened.endsWith(sample.excludedEnding), false);
      assert.equal(shortened.includes(sample.included), true);
      assert.equal(normalized.creativeDirection, raw.creativeDirection);
      assert.equal(normalized.formatPlan, raw.formatPlan);
    }

    const earlierSentence = `${"A".repeat(180)}. See Dr. Smith about the script before publishing the rest of this very long explanation that should not survive.`;
    const keptSentence = String(
      normalizeEvergreenStrategyNarrativeFields(
        evergreenStrategyRaw(context, { weeklyObjective: earlierSentence }),
      ).weeklyObjective,
    );
    assert.equal(keptSentence, `${"A".repeat(180)}.`);
    assert.equal(keptSentence.includes("Dr."), false);

    const punctuationOnly = `. ${"A".repeat(300)}`;
    const raw = evergreenStrategyRaw(context, { weeklyObjective: punctuationOnly });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    assert.equal(normalized, raw);
    assert.equal(normalized.weeklyObjective, punctuationOnly);
    assert.deepEqual(
      failuresFrom(() =>
        validateSocialPlannerEvergreenWeeklyStrategy(normalized, context, assigned),
      ),
      ["weeklyObjective exceeds 280 characters."],
    );
  });

  it("leaves a spaceless overlong string unchanged so strict validation still rejects it", () => {
    const weeklyObjective = "A".repeat(281);
    const raw = evergreenStrategyRaw(context, { weeklyObjective });
    const normalized = normalizeEvergreenStrategyNarrativeFields(raw);
    assert.equal(normalized, raw);
    assert.equal(normalized.weeklyObjective, weeklyObjective);
    const reported = failuresFrom(() =>
      validateSocialPlannerEvergreenWeeklyStrategy(normalized, context, assigned),
    );
    assert.deepEqual(reported, ["weeklyObjective exceeds 280 characters."]);
  });

  it("accepts an otherwise valid overlong strategy through the Evergreen generator", async () => {
    const weeklyObjective = `${"A".repeat(249)}. UNIQUE_WEEKLY_TAIL ${"B".repeat(40)}`;
    const creativeDirection = `${"C".repeat(359)}. UNIQUE_CREATIVE_TAIL ${"D".repeat(80)}`;
    const strategyRaw = evergreenStrategyRaw(context, {
      weeklyObjective,
      creativeDirection,
    });
    let calls = 0;
    let assetPrompt = "";
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          calls += 1;
          if (String(options?.stage ?? "").includes("strategy")) {
            return JSON.stringify(strategyRaw);
          }
          assetPrompt = prompt;
          return JSON.stringify(evergreenPackageRaw(context));
        },
      },
    });
    assert.equal(calls, 2);
    assert.equal(generated.package.plannerKind, "evergreen");
    assert.equal(assetPrompt.includes("UNIQUE_WEEKLY_TAIL"), false);
    assert.equal(assetPrompt.includes("UNIQUE_CREATIVE_TAIL"), false);
    const normalized = normalizeEvergreenStrategyNarrativeFields(strategyRaw);
    assert.equal(assetPrompt.includes(String(normalized.weeklyObjective)), true);
    assert.equal(assetPrompt.includes(String(normalized.creativeDirection)), true);
  });

  it("still fails strategy generation when a narrative field is missing", async () => {
    const strategyRaw = evergreenStrategyRaw(context);
    delete (strategyRaw as { weeklyObjective?: unknown }).weeklyObjective;
    let calls = 0;
    try {
      await generateEvergreenSocialCalendarPackage({
        context,
        generationMode: "standard",
        deps: {
          generateReview: async () => {
            calls += 1;
            return JSON.stringify(strategyRaw);
          },
        },
      });
      assert.fail("expected STRATEGY_VALIDATION_FAILED");
    } catch (error) {
      assert.ok(error instanceof SocialPlannerGenerationError);
      assert.equal(error.code, "STRATEGY_VALIDATION_FAILED");
      assert.equal(error.stage, "strategy");
      assert.deepEqual(error.failures, ["weeklyObjective is required."]);
    }
    assert.equal(calls, 1);
  });
});
