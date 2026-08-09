/**
 * Athena Estimate Ask Athena — conversation types and budgets.
 * Distinct from Estimate generation (estimate_package) and org-tenant Ask Athena.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  type AthenaConversationHistoryMessage,
} from "@/services/athenaConversation/athenaConversationTypes";
import {
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
} from "@/services/estimate/athenaEstimateTypes";
import type { AthenaEstimateMessage } from "@/services/estimate/athenaEstimateTypes";

/** Conversational model — same Flash tier as Identity/Prospect Ask Athena. */
export const ESTIMATE_CONVERSATION_MODEL = "google/gemini-2.5-flash" as const;

/**
 * Canonical shared history/user limits plus Estimate conversation context budgets.
 * History numbers match ATHENA_CONVERSATION_LIMITS (20 / 8k / 40k / 100k).
 */
export const ESTIMATE_CONVERSATION_LIMITS = {
  maxUserMessageLength: ATHENA_CONVERSATION_LIMITS.maxUserMessageLength,
  maxMessageChars: ATHENA_CONVERSATION_LIMITS.maxMessageChars,
  maxHistoryMessageCount: ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount,
  maxHistoryMessageLength: ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength,
  maxHistoryTotalChars: ATHENA_CONVERSATION_LIMITS.maxHistoryTotalChars,
  maxTotalPromptChars: ATHENA_CONVERSATION_LIMITS.maxTotalPromptChars,
  openRouterTimeoutMs: ATHENA_CONVERSATION_LIMITS.openRouterTimeoutMs,
  maxConcurrentPerUserScope: ATHENA_CONVERSATION_LIMITS.maxConcurrentPerUserScope,
  /** Frozen Ready Estimate facts block. */
  maxFrozenEstimateFactsChars: 8_000,
  /** Compact Brain / identity summary. */
  maxBrainChars: 3_000,
  /** Identity Executive Intelligence. */
  maxExecutiveIntelligenceChars: 3_000,
  /** Compact organization aggregates (no library dumps). */
  maxOrganizationAggregatesChars: 2_500,
  /** Selected Deep Website highlights. */
  maxDeepWebsiteChars: 3_500,
  /** Sum budget for live trusted intelligence sections. */
  maxLiveIntelligenceTotalChars: 12_000,
  /** Current GetOblic Estimate pricing methodology (matches generation cap). */
  maxMethodologyChars: ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
  /** Assistant reply max size before persist. */
  maxAssistantMessageLength: 8_000,
} as const;

export type EstimateConversationRequest = {
  message: string;
};

export type EstimateConversationHistoryMessage =
  AthenaConversationHistoryMessage;

export type EstimateConversationPublicMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type EstimateConversationHistorySuccess = {
  ok: true;
  messages: EstimateConversationPublicMessage[];
};

export type EstimateConversationSendSuccess = {
  ok: true;
  message: {
    id: string;
    role: "assistant";
    content: string;
    createdAt: string;
  };
};

export type EstimateConversationErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "NOT_READY"
  | "ESTIMATE_INSTRUCTION_NOT_CONFIGURED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR"
  | "MESSAGE_PERSISTENCE_FAILED"
  | "CONVERSATION_FAILED";

export type EstimateConversationFailure = {
  ok: false;
  error: {
    code: EstimateConversationErrorCode | string;
    message: string;
    retryable?: boolean;
  };
};

export class EstimateConversationError extends Error {
  readonly code: EstimateConversationErrorCode | string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    code: EstimateConversationErrorCode | string,
    message: string,
    httpStatus: number,
    options?: { retryable?: boolean; requestId?: string | null },
  ) {
    super(message);
    this.name = "EstimateConversationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = Boolean(options?.retryable);
    this.requestId = options?.requestId ?? null;
  }
}

export function toPublicEstimateConversationMessage(
  message: AthenaEstimateMessage,
): EstimateConversationPublicMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

/**
 * Bound persisted history for prompt injection (oldest dropped first).
 */
export function boundEstimateConversationHistory(
  messages: AthenaEstimateMessage[],
): EstimateConversationHistoryMessage[] {
  const maxCount = ESTIMATE_CONVERSATION_LIMITS.maxHistoryMessageCount;
  const maxTotal = ESTIMATE_CONVERSATION_LIMITS.maxHistoryTotalChars;
  const maxEach = ESTIMATE_CONVERSATION_LIMITS.maxHistoryMessageLength;

  let selected = messages.slice(-maxCount).map((message) => ({
    role: message.role as "user" | "assistant",
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
