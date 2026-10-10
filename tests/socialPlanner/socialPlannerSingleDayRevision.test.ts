import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { GenerateReviewOptions } from "../../services/aiService";
import { generateConversationRevisionSocialCalendar } from "../../services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar";
import { evaluateSingleDayConversationRevisionEligibility } from "../../services/socialPlanner/conversationRevision/singleDayRevisionEligibility";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import type { SocialCalendarAssetV1 } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { buildValidAsset } from "./socialPlannerGenerationFixtures";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION,
  type SocialPlannerConversationRevisionBriefV1,
  type SocialPlannerConversationRevisionContextV1,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  buildValidatedPackage,
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

function brief(
  overrides: Partial<SocialPlannerConversationRevisionBriefV1> = {},
): SocialPlannerConversationRevisionBriefV1 {
  const dates = buildGenerationContext().calendarContext.period.dates;
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
    sourceCalendarId: "cal-v1",
    conversationMessageCount: 2,
    latestUserMessageId: "msg-user-1",
    latestUserMessageAt: "2026-08-20T12:00:00.000Z",
    actionable: true,
    global: {},
    dayChanges: [
      {
        date: dates[0],
        requestedAssetType: "poll",
        requestedChangeSummary: "Turn Monday into a poll.",
      },
    ],
    preserve: dates.slice(1),
    avoid: [],
    ...overrides,
  };
}

function revisionContext(
  overrides: Partial<SocialPlannerConversationRevisionBriefV1> = {},
): SocialPlannerConversationRevisionContextV1 {
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    appliedAt: "2026-08-20T12:00:00.000Z",
    brief: brief(overrides),
  };
}

function pollAsset(
  context: ReturnType<typeof buildGenerationContext>,
  hook: string,
): Record<string, unknown> {
  return buildValidAsset(context, 0, {
    assetType: "poll",
    contentArchetype: "question",
    primaryObjective: "engage",
    topic: "evening booking poll",
    angle: "Which evening should stay open for cleanings",
    hook,
    concept: "Harbor Clinic evening booking poll for families who need a practical choice.",
    productionSpec: {
      kind: "engagement",
      engagementType: "poll",
      prompt: "Which evening should we hold for cleanings?",
      options: ["Tuesday", "Wednesday", "Thursday"],
      visualSupport: "Simple branded story frame, no people required.",
    },
    socialCopy:
      "Families keep asking which evening is easiest for a cleaning, so this poll asks them directly.",
    cta: "Vote for the evening that works.",
  } as Partial<SocialCalendarAssetV1>);
}

const sourceCalendar = {
  id: "cal-v1",
  root_calendar_id: "cal-root",
  version_number: 1,
};

describe("Social Planner single-day conversation revision eligibility", () => {
  const dates = buildGenerationContext().calendarContext.period.dates;

  it("accepts one concrete in-period day change with no week-level fields", () => {
    const result = evaluateSingleDayConversationRevisionEligibility({
      brief: brief(),
      periodDates: dates,
      plannerKind: "daily_social",
    });
    assert.equal(result.eligible, true);
    if (result.eligible) {
      assert.equal(result.targetDate, dates[0]);
      assert.deepEqual(result.preservedDates, dates.slice(1));
    }
  });

  it("keeps Evergreen, multi-day, week-level, and ambiguous briefs on the full week", () => {
    const periodDates = dates;
    const cases: Array<{
      reason: string;
      plannerKind?: "daily_social" | "evergreen";
      periodDates?: string[];
      brief: SocialPlannerConversationRevisionBriefV1;
    }> = [
      {
        reason: "evergreen",
        plannerKind: "evergreen",
        brief: brief(),
      },
      {
        reason: "day_change_count",
        brief: brief({
          dayChanges: [
            { date: dates[0], requestedAssetType: "poll" },
            { date: dates[1], requestedAssetType: "checklist" },
          ],
        }),
      },
      {
        reason: "day_change_count",
        brief: brief({ dayChanges: [] }),
      },
      {
        reason: "date_outside_period",
        brief: brief({
          dayChanges: [
            {
              date: "1999-01-01",
              requestedChangeSummary: "Change a day outside this week.",
            },
          ],
        }),
      },
      {
        reason: "week_level_change_summary",
        brief: brief({ global: { changeSummary: "Refresh the Monday hook." } }),
      },
      {
        reason: "week_level_desired_tone",
        brief: brief({ global: { desiredTone: "warmer" } }),
      },
      {
        reason: "week_level_audience_shift",
        brief: brief({ global: { audienceShift: "parents" } }),
      },
      {
        reason: "week_level_desired_objectives",
        brief: brief({ global: { desiredObjectives: ["educate"] } }),
      },
      {
        reason: "week_level_preferred_formats",
        brief: brief({ global: { preferredFormats: ["poll"] } }),
      },
      {
        reason: "week_level_avoid_formats",
        brief: brief({ global: { avoidFormats: ["meme_or_humor"] } }),
      },
      {
        reason: "week_level_avoid_concepts",
        brief: brief({ global: { avoidConcepts: ["prices"] } }),
      },
      {
        reason: "week_level_avoid",
        brief: brief({ avoid: ["slogans"] }),
      },
      {
        reason: "week_level_keep_themes",
        brief: brief({ global: { keepThemes: ["preventive care"] } }),
      },
      {
        reason: "broader_week_rewrite",
        brief: brief({
          dayChanges: [
            {
              date: dates[0],
              requestedChangeSummary: "Rewrite the whole week starting Monday.",
            },
          ],
        }),
      },
      {
        reason: "ambiguous_day_change",
        brief: brief({ dayChanges: [{ date: dates[0] }] }),
      },
      {
        reason: "ambiguous_preserve",
        brief: brief({ preserve: [dates[0], dates[1]] }),
      },
    ];

    for (const item of cases) {
      const result = evaluateSingleDayConversationRevisionEligibility({
        brief: item.brief,
        periodDates: item.periodDates ?? periodDates,
        plannerKind: item.plannerKind ?? "daily_social",
      });
      assert.equal(result.eligible, false, item.reason);
      if (!result.eligible) {
        assert.equal(result.reason, item.reason);
      }
    }
  });

  it("does not treat a selected card as authorization", () => {
    const eligibility = read(
      "services/socialPlanner/conversationRevision/singleDayRevisionEligibility.ts",
    );
    const apply = read(
      "services/socialPlanner/conversationRevision/applySocialPlannerConversationRevision.ts",
    );
    assert.doesNotMatch(eligibility, /assetReference|selectedCard|selectedDate/);
    assert.doesNotMatch(apply, /scope|targetDate|singleDay/);
    const selectedCardOnly = evaluateSingleDayConversationRevisionEligibility({
      brief: brief({ dayChanges: [{ date: dates[0] }] }),
      periodDates: dates,
      plannerKind: "daily_social",
    });
    assert.equal(selectedCardOnly.eligible, false);
  });
});

describe("Social Planner single-day conversation revision generation", () => {
  it("generates one asset, copies six source assets, and keeps lineage", async () => {
    const context = buildGenerationContext();
    const dates = context.calendarContext.period.dates;
    const sourcePackage = buildValidatedPackage(context);
    const before = structuredClone(sourcePackage);
    const script = scriptedReview([
      JSON.stringify(pollAsset(context, "Which evening should we keep open for cleanings?")),
    ]);

    const result = await generateConversationRevisionSocialCalendar({
      context,
      userGuidance: "Keep evenings bookable.",
      sourceCalendar,
      sourcePackage,
      revisionContext: revisionContext(),
      derivativeVersionNumber: 2,
      deps: {
        historyLoader: { async listReadyCalendars() { return []; } },
        generateReview: script.generateReview,
      },
    });

    assert.equal(script.prompts.length, 1);
    assert.equal(script.metas[0]?.athenaStage, "social_calendar_assets");
    assert.match(script.prompts[0] ?? "", /Generate exactly one Social Calendar asset/);
    assert.match(script.prompts[0] ?? "", /FROZEN REVISION BRIEF/);
    assert.match(script.prompts[0] ?? "", /TRUSTED ORGANIZATION INTELLIGENCE/);
    assert.match(script.prompts[0] ?? "", /CALENDAR FACTS/);
    assert.match(script.prompts[0] ?? "", /TREND SOCIAL PROMPT/);
    assert.match(script.prompts[0] ?? "", /HISTORICAL SOCIAL MEMORY/);
    assert.match(script.prompts[0] ?? "", /PRODUCTION SPEC FAMILIES/);
    assert.match(script.prompts[0] ?? "", /SIX PRESERVED SOURCE ASSETS/);
    assert.doesNotMatch(script.prompts[0] ?? "", /Generate exactly seven daily social assets/);
    assert.doesNotMatch(script.prompts[0] ?? "", /Plan one coherent seven-day/);
    assert.equal(
      script.prompts[0]?.includes(SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION),
      true,
    );

    assert.equal(result.package.assets.length, 7);
    assert.deepEqual(result.package.period, sourcePackage.period);
    assert.equal(result.package.strategySummary, sourcePackage.strategySummary);
    assert.equal(result.package.whyThisWeekWorks, sourcePackage.whyThisWeekWorks);
    assert.equal(result.package.assets[0]?.date, dates[0]);
    assert.equal(result.package.assets[0]?.assetType, "poll");
    assert.equal(result.package.assets[0]?.productionSpec.kind, "engagement");
    for (const [index, date] of dates.slice(1).entries()) {
      assert.deepEqual(result.package.assets[index + 1], sourcePackage.assets[index + 1]);
      assert.equal(result.package.assets[index + 1]?.date, date);
    }
    assert.deepEqual(sourcePackage, before);
    assert.equal(result.revisionSatisfaction.accepted, true);
    assert.equal(result.historicalDiversity.accepted, true);
    assert.equal(result.revisionRepairUsed, false);

    const provenance = result.generationProvenance;
    assert.equal(provenance.singleDayRevision, true);
    assert.deepEqual(provenance.generatedDates, [dates[0]]);
    assert.deepEqual(provenance.copiedDates, dates.slice(1));
    assert.equal(provenance.generatedAssetModel, provenance.stages[0]?.model);
    assert.equal(provenance.stages.length, 1);
    assert.equal(provenance.stages[0]?.pass, "assets");
    assert.equal(
      provenance.stages.some((stage) => stage.pass === "strategy"),
      false,
    );
    assert.equal(provenance.sourceCalendarId, "cal-v1");
    assert.equal(provenance.rootCalendarId, "cal-root");
    assert.equal(provenance.sourceVersionNumber, 1);
    assert.equal(provenance.newVersionNumber, 2);
    assert.equal(provenance.preservedDateCount, 6);
    assert.equal(provenance.revisedDateCount, 1);
    assert.equal(
      provenance.conversationRevisionSingleDayPromptVersion,
      SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
    );
    assert.equal(provenance.conversationRevisionRepairPromptVersion, null);
  });

  it("repairs only the replacement day when it collides with a preserved day", async () => {
    const context = buildGenerationContext();
    const dates = context.calendarContext.period.dates;
    const sourcePackage = buildValidatedPackage(context);
    const before = structuredClone(sourcePackage);
    const colliding = pollAsset(context, sourcePackage.assets[1].hook ?? "shared hook");
    const repaired = pollAsset(
      context,
      "Which evening should we keep open for cleanings?",
    );
    const script = scriptedReview([
      JSON.stringify(colliding),
      JSON.stringify(repaired),
    ]);

    const result = await generateConversationRevisionSocialCalendar({
      context,
      userGuidance: null,
      sourceCalendar,
      sourcePackage,
      revisionContext: revisionContext(),
      derivativeVersionNumber: 2,
      deps: {
        historyLoader: { async listReadyCalendars() { return []; } },
        generateReview: script.generateReview,
      },
    });

    assert.equal(script.prompts.length, 2);
    assert.match(script.prompts[1] ?? "", /Repair exactly one Social Calendar asset/);
    assert.match(script.prompts[1] ?? "", /SIX PRESERVED SOURCE ASSETS \(IMMUTABLE\)/);
    assert.match(script.prompts[1] ?? "", /Duplicate normalized hook/);
    assert.doesNotMatch(script.prompts[1] ?? "", /COMPLETE corrected weekly/);
    assert.equal(result.revisionRepairUsed, true);
    assert.equal(
      result.generationProvenance.conversationRevisionRepairPromptVersion,
      SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION,
    );
    assert.equal(result.package.assets[0]?.assetType, "poll");
    assert.notEqual(result.package.assets[0]?.hook, sourcePackage.assets[1].hook);
    for (const asset of result.package.assets.slice(1)) {
      const sourceAsset = sourcePackage.assets.find((item) => item.date === asset.date);
      assert.deepEqual(asset, sourceAsset);
    }
    assert.deepEqual(
      result.generationProvenance.copiedDates,
      dates.slice(1),
    );
    assert.deepEqual(sourcePackage, before);
    assert.equal(
      result.generationProvenance.stages.some((stage) => stage.pass === "strategy"),
      false,
    );
  });

  it("rejects a repair that returns a weekly package and leaves the source unchanged", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage(context);
    const before = structuredClone(sourcePackage);
    const script = scriptedReview([
      JSON.stringify(pollAsset(context, sourcePackage.assets[1].hook ?? "shared hook")),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    await assert.rejects(
      () =>
        generateConversationRevisionSocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar,
          sourcePackage,
          revisionContext: revisionContext(),
          derivativeVersionNumber: 2,
          deps: {
            historyLoader: { async listReadyCalendars() { return []; } },
            generateReview: script.generateReview,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "CONVERSATION_REVISION_REPAIR_FAILED");
        return true;
      },
    );
    assert.equal(script.prompts.length, 2);
    assert.deepEqual(sourcePackage, before);
  });

  it("preserves the source when single-day generation fails and does not fall back", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage(context);
    const before = structuredClone(sourcePackage);
    const script = scriptedReview(["not json"]);

    await assert.rejects(
      () =>
        generateConversationRevisionSocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar,
          sourcePackage,
          revisionContext: revisionContext(),
          derivativeVersionNumber: 2,
          deps: {
            historyLoader: { async listReadyCalendars() { return []; } },
            generateReview: script.generateReview,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "MALFORMED_STRUCTURED_OUTPUT");
        assert.equal(error.stage, "conversation_revision_single_day");
        return true;
      },
    );
    assert.equal(script.prompts.length, 1);
    assert.doesNotMatch(script.prompts[0] ?? "", /Plan one coherent seven-day/);
    assert.deepEqual(sourcePackage, before);
    assert.equal(isDeepStrictEqual(sourcePackage, before), true);
  });

  it("uses the full-week path for global, multi-day, and ambiguous briefs", async () => {
    const context = buildGenerationContext();
    const dates = context.calendarContext.period.dates;
    const sourcePackage = buildValidatedPackage(context);
    const cases = [
      revisionContext({
        global: { changeSummary: "Refresh Monday." },
        dayChanges: [
          {
            date: dates[0],
            requestedChangeSummary: "Refresh Monday's hook.",
          },
        ],
      }),
      revisionContext({
        dayChanges: [
          { date: dates[0], requestedChangeSummary: "Refresh Monday." },
          { date: dates[1], requestedChangeSummary: "Soften Tuesday." },
        ],
      }),
      revisionContext({ dayChanges: [{ date: dates[0] }] }),
      revisionContext({
        dayChanges: [
          {
            date: dates[0],
            requestedChangeSummary: "Rewrite the whole week starting Monday.",
          },
        ],
      }),
    ];

    for (const revision of cases) {
      const script = scriptedReview([
        JSON.stringify(buildValidStrategyRaw(context)),
        JSON.stringify(buildValidPackageRaw(context)),
      ]);
      const result = await generateConversationRevisionSocialCalendar({
        context,
        userGuidance: null,
        sourceCalendar,
        sourcePackage,
        revisionContext: revision,
        derivativeVersionNumber: 2,
        deps: {
          historyLoader: { async listReadyCalendars() { return []; } },
          generateReview: script.generateReview,
        },
      });
      assert.equal(script.prompts.length, 2);
      assert.match(script.prompts[0] ?? "", /Plan one coherent seven-day/);
      assert.match(script.prompts[1] ?? "", /Generate exactly seven daily social assets/);
      assert.equal(
        script.prompts.some((prompt) =>
          prompt.includes(SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION),
        ),
        false,
      );
      assert.equal(result.generationProvenance.singleDayRevision, false);
      assert.deepEqual(result.generationProvenance.generatedDates, []);
      assert.deepEqual(result.generationProvenance.copiedDates, []);
      assert.equal(result.generationProvenance.generatedAssetModel, null);
    }
  });

  it("leaves Evergreen revisions on the full-week generator", () => {
    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    const revisionStart = executor.indexOf("const generateConversationRevision");
    const revision = executor.slice(
      revisionStart,
      executor.indexOf('currentStage = "diversity"', revisionStart),
    );
    assert.match(revision, /plannerKind === "evergreen"/);
    assert.match(revision, /generateEvergreen\(/);
    assert.match(revision, /generationMode: "conversation_revision"/);
    assert.doesNotMatch(revision, /generateSingleDayConversationRevision/);
    const evergreen = read(
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
    );
    assert.doesNotMatch(evergreen, /generateSingleDayConversationRevision|singleDayRevision/);
    const validation = read(
      "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
    );
    assert.doesNotMatch(validation, /singleDayRevision/);
  });

  it("does not change Apply, day-focused persistence, usage keys, or SQL", () => {
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    const applyRoute = read("app/api/social-planner/[id]/conversation/apply/route.ts");
    const validation = read(
      "services/socialPlanner/conversation/socialPlannerConversationValidation.ts",
    );
    const conversation = read(
      "services/socialPlanner/conversation/socialPlannerConversationService.ts",
    );
    const interactions = read("services/assetInteractions/assetInteractionService.ts");
    const singleDay = read(
      "services/socialPlanner/conversationRevision/generateSingleDayConversationRevision.ts",
    );
    assert.match(client, /body: "\{\}"/);
    assert.match(applyRoute, /normalizeConversationApplyRequest\(body\)/);
    assert.match(
      validation,
      /Apply Athena's Suggestions does not accept generation fields from the browser/,
    );
    assert.match(conversation, /assetReference/);
    assert.doesNotMatch(singleDay, /assetReference/);
    assert.match(interactions, /\.eq\("source_id", input\.sourceId\)/);
    assert.doesNotMatch(singleDay, /athena_asset_interactions|recordAssetCopyInteraction/);
    for (const relativePath of [
      "services/socialPlanner/conversationRevision/singleDayRevisionEligibility.ts",
      "services/socialPlanner/conversationRevision/mergeSingleDayRevisionPackage.ts",
      "services/socialPlanner/conversationRevision/generateSingleDayConversationRevision.ts",
    ]) {
      assert.doesNotMatch(read(relativePath), /supabase|CREATE TABLE|INSERT INTO/i);
    }
  });
});
