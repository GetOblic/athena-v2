/**
 * Athena V10 — Prospect Conversation shared types and validation constants.
 * Client DTOs stay narrow: never include trusted asset bodies or org context.
 */

/** Hardcoded model for this feature only — does not alter stage routing. */
export const PROSPECT_CONVERSATION_MODEL = "google/gemini-2.5-flash" as const;

/** Safe correlation header returned on conversation success and structured failures. */
export const ATHENA_REQUEST_ID_HEADER = "X-Athena-Request-Id";

/** Explicit interactive Q&A limits (documented in code per Phase 2 contract). */
export const PROSPECT_CONVERSATION_LIMITS = {
  /** Max characters for the latest user message. */
  maxUserMessageLength: 4_000,
  /** Max prior messages accepted from the client (excluding the new message). */
  maxHistoryMessageCount: 20,
  /** Max characters per historical message. */
  maxHistoryMessageLength: 8_000,
  /** Max combined characters across client history. */
  maxHistoryTotalChars: 40_000,
  /** Max assembled website / scrape context characters. */
  maxWebsiteContextChars: 12_000,
  /** Max assembled organization knowledge characters. */
  maxKnowledgeContextChars: 8_000,
  /** Hard ceiling for assembled prompt+context size after truncation. */
  maxTotalPromptChars: 100_000,
  /** OpenRouter AbortController timeout (ms). */
  openRouterTimeoutMs: 45_000,
  /**
   * Browser client request timeout (ms).
   * Slightly above OpenRouter timeout; safely within route maxDuration (60s).
   */
  clientRequestTimeoutMs: 56_000,
  /** Backoff before the single automatic client retry (ms). */
  autoRetryBackoffMs: 700,
  /** Max concurrent in-process conversation requests per user+prospect. */
  maxConcurrentPerUserProspect: 1,
} as const;

export type ProspectConversationRole = "user" | "assistant";

export type ProspectConversationAssetKind = "deployment" | "blueprint";

export type ProspectConversationVersionState =
  | "current"
  | "archived"
  | "none";

export type ProspectConversationTrustClass =
  | "confirmed_fact"
  | "athena_analysis"
  | "untrusted_source_material"
  | "metadata";

export type ProspectConversationSourceType =
  | "PROSPECT_STRUCTURED_FACTS"
  | "ORGANIZATION_IDENTITY"
  | "ORGANIZATION_KNOWLEDGE"
  | "ORGANIZATION_VOICE"
  | "WEBSITE_SOURCE_MATERIAL_UNTRUSTED"
  | "DISCUSSION_ANALYSIS"
  | "OPPORTUNITY"
  | "EXECUTIVE_BRIEFING"
  | "STRATEGIC_BLUEPRINT"
  | "DEPLOYMENT_ASSETS"
  | "REFERENCED_ASSET"
  | "EXECUTIVE_VERSION_METADATA";

/** Trusted reference — identifiers only; server resolves content. */
export type ProspectConversationAssetReference = {
  kind: ProspectConversationAssetKind;
  key: string;
};

export type ProspectConversationHistoryMessage = {
  role: ProspectConversationRole;
  content: string;
};

/** Narrow client → server request body. */
export type ProspectConversationRequest = {
  message: string;
  history: ProspectConversationHistoryMessage[];
  executiveVersionId: string | null;
  assetReference?: ProspectConversationAssetReference;
};

export type ProspectConversationResolvedAsset = {
  kind: ProspectConversationAssetKind;
  key: string;
  title: string;
  content: string;
};

export type ProspectConversationContextSection = {
  type: ProspectConversationSourceType;
  trust: ProspectConversationTrustClass;
  label: string;
  content: string;
};

export type ProspectConversationAssembledContext = {
  prospectId: string;
  organizationId: string;
  executiveVersionId: string | null;
  versionState: ProspectConversationVersionState;
  versionLabel: string | null;
  sections: ProspectConversationContextSection[];
  referencedAsset: ProspectConversationResolvedAsset | null;
  missingNotes: string[];
};

export type ProspectConversationSuccessResult = {
  ok: true;
  message: {
    role: "assistant";
    content: string;
  };
  context: {
    prospectId: string;
    executiveVersionId: string | null;
    versionState: ProspectConversationVersionState;
    versionLabel: string | null;
    asset: {
      kind: ProspectConversationAssetKind;
      key: string;
      title: string;
    } | null;
  };
};

export type ProspectConversationErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "ASSET_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "TIMEOUT"
  /** Athena in-process concurrent-request slot for this user+prospect. */
  | "RATE_LIMITED"
  /** Upstream OpenRouter HTTP 429 (distinct from Athena RATE_LIMITED). */
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export type ProspectConversationFailureResult = {
  ok: false;
  error: {
    code: ProspectConversationErrorCode;
    message: string;
    /** Present only when the server classifies the failure as auto-retryable. */
    retryable?: boolean;
  };
};

export type ProspectConversationResult =
  | ProspectConversationSuccessResult
  | ProspectConversationFailureResult;

export class ProspectConversationError extends Error {
  readonly code: ProspectConversationErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    code: ProspectConversationErrorCode,
    message: string,
    httpStatus: number,
    options?: { retryable?: boolean; requestId?: string | null },
  ) {
    super(message);
    this.name = "ProspectConversationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = Boolean(options?.retryable);
    this.requestId = options?.requestId ?? null;
  }
}

export function isProspectConversationAssetKind(
  value: unknown,
): value is ProspectConversationAssetKind {
  return value === "deployment" || value === "blueprint";
}
