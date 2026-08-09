/**
 * Deterministic validation for EstimateProspectGenerationContextV1 (V27 L13).
 * Focused helper — does not alter AthenaEstimatePackage validation.
 */

import {
  ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
  type EstimateProspectGenerationContextV1,
} from "@/services/estimate/athenaEstimateTypes";

export class EstimateProspectGenerationContextValidationError extends Error {
  readonly code = "INVALID_PROSPECT_GENERATION_CONTEXT";
  readonly details: string[];

  constructor(details: string[]) {
    super(details[0] ?? "Estimate Prospect generation context validation failed.");
    this.name = "EstimateProspectGenerationContextValidationError";
    this.details = details;
  }
}

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "prospectId",
  "businessName",
  "capturedAt",
  "composedText",
  "available",
  "sources",
]);

const ALLOWED_AVAILABLE_KEYS = new Set([
  "profile",
  "notesOrAdditionalContext",
  "adsContent",
  "websiteIntelligence",
  "executiveIntelligence",
  "strategicAssetBlueprint",
]);

const ALLOWED_SOURCES_KEYS = new Set([
  "linkedDiscussionId",
  "executiveVersionId",
]);

const AVAILABLE_BOOL_KEYS = [
  "profile",
  "notesOrAdditionalContext",
  "adsContent",
  "websiteIntelligence",
  "executiveIntelligence",
  "strategicAssetBlueprint",
] as const;

function rejectUnknownKeys(
  raw: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      errors.push(`${path} contains unsupported key "${key}".`);
    }
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
  maxLength?: number,
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string.`);
    return null;
  }
  const trimmed = value.trim();
  if (maxLength != null && trimmed.length > maxLength) {
    errors.push(`${path} exceeds maximum length of ${maxLength} characters.`);
    return null;
  }
  return trimmed;
}

/**
 * Accept ISO-8601 datetime strings that parse to a finite Date.
 * Reject empty / non-string / NaN dates.
 */
function requireCapturedAt(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty ISO datetime string.`);
    return null;
  }
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    errors.push(`${path} must be a valid ISO datetime string.`);
    return null;
  }
  return trimmed;
}

/**
 * Null is allowed. Non-null values must be non-empty strings.
 * Returns `{ ok: false }` when the value is invalid (error already pushed).
 */
function requireNullableIdString(
  value: unknown,
  path: string,
  errors: string[],
): { ok: true; value: string | null } | { ok: false } {
  if (value == null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string or null.`);
    return { ok: false };
  }
  return { ok: true, value: value.trim() };
}

function requireAvailable(
  value: unknown,
  errors: string[],
): EstimateProspectGenerationContextV1["available"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("available must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  rejectUnknownKeys(raw, ALLOWED_AVAILABLE_KEYS, "available", errors);

  const result = {} as EstimateProspectGenerationContextV1["available"];
  let ok = true;
  for (const key of AVAILABLE_BOOL_KEYS) {
    if (typeof raw[key] !== "boolean") {
      errors.push(`available.${key} must be a boolean.`);
      ok = false;
      continue;
    }
    result[key] = raw[key] as boolean;
  }
  return ok ? result : null;
}

function requireSources(
  value: unknown,
  errors: string[],
): EstimateProspectGenerationContextV1["sources"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("sources must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  rejectUnknownKeys(raw, ALLOWED_SOURCES_KEYS, "sources", errors);

  const linkedDiscussionId = requireNullableIdString(
    raw.linkedDiscussionId,
    "sources.linkedDiscussionId",
    errors,
  );
  const executiveVersionId = requireNullableIdString(
    raw.executiveVersionId,
    "sources.executiveVersionId",
    errors,
  );

  if (!linkedDiscussionId.ok || !executiveVersionId.ok) {
    return null;
  }

  return {
    linkedDiscussionId: linkedDiscussionId.value,
    executiveVersionId: executiveVersionId.value,
  };
}

/**
 * Validate and normalize EstimateProspectGenerationContextV1 from untrusted input.
 * Rejects unknown keys, wrong schemaVersion, empty identity, oversized composedText.
 */
export function validateEstimateProspectGenerationContext(
  input: unknown,
): EstimateProspectGenerationContextV1 {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new EstimateProspectGenerationContextValidationError([
      "Prospect generation context must be an object.",
    ]);
  }

  const raw = input as Record<string, unknown>;
  rejectUnknownKeys(raw, ALLOWED_TOP_LEVEL_KEYS, "context", errors);

  if (raw.schemaVersion !== ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be exactly "${ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION}".`,
    );
  }

  const prospectId = requireNonEmptyString(raw.prospectId, "prospectId", errors);
  const businessName = requireNonEmptyString(
    raw.businessName,
    "businessName",
    errors,
  );
  const capturedAt = requireCapturedAt(raw.capturedAt, "capturedAt", errors);
  const composedText = requireNonEmptyString(
    raw.composedText,
    "composedText",
    errors,
    ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  );
  const available = requireAvailable(raw.available, errors);
  const sources = requireSources(raw.sources, errors);

  if (
    errors.length > 0 ||
    !prospectId ||
    !businessName ||
    !capturedAt ||
    !composedText ||
    !available ||
    !sources
  ) {
    throw new EstimateProspectGenerationContextValidationError(
      errors.length > 0
        ? errors
        : ["Prospect generation context validation failed."],
    );
  }

  return {
    schemaVersion: ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
    prospectId,
    businessName,
    capturedAt,
    composedText,
    available,
    sources,
  };
}

export function isEstimateProspectGenerationContext(
  value: unknown,
): value is EstimateProspectGenerationContextV1 {
  try {
    validateEstimateProspectGenerationContext(value);
    return true;
  } catch {
    return false;
  }
}
