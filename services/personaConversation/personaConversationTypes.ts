/**
 * Persona Ask Athena — shared types.
 * Session UI may keep history in sessionStorage; no Persona chat DB table.
 */

export const PERSONA_CONVERSATION_MODEL = "google/gemini-2.5-flash" as const;

export const ATHENA_REQUEST_ID_HEADER = "X-Athena-Request-Id";

export const PERSONA_CONVERSATION_LIMITS = {
  maxUserMessageLength: 4_000,
  maxHistoryMessageCount: 20,
  maxHistoryMessageLength: 8_000,
  maxHistoryTotalChars: 40_000,
  maxWebsiteContextChars: 12_000,
  maxKnowledgeContextChars: 8_000,
  maxTotalPromptChars: 100_000,
  openRouterTimeoutMs: 45_000,
  clientRequestTimeoutMs: 56_000,
  autoRetryBackoffMs: 700,
  maxConcurrentPerUserPersona: 1,
} as const;

export type PersonaConversationRole = "user" | "assistant";

export type PersonaConversationVersionState = "current" | "archived" | "none";

/** Same identifier shape as Prospect — kind + key only; never trust client body. */
export type PersonaConversationAssetKind = "deployment" | "blueprint";

export type PersonaConversationTrustClass =
  | "confirmed_fact"
  | "athena_analysis"
  | "untrusted_source_material"
  | "user_observation"
  | "metadata";

export type PersonaConversationSourceType =
  | "PERSONA_STRUCTURED_PROFILE"
  | "PERSONA_ADDITIONAL_CONTEXT"
  | "PERSONA_NOTES"
  | "PERSONA_ADS_CONTENT"
  | "REFERENCE_WEBSITE_RESEARCH_UNTRUSTED"
  | "STRATEGIC_BLUEPRINT"
  | "DEPLOYMENT_ASSETS"
  | "ANALYSIS_ASSETS"
  | "DISCUSSION_ANALYSIS"
  | "REFERENCED_ASSET"
  | "EXECUTIVE_VERSION_METADATA"
  | "ORGANIZATION_IDENTITY"
  | "ORGANIZATION_VOICE";

/** Trusted reference — identifiers only; server resolves content. */
export type PersonaConversationAssetReference = {
  kind: PersonaConversationAssetKind;
  key: string;
};

export type PersonaConversationResolvedAsset = {
  kind: PersonaConversationAssetKind;
  key: string;
  title: string;
  content: string;
  /**
   * Server-resolved group for badge/context labeling.
   * Analysis assets may arrive as kind "deployment" from the shared UI.
   */
  group: "deployment" | "analysis" | "blueprint";
};

export type PersonaConversationHistoryMessage = {
  role: PersonaConversationRole;
  content: string;
};

export type PersonaConversationRequest = {
  message: string;
  history: PersonaConversationHistoryMessage[];
  /** Optional; server defaults to Current Executive Version when omitted. */
  executiveVersionId: string | null;
  assetReference?: PersonaConversationAssetReference;
};

export type PersonaConversationContextSection = {
  type: PersonaConversationSourceType;
  trust: PersonaConversationTrustClass;
  label: string;
  content: string;
};

export type PersonaConversationAssembledContext = {
  personaId: string;
  organizationId: string;
  executiveVersionId: string | null;
  versionState: PersonaConversationVersionState;
  versionLabel: string | null;
  sections: PersonaConversationContextSection[];
  referencedAsset: PersonaConversationResolvedAsset | null;
  missingNotes: string[];
};

export type PersonaConversationSuccessResult = {
  ok: true;
  message: {
    role: "assistant";
    content: string;
  };
  context: {
    personaId: string;
    executiveVersionId: string | null;
    versionState: PersonaConversationVersionState;
    versionLabel: string | null;
    asset: {
      kind: PersonaConversationAssetKind;
      key: string;
      title: string;
      group: PersonaConversationResolvedAsset["group"];
    } | null;
  };
};

export type PersonaConversationErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "ASSET_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export function isPersonaConversationAssetKind(
  value: unknown,
): value is PersonaConversationAssetKind {
  return value === "deployment" || value === "blueprint";
}

export type PersonaConversationFailureResult = {
  ok: false;
  error: {
    code: PersonaConversationErrorCode;
    message: string;
    retryable?: boolean;
  };
};

export type PersonaConversationResult =
  | PersonaConversationSuccessResult
  | PersonaConversationFailureResult;

export class PersonaConversationError extends Error {
  readonly code: PersonaConversationErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    code: PersonaConversationErrorCode,
    message: string,
    httpStatus: number,
    options?: { retryable?: boolean; requestId?: string | null },
  ) {
    super(message);
    this.name = "PersonaConversationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = Boolean(options?.retryable);
    this.requestId = options?.requestId ?? null;
  }
}
