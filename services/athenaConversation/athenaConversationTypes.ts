/**
 * Shared read-only conversation primitives for Identity and Getting Started.
 * Does not alter Prospect conversation modules or DTOs.
 */

/** Hardcoded model — same as V11 Prospect conversation. */
export const ATHENA_CONVERSATION_MODEL = "google/gemini-2.5-flash" as const;

/** Safe correlation header returned on conversation success and structured failures. */
export const ATHENA_REQUEST_ID_HEADER = "X-Athena-Request-Id";

/** Shared interactive Q&A limits aligned with Prospect conversation. */
export const ATHENA_CONVERSATION_LIMITS = {
  maxUserMessageLength: 4_000,
  /** Alias used by the generic conversation textarea maxLength. */
  maxMessageChars: 4_000,
  maxHistoryMessageCount: 20,
  maxHistoryMessageLength: 8_000,
  maxHistoryTotalChars: 40_000,
  maxTotalPromptChars: 100_000,
  openRouterTimeoutMs: 45_000,
  clientRequestTimeoutMs: 56_000,
  autoRetryBackoffMs: 700,
  maxConcurrentPerUserScope: 1,
} as const;

export type AthenaConversationRole = "user" | "assistant";

export type AthenaConversationHistoryMessage = {
  role: AthenaConversationRole;
  content: string;
};

/** Narrow client → server request body for Identity / Getting Started. */
export type AthenaConversationRequest = {
  message: string;
  history: AthenaConversationHistoryMessage[];
};

export type AthenaConversationTrustClass =
  | "confirmed_fact"
  | "athena_analysis"
  | "untrusted_source_data"
  | "server_product_context"
  | "metadata";

export type AthenaConversationContextSection = {
  type: string;
  trust: AthenaConversationTrustClass;
  label: string;
  content: string;
};

export type AthenaConversationSuccessResult = {
  ok: true;
  message: {
    role: "assistant";
    content: string;
  };
};

export type AthenaConversationErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export type AthenaConversationFailureResult = {
  ok: false;
  error: {
    code: AthenaConversationErrorCode;
    message: string;
    retryable?: boolean;
  };
};

export type AthenaConversationResult =
  | AthenaConversationSuccessResult
  | AthenaConversationFailureResult;

export class AthenaConversationError extends Error {
  readonly code: AthenaConversationErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    code: AthenaConversationErrorCode,
    message: string,
    httpStatus: number,
    options?: { retryable?: boolean; requestId?: string | null },
  ) {
    super(message);
    this.name = "AthenaConversationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = Boolean(options?.retryable);
    this.requestId = options?.requestId ?? null;
  }
}
