/**
 * Social Planner Ask Athena — conversation types and budgets.
 * Reuses shared Athena conversation limits. Org-scoped, not Licensee-owned.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  ATHENA_CONVERSATION_MODEL,
  type AthenaConversationHistoryMessage,
} from "@/services/athenaConversation/athenaConversationTypes";

export const SOCIAL_PLANNER_CONVERSATION_MODEL = ATHENA_CONVERSATION_MODEL;

export const SOCIAL_PLANNER_CONVERSATION_LIMITS = {
  maxUserMessageLength: ATHENA_CONVERSATION_LIMITS.maxUserMessageLength,
  maxMessageChars: ATHENA_CONVERSATION_LIMITS.maxMessageChars,
  maxHistoryMessageCount: ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount,
  maxHistoryMessageLength: ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength,
  maxHistoryTotalChars: ATHENA_CONVERSATION_LIMITS.maxHistoryTotalChars,
  maxTotalPromptChars: ATHENA_CONVERSATION_LIMITS.maxTotalPromptChars,
  openRouterTimeoutMs: ATHENA_CONVERSATION_LIMITS.openRouterTimeoutMs,
  maxConcurrentPerUserScope: ATHENA_CONVERSATION_LIMITS.maxConcurrentPerUserScope,
  maxAssistantMessageLength: 8_000,
  maxFrozenPackageChars: 10_000,
  maxFrozenCalendarContextChars: 4_000,
  maxTrendSocialChars: 3_500,
  maxLiveIntelligenceTotalChars: 12_000,
} as const;

export const SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE =
  "athena_social_calendar_messages" as const;

export type SocialPlannerConversationRole = "user" | "assistant";

export type SocialPlannerConversationMessage = {
  id: string;
  socialCalendarId: string;
  organizationId: string;
  role: SocialPlannerConversationRole;
  content: string;
  createdAt: string;
};

export type SocialPlannerConversationRequest = {
  message: string;
};

export type SocialPlannerConversationHistoryMessage =
  AthenaConversationHistoryMessage;

export type SocialPlannerConversationPublicMessage = {
  id: string;
  role: SocialPlannerConversationRole;
  content: string;
  createdAt: string;
};

export type SocialPlannerConversationHistorySuccess = {
  ok: true;
  messages: SocialPlannerConversationPublicMessage[];
};

export type SocialPlannerConversationSendSuccess = {
  ok: true;
  message: {
    id: string;
    role: "assistant";
    content: string;
    createdAt: string;
  };
};

export type SocialPlannerConversationErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "NOT_READY"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR"
  | "MESSAGE_PERSISTENCE_FAILED"
  | "CONVERSATION_FAILED"
  | "NO_MESSAGES"
  | "NO_ACTIONABLE_REVISION"
  | "SOURCE_PACKAGE_INVALID"
  | "VERSION_ALLOCATION_FAILED";

export class SocialPlannerConversationError extends Error {
  readonly code: SocialPlannerConversationErrorCode | string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    code: SocialPlannerConversationErrorCode | string,
    message: string,
    httpStatus: number,
    options?: { retryable?: boolean; requestId?: string | null },
  ) {
    super(message);
    this.name = "SocialPlannerConversationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = Boolean(options?.retryable);
    this.requestId = options?.requestId ?? null;
  }
}

export function toPublicSocialPlannerConversationMessage(
  message: SocialPlannerConversationMessage,
): SocialPlannerConversationPublicMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

export function boundSocialPlannerConversationHistory(
  messages: SocialPlannerConversationMessage[],
): SocialPlannerConversationHistoryMessage[] {
  const maxCount = SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryMessageCount;
  const maxTotal = SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryTotalChars;
  const maxEach = SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryMessageLength;

  let selected = messages.slice(-maxCount).map((message) => ({
    role: message.role,
    content:
      message.content.length > maxEach
        ? `${message.content.slice(0, maxEach)}\n\n[truncated]`
        : message.content,
  }));

  let total = selected.reduce((sum, item) => sum + item.content.length, 0);
  while (selected.length > 0 && total > maxTotal) {
    selected = selected.slice(1);
    total = selected.reduce((sum, item) => sum + item.content.length, 0);
  }

  return selected;
}
