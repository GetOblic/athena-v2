import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  type SocialPlannerConversationRevisionContextV1,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { planEvergreenRevisionDates } from "../../services/socialPlanner/generation/evergreenAffectedRevision";
import { generateEvergreenSocialCalendarPackage } from "../../services/socialPlanner/generation/generateEvergreenSocialCalendarPackage";
import { generateSocialCalendarPackage } from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_EVERGREEN_DRAFT_MIN_CHARS,
} from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  buildEvergreenDraftPrompt,
  buildEvergreenStrategyPrompt,
} from "../../services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts";
import {
  EVERGREEN_SOCIAL_PLANNER_MODEL,
  resolveModelForStage,
} from "../../lib/llm/modelRouting";
import { planEvergreenWeekFormats } from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
  validateAndNormalizeSocialCalendarEvergreenPackage,
  validateEvergreenGeneratedDay,
  validateSocialPlannerEvergreenWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import { tryParsePersistedSocialCalendarPackage } from "../../services/socialPlanner/socialCalendarPersistedPackage";
import { isSocialCalendarEvergreenPackage } from "../../services/socialPlanner/generation/socialCalendarPackageUnion";
import type { SocialPlannerGenerationContextV1 } from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  mockEvergreenGenerationResponse,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function proseDraft(seed: string): string {
  return [
    `${seed} opens with a specific Harbor Clinic observation about delayed preventive care.`,
    "Parents wait until a small problem becomes urgent, usually after a school event or a weekend that finally leaves room.",
    "This draft gives a manager a usable piece they can edit today, not a suggestion to start writing later.",
    "The first movement names the delay. The second movement shows the calmer first conversation.",
    "The third movement offers one evening slot, one Saturday slot, and a written reminder the parent can keep.",
    "Close with a restrained next step. Keep the language local and useful.",
    "Parents can keep one written reminder and book one evening slot before the school week closes. The same reminder names the overdue visit, the pickup window, and the cost of waiting another month.",
  ].join("\n\n");
}

function courseDraft(seed: string): string {
  return [
    proseDraft(seed),
    "Course name: Preventive Care Confidence.",
    "Learner outcome: Operators can run a calmer first-visit conversation.",
    "Module 1: The delayed-care pattern.",
    "Module 2: The first-visit script.",
    "Module 3: The follow-up habit.",
  ].join("\n\n");
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

function evergreenPackageRaw(context: SocialPlannerGenerationContextV1) {
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
  return {
    schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen" as const,
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day is a working draft a manager can edit.",
    days: assigned.map((assignment, index) => ({
      date: assignment.date,
      evergreenFormat: assignment.evergreenFormat,
      title: `Harbor ${assignment.evergreenFormat} ${index + 1}`,
      concept: `Angle ${index + 1} for delayed preventive care.`,
      draft:
        assignment.evergreenFormat === "skool_course_idea"
          ? courseDraft(`Day ${index + 1}`)
          : proseDraft(`Day ${index + 1}`),
      cta: "Invite the family to book the overdue visit.",
      publishingGuidance: "Publish in the native format.",
      audience: "Busy parents",
      personaIds: ["persona-parent"],
      topic: `preventive care ${index + 1}`,
      angle: `practical delay ${index + 1}`,
      contentArchetype: "educational",
      primaryObjective: "educate",
      calendarAnchors: [] as Array<Record<string, unknown>>,
      calendarReason: null as string | null,
      sourceSignals: [{ type: "brain", id: null }],
    })),
  };
}

function validatedPackage(context: SocialPlannerGenerationContextV1) {
  return validateAndNormalizeSocialCalendarEvergreenPackage({
    raw: evergreenPackageRaw(context),
    context,
    metadata: {
      ...testMetadata(),
      packageSchemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
      plannerKind: "evergreen",
      strategyPromptVersion: "social_planner_evergreen_strategy_v2",
      assetPromptVersion: "social_planner_evergreen_v1",
    },
    assignedFormats: planEvergreenWeekFormats(context.calendarContext.period.dates),
  });
}

function oneDateRevision(
  context: SocialPlannerGenerationContextV1,
  date: string,
): SocialPlannerConversationRevisionContextV1 {
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    appliedAt: "2026-08-20T12:00:00.000Z",
    brief: {
      schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
      sourceCalendarId: "cal-evergreen-v1",
      conversationMessageCount: 2,
      latestUserMessageId: "msg-user-1",
      latestUserMessageAt: "2026-08-20T12:00:00.000Z",
      actionable: true,
      global: {},
      dayChanges: [
        {
          date,
          requestedChangeSummary: "Retell this day from the evening pickup routine.",
        },
      ],
      preserve: context.calendarContext.period.dates.filter((entry) => entry !== date),
      avoid: [],
    },
  };
}

describe("Evergreen weekly generation", () => {
  it("uses one strategy call and one weekly asset call, then persists seven drafts", async () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const packageRaw = evergreenPackageRaw(context);
    const fullDraft = `${proseDraft("FULL_DRAFT")} UNIQUE_DRAFT_TAIL ${"local reminder ".repeat(80)}`;
    assert.ok(fullDraft.length > SOCIAL_PLANNER_EVERGREEN_DRAFT_MIN_CHARS.blog_post_idea);
    packageRaw.days[0].draft = fullDraft;
    packageRaw.days[0].title = `${"Saturday Harbor title ".repeat(40)}UNIQUE_TITLE_TAIL`;
    assert.ok(packageRaw.days[0].title.length > 500);
    const strategyRaw = evergreenStrategyRaw(context, {
      formatPlan: evergreenStrategyRaw(context).formatPlan.map((entry, index) =>
        index === 0 ? { ...entry, evergreenFormat: "reddit_post" } : entry,
      ),
    });
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: strategyRaw,
            days: packageRaw.days,
          });
        },
      },
    });

    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
    ]);
    assert.equal(generated.package.generationMetadata.repairUsed, false);
    assert.equal(
      generated.package.generationMetadata.stages.filter((stage) => stage.pass === "strategy")
        .length,
      1,
    );
    assert.equal(
      generated.package.generationMetadata.stages.filter((stage) => stage.pass === "assets")
        .length,
      1,
    );
    assert.equal(
      generated.package.generationMetadata.stages[0]?.athenaStage,
      "social_calendar_evergreen_strategy",
    );
    assert.equal(
      generated.package.generationMetadata.stages[1]?.athenaStage,
      "social_calendar_evergreen_assets",
    );
    assert.equal(generated.package.generationMetadata.stages[0]?.model, EVERGREEN_SOCIAL_PLANNER_MODEL);
    assert.equal(generated.package.generationMetadata.stages[1]?.model, EVERGREEN_SOCIAL_PLANNER_MODEL);
    assert.equal(generated.package.generationMetadata.stages[1]?.role, "premiumStrategicOutput");
    assert.equal(generated.package.days.length, 7);
    assert.deepEqual(
      generated.package.days.map((day) => day.date),
      context.calendarContext.period.dates,
    );
    assert.deepEqual(
      generated.package.days.map((day) => day.evergreenFormat),
      assigned.map((entry) => entry.evergreenFormat),
    );
    assert.equal(generated.package.days[0].draft, fullDraft.trim());
    assert.ok(generated.package.days[0].draft.endsWith("reminder"));
    assert.equal(generated.package.days[0].title, packageRaw.days[0].title.trim());
    assert.equal(generated.package.schemaVersion, "social_calendar_evergreen_package_v1");
    assert.equal(generated.package.plannerKind, "evergreen");
    assert.equal("assets" in generated.package, false);
    const persisted = tryParsePersistedSocialCalendarPackage(generated.package);
    assert.ok(persisted);
    assert.equal(isSocialCalendarEvergreenPackage(persisted), true);
    assert.equal(persisted.schemaVersion, SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION);
  });

  it("stamps deterministic formats and does not treat the strategy model as the format authority", () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const raw = evergreenStrategyRaw(context, {
      formatPlan: evergreenStrategyRaw(context).formatPlan.map((entry, index) =>
        index === 0 ? { ...entry, evergreenFormat: "skool_post" } : entry,
      ),
    });
    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(raw, context, assigned);
    assert.deepEqual(
      strategy.formatPlan.map((entry) => entry.evergreenFormat),
      assigned.map((entry) => entry.evergreenFormat),
    );
    const prompt = buildEvergreenStrategyPrompt({
      context,
      userGuidance: null,
      assignedFormats: assigned,
    });
    assert.match(prompt, /strategySummary/);
    assert.match(prompt, /whyThisWeekWorks/);
    assert.match(prompt, /Do not return evergreenFormat/);
    assert.doesNotMatch(prompt, /MUST copy the assigned format/);
    assert.doesNotMatch(prompt, /"evergreenFormat": string/);
  });

  it("writes every assigned format into one JSON package without plain-text asset headings", () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      evergreenStrategyRaw(context),
      context,
      assigned,
    );
    const prompt = buildEvergreenDraftPrompt({
      context,
      userGuidance: null,
      strategy,
      assignedFormats: assigned,
    });
    assert.match(prompt, /social_calendar_evergreen_package_v1/);
    assert.match(prompt, /exactly seven Evergreen drafts/);
    assert.match(prompt, /Reddit-native/);
    assert.match(prompt, /learner outcome/);
    assert.match(prompt, /"draft": string/);
    assert.match(prompt, /Return ONLY valid JSON/);
    for (const assignment of assigned) {
      assert.match(prompt, new RegExp(`"date": "${assignment.date}"`));
      assert.match(
        prompt,
        new RegExp(`"evergreenFormat": "${assignment.evergreenFormat}"`),
      );
    }
    assert.doesNotMatch(prompt, /REDDIT_POST:/);
    assert.doesNotMatch(prompt, /SUBSTACK_POST:/);
    assert.doesNotMatch(prompt, /SKOOL_COURSE_IDEA:/);
    assert.doesNotMatch(prompt, /Return ONLY plain text/);
    assert.doesNotMatch(prompt, /Return one JSON object for that day/);
    assert.doesNotMatch(prompt, /Hidden Dental Group LLC/);
    assert.doesNotMatch(prompt, /prospect-secret/);
    assert.match(prompt, /Harbor Clinic/);
  });

  it("repairs one structurally invalid weekly package and preserves the other drafts", async () => {
    const context = buildGenerationContext();
    const valid = evergreenPackageRaw(context);
    const invalid = evergreenPackageRaw(context);
    delete (invalid.days[0] as { draft?: unknown }).draft;
    valid.days[6].title = "UNIQUE_OTHER_DAY_TITLE";
    valid.days[6].draft = `${proseDraft("Kept day")} UNIQUE_OTHER_DAY_DRAFT`;
    invalid.days[6].title = valid.days[6].title;
    invalid.days[6].draft = valid.days[6].draft;
    let repairPrompt = "";
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          if (stage.includes("repair")) repairPrompt = prompt;
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: stage.includes("repair") ? valid.days : invalid.days,
          });
        },
      },
    });
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
      "socialPlanner.evergreen.repair",
    ]);
    assert.match(repairPrompt, /social_calendar_evergreen_package_v1/);
    assert.match(repairPrompt, /days\[0\]\.draft is required/);
    assert.doesNotMatch(repairPrompt, /ASSIGNED_DATE:/);
    assert.doesNotMatch(repairPrompt, /Return ONLY plain text/);
    assert.equal(generated.package.generationMetadata.repairUsed, true);
    assert.equal(generated.package.days[0].draft, valid.days[0].draft);
    assert.equal(generated.package.days[6].title, "UNIQUE_OTHER_DAY_TITLE");
    assert.equal(generated.package.days[6].draft, valid.days[6].draft.trim());
    assert.equal(
      generated.package.generationMetadata.stages.filter((stage) => stage.pass === "repair")
        .length,
      1,
    );
    const repairStage = generated.package.generationMetadata.stages.find(
      (stage) => stage.pass === "repair",
    );
    assert.equal(repairStage?.role, "premiumStrategicOutput");
    assert.equal(repairStage?.model, EVERGREEN_SOCIAL_PLANNER_MODEL);
    assert.equal(repairStage?.athenaStage, "social_calendar_evergreen_repair");
  });

  it("does not repair an editorially long day", async () => {
    const context = buildGenerationContext();
    const packageRaw = evergreenPackageRaw(context);
    const longTitle = `${"Harbor Saturday draft ".repeat(30)}UNIQUE_LONG_TITLE`;
    const longDraft = `${proseDraft("Long day")} ${"Parents keep the written reminder. ".repeat(120)}`;
    assert.ok(longTitle.length > 500);
    assert.ok(longDraft.length > 2000);
    assert.ok(JSON.stringify({ draft: longDraft }).length < 16_000);
    packageRaw.days[6].title = longTitle;
    packageRaw.days[6].draft = longDraft;
    packageRaw.days[6].calendarReason = `${"The Saturday explanation stays intact. ".repeat(12)}`;
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: packageRaw.days,
          });
        },
      },
    });
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
    ]);
    assert.equal(generated.package.generationMetadata.repairUsed, false);
    assert.equal(generated.package.days[6].title, longTitle.trim());
    assert.equal(generated.package.days[6].draft, longDraft.trim());
    assert.equal(
      generated.package.days[6].calendarReason,
      String(packageRaw.days[6].calendarReason).trim(),
    );
  });

  it("does not spend a repair call on a JSON size budget failure", async () => {
    const context = buildGenerationContext();
    const packageRaw = evergreenPackageRaw(context);
    packageRaw.days[3].draft = `${proseDraft("Budget")} ${"Parents keep the written reminder. ".repeat(800)}`;
    assert.ok(JSON.stringify(packageRaw.days[3]).length > 16_000);
    const stages: string[] = [];
    try {
      await generateEvergreenSocialCalendarPackage({
        context,
        generationMode: "standard",
        deps: {
          generateReview: async (prompt, options) => {
            const stage = String(options?.stage ?? "");
            stages.push(stage);
            return mockEvergreenGenerationResponse({
              prompt,
              stage,
              strategy: evergreenStrategyRaw(context),
              days: packageRaw.days,
            });
          },
        },
      });
      assert.fail("expected PACKAGE_VALIDATION_FAILED");
    } catch (error) {
      assert.ok(error instanceof SocialPlannerGenerationError);
      assert.equal(error.code, "PACKAGE_VALIDATION_FAILED");
      assert.equal(error.stage, "validation");
      assert.ok(
        error.failures.some((failure) => /exceeds the 16000 character budget/.test(failure)),
      );
    }
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
    ]);
  });

  it("rejects a bad anchor, a foreign geography, and a Prospect name", () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const unknown = evergreenPackageRaw(context).days[0];
    unknown.calendarAnchors = [
      {
        sourceCandidateId: "invented-christmas:2026-05-10",
        date: assigned[0].date,
        label: "Christmas",
        category: "public_holiday",
        scope: "global",
        reason: "Model memory",
      },
    ];
    assert.throws(
      () =>
        validateEvergreenGeneratedDay({
          raw: unknown,
          dayIndex: 0,
          expectedDate: assigned[0].date,
          assignedFormat: assigned[0].evergreenFormat,
          context,
        }),
      (error: unknown) =>
        error instanceof SocialCalendarPackageValidationError &&
        error.failures.some((failure) => /unknown calendar opportunity/i.test(failure)),
    );

    const foreignContext = buildGenerationContext();
    const foreignDate = foreignContext.calendarContext.period.dates[1];
    const foreign = {
      id: `test-holiday:GB:${foreignDate}`,
      label: "Bank Holiday",
      date: foreignDate,
      category: "civic_observance" as const,
      scope: "country" as const,
      jurisdictionCountryCode: "GB",
      jurisdictionRegionCode: null,
      jurisdictionHemisphere: null,
      selectionStatus: "candidate" as const,
      ruleId: "test-holiday",
      observedKind: "actual" as const,
      providerRule: "test",
    };
    foreignContext.calendarContext.opportunities.push(foreign);
    const foreignDay = evergreenPackageRaw(foreignContext).days[1];
    foreignDay.calendarAnchors = [
      {
        sourceCandidateId: foreign.id,
        date: foreign.date,
        label: foreign.label,
        category: foreign.category,
        scope: foreign.scope,
        reason: "Foreign",
      },
    ];
    assert.throws(
      () =>
        validateEvergreenGeneratedDay({
          raw: foreignDay,
          dayIndex: 1,
          expectedDate: foreignDate,
          assignedFormat: planEvergreenWeekFormats(foreignContext.calendarContext.period.dates)[1]
            .evergreenFormat,
          context: foreignContext,
        }),
      (error: unknown) =>
        error instanceof SocialCalendarPackageValidationError &&
        error.failures.some((failure) => /outside the trusted jurisdiction/i.test(failure)),
    );

    const leaked = evergreenPackageRaw(context).days[2];
    leaked.draft = `${proseDraft("Leak")} Hidden Dental Group LLC should stay unnamed.`;
    assert.throws(
      () =>
        validateEvergreenGeneratedDay({
          raw: leaked,
          dayIndex: 2,
          expectedDate: assigned[2].date,
          assignedFormat: assigned[2].evergreenFormat,
          context,
        }),
      (error: unknown) =>
        error instanceof SocialCalendarPackageValidationError &&
        error.failures.some((failure) => /Prospect identifiers/i.test(failure)),
    );
  });

  it("repairs a Prospect leak in one weekly repair and keeps the other drafts", async () => {
    const context = buildGenerationContext();
    const valid = evergreenPackageRaw(context);
    const invalid = evergreenPackageRaw(context);
    invalid.days[2].draft = `${proseDraft("Leak")} Hidden Dental Group LLC should stay unnamed.`;
    valid.days[4].draft = `${proseDraft("Kept")} UNIQUE_CLEAN_DAY`;
    invalid.days[4].draft = valid.days[4].draft;
    let repairPrompt = "";
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          if (stage.includes("repair")) repairPrompt = prompt;
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: stage.includes("repair") ? valid.days : invalid.days,
          });
        },
      },
    });
    assert.match(repairPrompt, /social_calendar_evergreen_package_v1/);
    assert.match(repairPrompt, /Hidden Dental Group LLC/);
    assert.equal(generated.package.generationMetadata.repairUsed, true);
    assert.equal(
      generated.package.generationMetadata.stages.filter((stage) => stage.pass === "repair")
        .length,
      1,
    );
    assert.equal(generated.package.days[2].draft.includes("Hidden Dental Group LLC"), false);
    assert.ok(generated.package.days[4].draft.includes("UNIQUE_CLEAN_DAY"));
  });

  it("keeps Think Differently on the assigned formats", async () => {
    const context = buildGenerationContext();
    const source = validatedPackage(context);
    const revised = evergreenPackageRaw(context);
    revised.days = revised.days.map((day, index) => ({
      ...day,
      title: `Different angle ${index + 1}`,
      angle: `new framing ${index + 1}`,
      draft:
        day.evergreenFormat === "skool_course_idea"
          ? courseDraft(`Different ${index + 1}`)
          : proseDraft(`Different ${index + 1}`),
    }));
    const stages: string[] = [];
    let sawAddendum = false;
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "think_differently",
      sourcePackage: source,
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          if (stage === "socialPlanner.evergreen.assets") {
            sawAddendum = prompt.includes("THINK DIFFERENTLY");
            assert.match(
              prompt,
              new RegExp(`"evergreenFormat": "${revised.days[0].evergreenFormat}"`),
            );
          }
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: revised.days,
          });
        },
      },
    });
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
    ]);
    assert.equal(sawAddendum, true);
    assert.deepEqual(
      generated.package.days.map((day) => day.evergreenFormat),
      source.days.map((day) => day.evergreenFormat),
    );
    assert.equal(generated.package.days[0].title, "Different angle 1");
  });

  it("regenerates one conversation-revision date and copies the other six days", async () => {
    const context = buildGenerationContext();
    const source = validatedPackage(context);
    const target = context.calendarContext.period.dates[3];
    const plan = planEvergreenRevisionDates({
      brief: oneDateRevision(context, target).brief,
      periodDates: context.calendarContext.period.dates,
    });
    assert.equal(plan.safePartial, true);
    if (plan.safePartial) assert.deepEqual(plan.dates, [target]);
    const weekLevel = planEvergreenRevisionDates({
      brief: {
        ...oneDateRevision(context, target).brief,
        global: { changeSummary: "Rewrite the tone of the week." },
      },
      periodDates: context.calendarContext.period.dates,
    });
    assert.equal(weekLevel.safePartial, false);

    const replacement = evergreenPackageRaw(context).days[3];
    replacement.draft = `${proseDraft("Revised Thursday")} UNIQUE_REVISED_DAY`;
    replacement.title = "Revised Thursday title";
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "conversation_revision",
      sourcePackage: source,
      revisionContext: oneDateRevision(context, target),
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: context.calendarContext.period.dates.map((date, index) =>
              date === target ? replacement : source.days[index],
            ),
          });
        },
      },
    });
    assert.deepEqual(stages, ["socialPlanner.evergreen.day"]);
    assert.equal(
      generated.package.generationMetadata.stages[0]?.model,
      EVERGREEN_SOCIAL_PLANNER_MODEL,
    );
    assert.equal(
      generated.package.generationMetadata.stages[0]?.athenaStage,
      "social_calendar_evergreen_assets",
    );
    assert.equal(generated.package.days[3].title, "Revised Thursday title");
    assert.ok(generated.package.days[3].draft.includes("UNIQUE_REVISED_DAY"));
    for (const [index, day] of generated.package.days.entries()) {
      if (day.date === target) continue;
      assert.equal(JSON.stringify(day), JSON.stringify(source.days[index]));
    }
    assert.deepEqual(
      generated.package.days.map((day) => day.evergreenFormat),
      source.days.map((day) => day.evergreenFormat),
    );
  });

  it("leaves Daily Social Planner on one weekly asset call", async () => {
    const evergreen = read(
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
    );
    const daily = read(
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
    );
    assert.doesNotMatch(evergreen, /generateSocialCalendarPackage\(/);
    assert.doesNotMatch(evergreen, /productionSpec/);
    assert.doesNotMatch(evergreen, /socialCopy/);
    assert.doesNotMatch(evergreen, /historicalDiversity|generateHistoricallyDiverse/);
    assert.doesNotMatch(daily, /generateEvergreenSocialCalendarPackage/);
    assert.doesNotMatch(daily, /validateEvergreenGeneratedDay/);

    const context = buildGenerationContext();
    let calls = 0;
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async () => {
          calls += 1;
          if (calls === 1) return JSON.stringify(buildValidStrategyRaw(context));
          return JSON.stringify(buildValidPackageRaw(context));
        },
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.package.schemaVersion, SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION);
    assert.equal(result.package.assets.length, 7);
    assert.equal("days" in result.package, false);
    assert.equal(
      result.package.generationMetadata.stages[0]?.athenaStage,
      "social_calendar_strategy",
    );
    assert.equal(
      result.package.generationMetadata.stages[1]?.athenaStage,
      "social_calendar_assets",
    );
    assert.equal(
      result.package.generationMetadata.stages[0]?.model,
      resolveModelForStage("social_calendar_strategy").model,
    );
    assert.equal(
      result.package.generationMetadata.stages[1]?.model,
      resolveModelForStage("social_calendar_assets").model,
    );
    assert.match(daily, /const STRATEGY_STAGE = "social_calendar_strategy"/);
    assert.match(daily, /const ASSET_STAGE = "social_calendar_assets"/);
    assert.match(daily, /const REPAIR_STAGE = "social_calendar_repair"/);
    assert.doesNotMatch(daily, /social_calendar_evergreen_/);
    assert.equal(
      resolveModelForStage("social_calendar_evergreen_assets").model,
      EVERGREEN_SOCIAL_PLANNER_MODEL,
    );
  });
});
