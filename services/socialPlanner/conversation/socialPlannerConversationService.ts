/**
 * Social Planner Ask Athena — synchronous conversation service.
 * Durable messages; Ready Social Calendar remains immutable. No generation jobs.
 *
 * Message-pair persistence:
 * 1. Validate + authorize + load history + compose + call LLM
 * 2. Normalize → validate assistant response
 * 3. Atomic pair persist
 * Provider / validation failure persists neither new message.
 */

import { randomUUID } from "node:crypto";
import {
  logAthenaLlmRouting,
  resolveModelForStage,
} from "@/lib/llm/modelRouting";
import {
  callGeminiViaOpenRouter,
  hashStable,
} from "@/services/athenaConversation/athenaConversationProvider";
import { AthenaConversationError } from "@/services/athenaConversation/athenaConversationTypes";
import {
  releaseScopedConversationSlot,
  tryAcquireScopedConversationSlot,
} from "@/services/athenaConversation/athenaConversationValidation";
import { normalizeEstimateConversationPlainText } from "@/services/estimateConversation/estimateConversationPlainText";
import { composeSocialPlannerIntelligence } from "@/services/socialPlanner/intelligence/composeSocialPlannerIntelligence";
import {
  tryParsePersistedSocialCalendarContext,
  tryParsePersistedSocialCalendarPackage,
} from "@/services/socialPlanner/socialCalendarPersistedPackage";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import { composeSocialPlannerConversationContext } from "@/services/socialPlanner/conversation/socialPlannerConversationContext";
import { buildSocialPlannerConversationPrompt } from "@/services/socialPlanner/conversation/socialPlannerConversationPrompt";
import {
  boundSocialPlannerConversationHistory,
  SOCIAL_PLANNER_CONVERSATION_LIMITS,
  SocialPlannerConversationError,
  toPublicSocialPlannerConversationMessage,
  type SocialPlannerConversationHistorySuccess,
  type SocialPlannerConversationSendSuccess,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import { validateSocialPlannerConversationRequest } from "@/services/socialPlanner/conversation/socialPlannerConversationValidation";
import {
  insertSocialPlannerConversationMessagePair,
  listSocialPlannerConversationMessages,
  SocialPlannerMessagePersistenceError,
} from "@/services/socialPlanner/conversation/socialPlannerMessageService";

export type SocialPlannerConversationServiceDeps = {
  getCalendar?: typeof getSocialCalendarById;
  composeIntelligence?: typeof composeSocialPlannerIntelligence;
  listMessages?: typeof listSocialPlannerConversationMessages;
  insertMessagePair?: typeof insertSocialPlannerConversationMessagePair;
  callProvider?: typeof callGeminiViaOpenRouter;
};

const CONVERSATION_STAGE = "social_calendar_conversation" as const;

function mapProviderError(
  error: unknown,
  requestId: string,
): SocialPlannerConversationError {
  if (error instanceof SocialPlannerConversationError) {
    return error;
  }
  if (error instanceof AthenaConversationError) {
    return new SocialPlannerConversationError(
      error.code,
      error.message,
      error.httpStatus,
      { retryable: error.retryable, requestId: error.requestId ?? requestId },
    );
  }
  return new SocialPlannerConversationError(
    "PROVIDER_ERROR",
    "Athena could not complete the conversation response.",
    500,
    { requestId, retryable: false },
  );
}

function validateAssistantReplyShape(
  content: string,
  requestId: string,
): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new SocialPlannerConversationError(
      "PROVIDER_ERROR",
      "Athena returned an empty response.",
      500,
      { requestId, retryable: false },
    );
  }
  if (trimmed.length > SOCIAL_PLANNER_CONVERSATION_LIMITS.maxAssistantMessageLength) {
    throw new SocialPlannerConversationError(
      "PROVIDER_ERROR",
      "Athena returned a response that exceeded the maximum length.",
      500,
      { requestId, retryable: false },
    );
  }
  return trimmed;
}

const FORBIDDEN_CHANGE_CLAIMS =
  /\b(I (have|just) (updated|changed|saved|applied|regenerated)|the calendar (has|is now) (been )?(updated|changed|revised)|this week (has been|is now) (updated|changed))\b/i;

function assertAssistantReplyAllowed(
  content: string,
  requestId: string,
): void {
  if (FORBIDDEN_CHANGE_CLAIMS.test(content)) {
    throw new SocialPlannerConversationError(
      "PROVIDER_ERROR",
      "Athena returned a response that could not be accepted.",
      500,
      { requestId, retryable: false },
    );
  }
}

export function assertSocialPlannerConversationSourceReady(
  calendar: SocialCalendar,
): void {
  if (calendar.status !== "Ready") {
    throw new SocialPlannerConversationError(
      "NOT_READY",
      "Ask Athena is available only for a Ready Social Calendar.",
      409,
    );
  }
  if (!tryParsePersistedSocialCalendarPackage(calendar.package_json)) {
    throw new SocialPlannerConversationError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be discussed because its package is unusable.",
      400,
    );
  }
  if (!tryParsePersistedSocialCalendarContext(calendar.calendar_context_json)) {
    throw new SocialPlannerConversationError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be discussed because its calendar context is unusable.",
      400,
    );
  }
}

export async function listSocialPlannerConversation(input: {
  organizationId: string;
  calendarId: string;
  deps?: SocialPlannerConversationServiceDeps;
}): Promise<SocialPlannerConversationHistorySuccess> {
  const getCalendar = input.deps?.getCalendar ?? getSocialCalendarById;
  const listMessages =
    input.deps?.listMessages ?? listSocialPlannerConversationMessages;

  const calendar = await getCalendar(input.calendarId, input.organizationId);
  if (!calendar) {
    throw new SocialPlannerConversationError(
      "NOT_FOUND",
      "Social Calendar not found.",
      404,
    );
  }

  const messages = await listMessages({
    organizationId: input.organizationId,
    socialCalendarId: calendar.id,
  });

  return {
    ok: true,
    messages: messages.map(toPublicSocialPlannerConversationMessage),
  };
}

export async function sendSocialPlannerConversation(input: {
  organizationId: string;
  calendarId: string;
  body: unknown;
  requestId?: string;
  deps?: SocialPlannerConversationServiceDeps;
}): Promise<{
  result: SocialPlannerConversationSendSuccess;
  requestId: string;
}> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateSocialPlannerConversationRequest(input.body);

  const getCalendar = input.deps?.getCalendar ?? getSocialCalendarById;
  const composeIntelligence =
    input.deps?.composeIntelligence ?? composeSocialPlannerIntelligence;
  const listMessages =
    input.deps?.listMessages ?? listSocialPlannerConversationMessages;
  const insertMessagePair =
    input.deps?.insertMessagePair ?? insertSocialPlannerConversationMessagePair;
  const callProvider = input.deps?.callProvider ?? callGeminiViaOpenRouter;

  const calendar = await getCalendar(input.calendarId, input.organizationId);
  if (!calendar) {
    throw new SocialPlannerConversationError(
      "NOT_FOUND",
      "Social Calendar not found.",
      404,
      { requestId },
    );
  }

  assertSocialPlannerConversationSourceReady(calendar);
  const socialPackage = tryParsePersistedSocialCalendarPackage(
    calendar.package_json,
  );
  const calendarContext = tryParsePersistedSocialCalendarContext(
    calendar.calendar_context_json,
  );
  if (!socialPackage || !calendarContext) {
    throw new SocialPlannerConversationError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be discussed because its package is unusable.",
      400,
      { requestId },
    );
  }

  const scopeKey = `social-planner:${input.organizationId}:${calendar.id}`;
  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new SocialPlannerConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for this Social Calendar.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const persistedHistory = await listMessages({
      organizationId: input.organizationId,
      socialCalendarId: calendar.id,
    });
    const history = boundSocialPlannerConversationHistory(persistedHistory);

    const intelligence = await composeIntelligence({
      organizationId: input.organizationId,
      calendarContext,
    });

    const assembled = composeSocialPlannerConversationContext({
      calendarId: calendar.id,
      socialPackage,
      calendarContext,
      intelligence,
    });

    const built = buildSocialPlannerConversationPrompt({
      assembled,
      history,
      userMessage: request.message,
    });

    const route = resolveModelForStage(CONVERSATION_STAGE);
    logAthenaLlmRouting(route, route.reasoningEffort);
    console.log(
      `[Athena LLM] stage=${route.stage} role=${route.role} model=${route.model} reasoning=${route.reasoningEffort} temperature=0.3`,
    );

    const promptHash = hashStable(
      built.messages.map((message) => `${message.role}:${message.content.length}`).join("|"),
    );
    const contextHash = hashStable(String(built.contextCharCount));

    let assistantRaw: string;
    try {
      assistantRaw = await callProvider({
        messages: built.messages,
        requestId,
        organizationId: calendar.organization_id,
        scope: "social-planner",
        promptHash,
        contextHash,
        promptCharCount: built.promptCharCount,
        contextCharCount: built.contextCharCount,
      });
    } catch (error) {
      throw mapProviderError(error, requestId);
    }

    const assistantNormalized = normalizeEstimateConversationPlainText(assistantRaw);
    const assistantContent = validateAssistantReplyShape(
      assistantNormalized,
      requestId,
    );
    assertAssistantReplyAllowed(assistantContent, requestId);

    let assistantMessage;
    try {
      const pair = await insertMessagePair({
        socialCalendarId: calendar.id,
        organizationId: calendar.organization_id,
        userContent: request.message,
        assistantContent,
        maxUserContentLength: SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength,
        maxAssistantContentLength:
          SOCIAL_PLANNER_CONVERSATION_LIMITS.maxAssistantMessageLength,
      });
      assistantMessage = pair.assistantMessage;
    } catch (error) {
      console.error("[ATHENA_SOCIAL_PLANNER_CONVERSATION] pair_persist_failed", {
        calendarId: calendar.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SocialPlannerConversationError(
        "MESSAGE_PERSISTENCE_FAILED",
        "Conversation reply was generated but could not be saved.",
        500,
        { requestId, retryable: false },
      );
    }

    return {
      result: {
        ok: true,
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
        },
      },
      requestId,
    };
  } catch (error) {
    if (error instanceof SocialPlannerConversationError) {
      throw error;
    }
    if (error instanceof SocialPlannerMessagePersistenceError) {
      throw new SocialPlannerConversationError(
        "MESSAGE_PERSISTENCE_FAILED",
        "Failed to persist Social Planner conversation messages.",
        500,
        { requestId, retryable: false },
      );
    }
    console.error("[ATHENA_SOCIAL_PLANNER_CONVERSATION] send_failed", {
      requestId,
      calendarId: input.calendarId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SocialPlannerConversationError(
      "INTERNAL_ERROR",
      "Conversation request failed.",
      500,
      { requestId, retryable: false },
    );
  } finally {
    releaseScopedConversationSlot(scopeKey);
  }
}
