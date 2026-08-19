import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import { generateConversationRevisionSocialCalendar } from "../../services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar";
import { evaluateHistoricalDiversity } from "../../services/socialPlanner/diversity/evaluateHistoricalDiversity";
import { composeSocialPlannerSocialMemory } from "../../services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import { generateSocialCalendarPackage } from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  type SocialPlannerConversationRevisionContextV1,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  TEST_ORG,
  buildGenerationContext,
  buildHistoryRow,
  buildValidatedPackage,
  buildValidPackageRaw,
  buildValidStrategyRaw,
} from "./socialPlannerGenerationFixtures";

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

function revisionContext(): SocialPlannerConversationRevisionContextV1 {
  const dates = buildGenerationContext().calendarContext.period.dates;
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    appliedAt: "2026-08-20T12:00:00.000Z",
    brief: {
      schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
      sourceCalendarId: "cal-v1",
      conversationMessageCount: 2,
      latestUserMessageId: "msg-user-1",
      latestUserMessageAt: "2026-08-20T12:00:00.000Z",
      actionable: true,
      global: { changeSummary: "Make Monday a poll." },
      dayChanges: [
        {
          date: dates[0],
          requestedChangeSummary: "Refresh Monday's hook without changing the week.",
        },
      ],
      preserve: dates.slice(1),
      avoid: [],
    },
  };
}

describe("Social Planner L9 conversation revision generation", () => {
  it("L4 requires frozen revision context and injects preservation extras", async () => {
    const context = buildGenerationContext();
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

    const sourcePackage = buildValidatedPackage();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "conversation_revision",
      revisionContext: revisionContext(),
      sourcePackage,
      deps: { generateReview: script.generateReview },
    });
    assert.equal(result.package.generationMetadata.generationMode, "conversation_revision");
    assert.match(script.prompts[0], /CONVERSATION REVISION/);
    assert.match(script.prompts[0], /FROZEN REVISION CONTEXT/);
    assert.doesNotMatch(script.prompts[0], /THINK DIFFERENTLY \(CREATIVE DIVERGENCE\)/);
  });

  it("does not reject preserved source days merely for matching the source", () => {
    const source = buildValidatedPackage();
    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows: [
        buildHistoryRow({
          id: "cal-v1",
          createdAt: "2026-08-01T00:00:00.000Z",
          socialPackage: source,
        }),
      ],
    });
    const preserved = evaluateHistoricalDiversity({
      candidatePackage: source,
      socialMemory: memory,
      revisionMode: {
        sourceCalendarId: "cal-v1",
        preservedDates: source.period.dates.slice(1),
      },
    });
    assert.equal(
      preserved.violations.some(
        (violation) =>
          violation.historicalCalendarId === "cal-v1" &&
          violation.candidateDate === source.period.dates[1],
      ),
      false,
    );

    const standard = evaluateHistoricalDiversity({
      candidatePackage: source,
      socialMemory: memory,
    });
    assert.equal(standard.accepted, false);
  });

  it("generates a revision, checks satisfaction, and records compact provenance", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateConversationRevisionSocialCalendar({
      context,
      userGuidance: "Keep evenings bookable.",
      sourceCalendar: {
        id: "cal-v1",
        root_calendar_id: null,
        version_number: 1,
      },
      sourcePackage,
      revisionContext: revisionContext(),
      derivativeVersionNumber: 2,
      deps: {
        historyLoader: {
          async listReadyCalendars() {
            return [];
          },
        },
        generateReview: script.generateReview,
      },
    });
    assert.equal(result.package.generationMetadata.generationMode, "conversation_revision");
    assert.equal(result.revisionSatisfaction.accepted, true);
    assert.equal(result.revisionRepairUsed, false);
    assert.equal(result.generationProvenance.generationMode, "conversation_revision");
    assert.equal(result.generationProvenance.conversationMessageCount, 2);
    assert.equal(result.generationProvenance.latestUserMessageId, "msg-user-1");
    assert.doesNotMatch(
      JSON.stringify(result.generationProvenance),
      /Change Monday|transcript/,
    );
  });
});
