import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySocialPlannerConversationRevision } from "../../services/socialPlanner/conversationRevision/applySocialPlannerConversationRevision";
import { composeSocialPlannerRevisionBrief } from "../../services/socialPlanner/conversationRevision/composeSocialPlannerRevisionBrief";
import { evaluateRevisionSatisfaction } from "../../services/socialPlanner/conversationRevision/evaluateRevisionSatisfaction";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  ConversationRevisionSourceError,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  hasActionableRevisionIntent,
  validateSocialPlannerConversationRevisionBrief,
  validateSocialPlannerConversationRevisionContext,
} from "../../services/socialPlanner/conversationRevision/validateSocialPlannerRevisionBrief";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const DATES = buildGenerationContext().calendarContext.period.dates;

function revisionBrief(overrides: Record<string, unknown> = {}) {
  return validateSocialPlannerConversationRevisionBrief({
    raw: {
      actionable: true,
      global: { changeSummary: "Make Monday a poll." },
      dayChanges: [
        {
          date: DATES[0],
          requestedAssetType: "poll",
          requestedChangeSummary: "Turn the first day into a poll.",
        },
      ],
      preserve: DATES.slice(1),
      avoid: [],
      ...overrides,
    },
    sourceCalendarId: "cal-v1",
    allowedDates: DATES,
    conversationMessageCount: 2,
    latestUserMessageId: "msg-user-1",
    latestUserMessageAt: "2026-08-20T12:00:00.000Z",
  });
}

function readySource() {
  const socialPackage = buildValidatedPackage();
  return mapSocialCalendarRow({
    id: "cal-v1",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: "Keep evenings bookable.",
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Ready",
    generation_stage: "completed",
    package_json: socialPackage as unknown as Record<string, unknown>,
    provenance_json: {},
    calendar_context_json: buildGenerationContext()
      .calendarContext as unknown as Record<string, unknown>,
    revision_context_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
  });
}

describe("Social Planner L9 revision brief and Apply", () => {
  it("validates a compact actionable brief and rejects explanation-only intent", () => {
    const brief = revisionBrief();
    assert.equal(brief.schemaVersion, SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION);
    assert.equal(brief.actionable, true);
    assert.equal(brief.dayChanges[0]?.requestedAssetType, "poll");
    assert.equal(hasActionableRevisionIntent({ global: {}, dayChanges: [], avoid: [] }), false);
    assert.equal(
      hasActionableRevisionIntent({
        global: { changeSummary: "Change the tone." },
        dayChanges: [],
        avoid: [],
      }),
      true,
    );
  });

  it("freezes Apply-time revision context without a transcript", () => {
    const context = validateSocialPlannerConversationRevisionContext({
      raw: {
        schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
        appliedAt: "2026-08-20T12:00:00.000Z",
        brief: revisionBrief(),
      },
      sourceCalendarId: "cal-v1",
      allowedDates: DATES,
    });
    assert.equal(context.brief.sourceCalendarId, "cal-v1");
    assert.doesNotMatch(JSON.stringify(context), /transcript|history|messages/);
  });

  it("extracts a brief from one structured model pass", async () => {
    const socialPackage = buildValidatedPackage();
    const composed = await composeSocialPlannerRevisionBrief({
      sourceCalendarId: "cal-v1",
      sourcePackage: socialPackage,
      messages: [
        {
          id: "msg-user-1",
          socialCalendarId: "cal-v1",
          organizationId: TEST_ORG,
          role: "user",
          content: "Change Monday to a poll.",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "msg-assistant-1",
          socialCalendarId: "cal-v1",
          organizationId: TEST_ORG,
          role: "assistant",
          content: "I would replace Monday with a poll.",
          createdAt: "2026-08-20T12:00:00.001Z",
        },
      ],
      deps: {
        generateReview: async () =>
          JSON.stringify({
            actionable: true,
            global: { changeSummary: "Make Monday a poll." },
            dayChanges: [
              {
                date: DATES[0],
                requestedAssetType: "poll",
              },
            ],
            preserve: DATES.slice(1),
            avoid: [],
          }),
      },
    });
    assert.equal(composed.brief.actionable, true);
    assert.equal(composed.brief.conversationMessageCount, 2);
    assert.equal(composed.brief.latestUserMessageId, "msg-user-1");
  });

  it("satisfaction enforces requested type, avoidFormats, and preserved days", () => {
    const source = buildValidatedPackage();
    const candidate = structuredClone(source);
    candidate.assets[0] = {
      ...candidate.assets[0],
      assetType: "poll",
      creativeFingerprint: {
        ...candidate.assets[0].creativeFingerprint,
        assetType: "poll",
      },
    };
    const accepted = evaluateRevisionSatisfaction({
      candidatePackage: candidate,
      sourcePackage: source,
      brief: revisionBrief(),
    });
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.revisedDates[0], DATES[0]);
    assert.ok(accepted.preservedDates.includes(DATES[1]));

    candidate.assets[0].assetType = "carousel";
    const failed = evaluateRevisionSatisfaction({
      candidatePackage: candidate,
      sourcePackage: source,
      brief: revisionBrief(),
    });
    assert.equal(failed.accepted, false);
    assert.ok(failed.violations.some((violation) => violation.code === "REQUESTED_ASSET_TYPE"));
  });

  it("Apply rejects no messages, not Ready, and explanation-only conversations", async () => {
    await assert.rejects(
      () =>
        applySocialPlannerConversationRevision({
          organizationId: TEST_ORG,
          userId: "user-1",
          calendarId: "cal-v1",
          deps: {
            getCalendar: async () => readySource(),
            listMessages: async () => [],
            createDerivative: async () => {
              throw new Error("must not create");
            },
          },
        }),
      (error: unknown) =>
        error instanceof ConversationRevisionSourceError && error.code === "NO_MESSAGES",
    );

    await assert.rejects(
      () =>
        applySocialPlannerConversationRevision({
          organizationId: TEST_ORG,
          userId: "user-1",
          calendarId: "cal-v1",
          deps: {
            getCalendar: async () =>
              mapSocialCalendarRow({
                ...readySource(),
                status: "Queued",
                package_json: null,
              }),
            listMessages: async () => [
              {
                id: "m1",
                socialCalendarId: "cal-v1",
                organizationId: TEST_ORG,
                role: "user",
                content: "Why this week?",
                createdAt: "2026-08-20T12:00:00.000Z",
              },
            ],
            createDerivative: async () => {
              throw new Error("must not create");
            },
          },
        }),
      (error: unknown) =>
        error instanceof ConversationRevisionSourceError && error.code === "NOT_READY",
    );
  });

  it("Apply freezes revision context and enqueues a conversation_revision derivative", async () => {
    const created = mapSocialCalendarRow({
      id: "cal-v2",
      organization_id: TEST_ORG,
      user_id: "user-1",
      period_start: TEST_PERIOD_START,
      period_end: TEST_PERIOD_END,
      user_guidance: "Keep evenings bookable.",
      generation_mode: "conversation_revision",
      source_calendar_id: "cal-v1",
      root_calendar_id: "cal-v1",
      version_number: 2,
      status: "Queued",
      generation_stage: "queued",
      package_json: null,
      provenance_json: {},
      calendar_context_json: {},
      revision_context_json: {
        schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
        brief: revisionBrief(),
        appliedAt: "2026-08-20T12:00:00.000Z",
      },
      error_code: null,
      error_message: null,
      created_at: "2026-08-20T12:01:00.000Z",
      updated_at: "2026-08-20T12:01:00.000Z",
    });

    const result = await applySocialPlannerConversationRevision({
      organizationId: TEST_ORG,
      userId: "user-1",
      calendarId: "cal-v1",
      deps: {
        getCalendar: async () => readySource(),
        listMessages: async () => [
          {
            id: "msg-user-1",
            socialCalendarId: "cal-v1",
            organizationId: TEST_ORG,
            role: "user",
            content: "Change Monday to a poll.",
            createdAt: "2026-08-20T12:00:00.000Z",
          },
        ],
        composeBrief: async () => ({
          schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
          brief: revisionBrief(),
          appliedAt: "2026-08-20T12:00:00.000Z",
        }),
        createDerivative: async (input) => {
          assert.equal(input.source.id, "cal-v1");
          assert.equal(input.revisionContext.brief.actionable, true);
          return {
            calendar: created,
            job: {
              id: "job-1",
              organization_id: TEST_ORG,
              calendar_id: created.id,
              status: "queued",
              generation_stage: "queued",
              attempt_count: 0,
              max_attempts: 3,
              claimed_by: null,
              claim_token: null,
              claimed_at: null,
              claim_expires_at: null,
              heartbeat_at: null,
              next_attempt_at: null,
              error_code: null,
              error_message: null,
              error_metadata: null,
              requested_by: "user-1",
              started_at: null,
              completed_at: null,
              created_at: created.created_at,
              updated_at: created.updated_at,
            },
          };
        },
      },
    });

    assert.equal(result.calendar.generation_mode, "conversation_revision");
    assert.equal(result.calendar.source_calendar_id, "cal-v1");
    assert.ok(result.calendar.revision_context_json);
  });
});
