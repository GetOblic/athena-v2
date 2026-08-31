import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveSocialPlannerConversationDailyAsset } from "../../services/socialPlanner/conversation/socialPlannerConversationAssetResolve";
import {
  composeSocialPlannerConversationContext,
  formatFrozenSocialCalendarPackage,
  formatSelectedSocialPlannerDailyAsset,
} from "../../services/socialPlanner/conversation/socialPlannerConversationContext";
import { buildSocialPlannerConversationPrompt } from "../../services/socialPlanner/conversation/socialPlannerConversationPrompt";
import {
  sendSocialPlannerConversation,
} from "../../services/socialPlanner/conversation/socialPlannerConversationService";
import {
  SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE,
  SocialPlannerConversationError,
} from "../../services/socialPlanner/conversation/socialPlannerConversationTypes";
import { validateSocialPlannerConversationRequest } from "../../services/socialPlanner/conversation/socialPlannerConversationValidation";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import type { SocialCalendarPackageV1 } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function readyCalendar(
  overrides: Partial<Record<string, unknown>> = {},
): SocialCalendar {
  const context = buildGenerationContext();
  const socialPackage = buildValidatedPackage(context);
  return mapSocialCalendarRow({
    id: "cal-discuss-1",
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
    calendar_context_json: context.calendarContext as unknown as Record<string, unknown>,
    revision_context_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner V30 L2 daily-asset Discuss UI", () => {
  it("exposes Discuss with Athena on every Ready daily card beside Copy / Continue", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");

    assert.match(card, /copy\.discussWithAthena/);
    assert.match(card, /data-asset-actions/);
    assert.match(card, /onDiscussWithAthena\(\{ date: asset\.date \}\)/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /showContinue/);
    assert.match(spec, /showContinue=\{false\}/);
    assert.match(detail, /onDiscussWithAthena=\{handleDiscussWithAthena\}/);
    assert.match(detail, /assets\.map\(\(asset\) =>/);
    assert.match(detail, /SocialCalendarDayCard/);
  });

  it("reuses the existing Ask Athena panel and shows selected-day focus", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");

    assert.match(detail, /data-ask-athena-slot/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(detail, /setDiscussAssetReference\(\{ date: reference\.date \}\)/);
    assert.match(detail, /social-planner-conversation/);
    assert.match(detail, /scrollIntoView/);
    assert.match(detail, /formatSocialPlannerDiscussingLabel/);
    assert.doesNotMatch(detail, /SocialPlannerDailyAsk|DiscussModal|createPortal/);
    assert.equal((detail.match(/<SocialPlannerAskAthenaPanel/g) ?? []).length, 1);

    assert.match(panel, /copy\.askAthenaTitle/);
    assert.match(panel, /data-social-planner-discuss-focus/);
    assert.match(panel, /discussFocusLabel/);
    assert.match(panel, /id="social-planner-conversation"/);
    assert.match(panel, /id="social-planner-conversation-input"/);
    assert.match(panel, /copy\.clearTarget/);
  });

  it("changing Discuss target does not remount the panel or clear messages", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");

    assert.match(panel, /key=\{props\.calendarId\}/);
    assert.doesNotMatch(panel, /key=\{.*assetReference/);
    assert.doesNotMatch(detail, /setMessages\(\[\]\)/);
    const discussHandler = detail.slice(
      detail.indexOf("function handleDiscussWithAthena"),
      detail.indexOf("const selectedAsset"),
    );
    assert.doesNotMatch(discussHandler, /setMessages|fetch\(|apply|Think Differently/);
    assert.match(discussHandler, /setDiscussAssetReference\(\{ date: reference\.date \}\)/);
  });
});

describe("Social Planner V30 L2 daily-asset request validation", () => {
  it("accepts calendar-level message and a valid date reference", () => {
    const calendarLevel = validateSocialPlannerConversationRequest({
      message: "Why does this week open with a carousel?",
    });
    assert.equal(calendarLevel.assetReference, undefined);

    const targeted = validateSocialPlannerConversationRequest({
      message: "How should I shoot Monday?",
      assetReference: { date: "2026-05-11" },
    });
    assert.deepEqual(targeted.assetReference, { date: "2026-05-11" });
  });

  it("rejects malformed references, unexpected properties, and asset-body authority", () => {
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: "2026-05-10",
        }),
      (error: unknown) =>
        error instanceof SocialPlannerConversationError &&
        error.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: { date: "05/10/2026" },
        }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: { date: "2026-02-30" },
        }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: { date: "2026-05-10", weekday: "Sunday" },
        }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: {
            date: "2026-05-10",
            socialCopy: "Client-supplied copy must not win.",
          },
        }),
      /assetReference may not include content or title/,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          package_json: { assets: [] },
        }),
      SocialPlannerConversationError,
    );

    const ignoredBody = validateSocialPlannerConversationRequest({
      message: "Calendar-level question",
      socialCopy: "This must never become authority.",
    });
    assert.equal(ignoredBody.assetReference, undefined);
    assert.equal("socialCopy" in ignoredBody, false);
  });
});

describe("Social Planner V30 L2 daily-asset server resolution", () => {
  it("resolves exactly one frozen package asset by date and fails closed otherwise", () => {
    const socialPackage = buildValidatedPackage();
    const first = socialPackage.assets[0];
    const second = socialPackage.assets[1];

    const resolved = resolveSocialPlannerConversationDailyAsset({
      socialPackage,
      assetReference: { date: first.date },
    });
    assert.equal(resolved.date, first.date);
    assert.equal(resolved.socialCopy, first.socialCopy);
    assert.notEqual(resolved.socialCopy, second.socialCopy);

    assert.throws(
      () =>
        resolveSocialPlannerConversationDailyAsset({
          socialPackage,
          assetReference: { date: "2026-12-31" },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerConversationError &&
        error.code === "ASSET_NOT_FOUND",
    );

    const duplicated = {
      ...socialPackage,
      assets: [
        socialPackage.assets[0],
        { ...socialPackage.assets[1], date: socialPackage.assets[0].date },
        ...socialPackage.assets.slice(2),
      ],
    } as SocialCalendarPackageV1;
    assert.throws(
      () =>
        resolveSocialPlannerConversationDailyAsset({
          socialPackage: duplicated,
          assetReference: { date: first.date },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerConversationError &&
        error.code === "ASSET_NOT_FOUND",
    );
  });

  it("puts only the selected frozen asset into conversation focus", () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const first = socialPackage.assets[0];
    const second = socialPackage.assets[1];
    const selected = resolveSocialPlannerConversationDailyAsset({
      socialPackage,
      assetReference: { date: first.date },
    });

    const assembled = composeSocialPlannerConversationContext({
      calendarId: "cal-discuss-1",
      socialPackage,
      calendarContext: context.calendarContext,
      intelligence: context,
      selectedDailyAsset: selected,
    });

    assert.equal(assembled.selectedDailyAssetDate, first.date);
    assert.match(assembled.selectedDailyAsset ?? "", new RegExp(first.socialCopy));
    assert.match(assembled.selectedDailyAsset ?? "", new RegExp(first.concept));
    assert.match(assembled.selectedDailyAsset ?? "", /"productionSpec"/);
    assert.doesNotMatch(assembled.selectedDailyAsset ?? "", new RegExp(second.socialCopy));
    assert.doesNotMatch(assembled.selectedDailyAsset ?? "", new RegExp(second.concept));
    assert.doesNotMatch(assembled.frozenPackage, new RegExp(first.socialCopy));

    const calendarLevel = composeSocialPlannerConversationContext({
      calendarId: "cal-discuss-1",
      socialPackage,
      calendarContext: context.calendarContext,
      intelligence: context,
    });
    assert.equal(calendarLevel.selectedDailyAsset, null);
    assert.equal(calendarLevel.selectedDailyAssetDate, null);

    const focus = formatSelectedSocialPlannerDailyAsset(first);
    assert.match(focus, /"socialCopy"/);
    assert.doesNotMatch(focus, /creativeFingerprint|sourceSignals|personaIds/);
    assert.match(formatFrozenSocialCalendarPackage(socialPackage), /"date"/);
  });

  it("prompt treats the selected day as focus without claiming mutation", () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const selected = socialPackage.assets[0];
    const assembled = composeSocialPlannerConversationContext({
      calendarId: "cal-discuss-1",
      socialPackage,
      calendarContext: context.calendarContext,
      intelligence: context,
      selectedDailyAsset: selected,
    });
    const built = buildSocialPlannerConversationPrompt({
      assembled,
      history: [],
      userMessage: "What should I change about this asset?",
    });
    const userTurn = built.messages[built.messages.length - 1]?.content ?? "";
    assert.match(userTurn, /SELECTED_DAILY_ASSET_FOCUS/);
    assert.match(userTurn, /focus: daily_asset/);
    assert.match(userTurn, new RegExp(selected.date));
    assert.match(built.systemPrompt, /SELECTED DAILY ASSET FOCUS/);
    assert.match(built.systemPrompt, /You may NOT claim to have edited the saved asset or calendar/);
    assert.match(built.systemPrompt, /IMMUTABLE/);
  });
});

describe("Social Planner V30 L2 conversation send and persistence", () => {
  it("keeps calendar-level conversation working and Ready-only", async () => {
    const calendar = readyCalendar();
    const packageSnapshot = JSON.stringify(calendar.package_json);
    let capturedPair: {
      socialCalendarId: string;
      userContent: string;
      assistantContent: string;
    } | null = null;
    let capturedPrompt = "";

    const result = await sendSocialPlannerConversation({
      organizationId: TEST_ORG,
      calendarId: calendar.id,
      body: { message: "Why does this week work?" },
      requestId: "req-calendar-level",
      deps: {
        getCalendar: async () => calendar,
        composeIntelligence: async () => buildGenerationContext(),
        listMessages: async () => [],
        insertMessagePair: async (input) => {
          capturedPair = {
            socialCalendarId: input.socialCalendarId,
            userContent: input.userContent,
            assistantContent: input.assistantContent,
          };
          return {
            userMessage: {
              id: "msg-user",
              socialCalendarId: input.socialCalendarId,
              organizationId: input.organizationId,
              role: "user",
              content: input.userContent,
              createdAt: "2026-08-21T00:00:00.000Z",
            },
            assistantMessage: {
              id: "msg-asst",
              socialCalendarId: input.socialCalendarId,
              organizationId: input.organizationId,
              role: "assistant",
              content: input.assistantContent,
              createdAt: "2026-08-21T00:00:00.001Z",
            },
          };
        },
        callProvider: async (input) => {
          capturedPrompt = input.messages.map((message) => message.content).join("\n");
          return "This week balances education and personality.";
        },
      },
    });

    assert.equal(result.result.ok, true);
    assert.equal(capturedPair?.socialCalendarId, calendar.id);
    assert.doesNotMatch(capturedPrompt, /SELECTED_DAILY_ASSET_FOCUS/);
    assert.equal(JSON.stringify(calendar.package_json), packageSnapshot);

    await assert.rejects(
      () =>
        sendSocialPlannerConversation({
          organizationId: TEST_ORG,
          calendarId: "cal-processing",
          body: { message: "Hello" },
          requestId: "req-not-ready",
          deps: {
            getCalendar: async () =>
              readyCalendar({ id: "cal-processing", status: "Processing" }),
          },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerConversationError && error.code === "NOT_READY",
    );
  });

  it("resolves a targeted day from the frozen package and persists to the calendar conversation", async () => {
    const calendar = readyCalendar({ id: "cal-discuss-target" });
    const socialPackage = calendar.package_json as unknown as SocialCalendarPackageV1;
    const first = socialPackage.assets[0];
    const second = socialPackage.assets[1];
    const packageSnapshot = JSON.stringify(calendar.package_json);
    let capturedPair: Record<string, unknown> | null = null;
    let capturedPrompt = "";

    const result = await sendSocialPlannerConversation({
      organizationId: TEST_ORG,
      calendarId: calendar.id,
      body: {
        message: "Critique this day's asset.",
        assetReference: { date: first.date },
      },
      requestId: "req-targeted-day",
      deps: {
        getCalendar: async () => calendar,
        composeIntelligence: async () => buildGenerationContext(),
        listMessages: async () => [
          {
            id: "existing-user",
            socialCalendarId: calendar.id,
            organizationId: TEST_ORG,
            role: "user",
            content: "Earlier calendar-level question.",
            createdAt: "2026-08-20T12:00:00.000Z",
          },
        ],
        insertMessagePair: async (input) => {
          capturedPair = { ...input };
          return {
            userMessage: {
              id: "msg-user-2",
              socialCalendarId: input.socialCalendarId,
              organizationId: input.organizationId,
              role: "user",
              content: input.userContent,
              createdAt: "2026-08-21T00:00:00.000Z",
            },
            assistantMessage: {
              id: "msg-asst-2",
              socialCalendarId: input.socialCalendarId,
              organizationId: input.organizationId,
              role: "assistant",
              content: input.assistantContent,
              createdAt: "2026-08-21T00:00:00.001Z",
            },
          };
        },
        callProvider: async (input) => {
          capturedPrompt = input.messages.map((message) => message.content).join("\n");
          return "This Sunday carousel is specific and useful.";
        },
      },
    });

    assert.equal(result.result.ok, true);
    assert.match(capturedPrompt, /SELECTED_DAILY_ASSET_FOCUS/);
    assert.match(capturedPrompt, new RegExp(first.socialCopy));
    assert.match(capturedPrompt, new RegExp(first.date));
    assert.doesNotMatch(
      capturedPrompt.slice(
        capturedPrompt.indexOf("SELECTED_DAILY_ASSET_FOCUS"),
        capturedPrompt.indexOf("FROZEN_CALENDAR_CONTEXT"),
      ),
      new RegExp(second.socialCopy),
    );
    assert.equal(capturedPair?.socialCalendarId, calendar.id);
    assert.equal(capturedPair?.userContent, "Critique this day's asset.");
    assert.equal("assetReference" in (capturedPair ?? {}), false);
    assert.equal(JSON.stringify(calendar.package_json), packageSnapshot);

    await assert.rejects(
      () =>
        sendSocialPlannerConversation({
          organizationId: TEST_ORG,
          calendarId: "cal-discuss-missing",
          body: {
            message: "What about this day?",
            assetReference: { date: "2026-12-31" },
          },
          requestId: "req-missing-day",
          deps: {
            getCalendar: async () =>
              readyCalendar({ id: "cal-discuss-missing" }),
            composeIntelligence: async () => buildGenerationContext(),
            listMessages: async () => [],
          },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerConversationError &&
        error.code === "ASSET_NOT_FOUND",
    );
  });

  it("does not add per-day conversation persistence or message-schema columns", () => {
    const types = read(
      "services/socialPlanner/conversation/socialPlannerConversationTypes.ts",
    );
    const messages = read(
      "services/socialPlanner/conversation/socialPlannerMessageService.ts",
    );
    const service = read(
      "services/socialPlanner/conversation/socialPlannerConversationService.ts",
    );
    const apply = read(
      "services/socialPlanner/conversationRevision/applySocialPlannerConversationRevision.ts",
    );

    assert.equal(SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE, "athena_social_calendar_messages");
    assert.match(messages, /social_calendar_id: socialCalendarId/);
    assert.doesNotMatch(messages, /asset_reference|assetReference|daily_asset/);
    assert.match(service, /insertMessagePair/);
    assert.match(service, /userContent: request\.message/);
    assert.doesNotMatch(service, /userContent:.*assetReference/);
    assert.match(types, /socialCalendarId/);
    assert.doesNotMatch(apply, /assetReference/);
  });
});
