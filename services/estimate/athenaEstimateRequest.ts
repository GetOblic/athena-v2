/**
 * EstimateRequest normalization + validation (Athena V26 L1).
 * Rejects arbitrary JSON; does not silently accept unknown shapes.
 */

import {
  ATHENA_ESTIMATE_TIMEFRAMES,
  isAthenaEstimateTimeframe,
  type AthenaEstimateTimeframe,
  type EstimateRequest,
} from "@/services/estimate/athenaEstimateTypes";

/**
 * Length bounds aligned with Athena brief / conversation conventions.
 * projectNeed / additionalContext follow guidance (4_000) style limits.
 */
export const ESTIMATE_REQUEST_FIELD_LIMITS = {
  projectNeed: 4_000,
  additionalContext: 4_000,
} as const;

/** Minimum meaningful projectNeed length after trim. */
export const ESTIMATE_PROJECT_NEED_MIN_LENGTH = 3;

export class EstimateRequestValidationError extends Error {
  readonly code = "INVALID_ESTIMATE_REQUEST";
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "EstimateRequestValidationError";
    this.field = field;
  }
}

const MEANINGLESS_PROJECT_NEED = /^[\s\W_]+$/u;

function assertObject(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new EstimateRequestValidationError("Estimate request must be an object.");
  }
  return input as Record<string, unknown>;
}

function normalizeOptionalString(
  value: unknown,
  field: keyof typeof ESTIMATE_REQUEST_FIELD_LIMITS,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new EstimateRequestValidationError(
      `Estimate request field "${field}" must be a string.`,
      field,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const limit = ESTIMATE_REQUEST_FIELD_LIMITS[field];
  if (trimmed.length > limit) {
    throw new EstimateRequestValidationError(
      `Estimate request field "${field}" exceeds maximum length of ${limit} characters.`,
      field,
    );
  }
  return trimmed;
}

function normalizeRequiredProjectNeed(value: unknown): string {
  if (value == null || (typeof value === "string" && !value.trim())) {
    throw new EstimateRequestValidationError(
      "projectNeed is required.",
      "projectNeed",
    );
  }
  if (typeof value !== "string") {
    throw new EstimateRequestValidationError(
      'Estimate request field "projectNeed" must be a string.',
      "projectNeed",
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new EstimateRequestValidationError(
      "projectNeed is required.",
      "projectNeed",
    );
  }
  if (trimmed.length < ESTIMATE_PROJECT_NEED_MIN_LENGTH) {
    throw new EstimateRequestValidationError(
      `projectNeed must be at least ${ESTIMATE_PROJECT_NEED_MIN_LENGTH} characters.`,
      "projectNeed",
    );
  }
  if (MEANINGLESS_PROJECT_NEED.test(trimmed)) {
    throw new EstimateRequestValidationError(
      "projectNeed must contain meaningful content.",
      "projectNeed",
    );
  }
  if (trimmed.length > ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed) {
    throw new EstimateRequestValidationError(
      `Estimate request field "projectNeed" exceeds maximum length of ${ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed} characters.`,
      "projectNeed",
    );
  }
  return trimmed;
}

function normalizeTimeframe(value: unknown): AthenaEstimateTimeframe | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new EstimateRequestValidationError(
      "timeframe must be a supported Estimate timeframe value.",
      "timeframe",
    );
  }
  const trimmed = value.trim();
  if (!isAthenaEstimateTimeframe(trimmed)) {
    throw new EstimateRequestValidationError(
      `Unsupported timeframe "${trimmed}". Allowed: ${ATHENA_ESTIMATE_TIMEFRAMES.join(", ")}.`,
      "timeframe",
    );
  }
  return trimmed;
}

/**
 * Normalize and validate an Estimate request from untrusted input.
 * Unknown keys are ignored. Unsupported timeframe values are rejected.
 */
export function normalizeEstimateRequest(input: unknown): EstimateRequest {
  const raw = assertObject(input);
  const projectNeed = normalizeRequiredProjectNeed(raw.projectNeed);
  const additionalContext = normalizeOptionalString(
    raw.additionalContext,
    "additionalContext",
  );
  const timeframe = normalizeTimeframe(raw.timeframe);

  const request: EstimateRequest = { projectNeed };
  if (additionalContext) request.additionalContext = additionalContext;
  if (timeframe) request.timeframe = timeframe;
  return request;
}

export function validateEstimateRequest(input: unknown): EstimateRequest {
  return normalizeEstimateRequest(input);
}
