/**
 * Typed Social Planner L4 generation failures.
 * Job status / durable retries belong to L6.
 */

export const SOCIAL_PLANNER_GENERATION_ERROR_CODES = [
  "INVALID_INPUT_CONTEXT",
  "UNSUPPORTED_GENERATION_MODE",
  "PROVIDER_FAILURE",
  "MALFORMED_STRUCTURED_OUTPUT",
  "STRATEGY_VALIDATION_FAILED",
  "PACKAGE_VALIDATION_FAILED",
  "REPAIR_VALIDATION_FAILED",
  "HISTORICAL_DIVERSITY_FAILED",
  "HISTORICAL_DIVERSITY_REPAIR_FAILED",
  "SOCIAL_MEMORY_LOAD_FAILED",
  "THINK_DIFFERENTLY_DIVERGENCE_FAILED",
  "THINK_DIFFERENTLY_REPAIR_FAILED",
  "CONVERSATION_REVISION_REPAIR_FAILED",
  "CONVERSATION_REVISION_SATISFACTION_FAILED",
] as const;

export type SocialPlannerGenerationErrorCode =
  (typeof SOCIAL_PLANNER_GENERATION_ERROR_CODES)[number];

export type SocialPlannerGenerationStage =
  | "input"
  | "strategy"
  | "assets"
  | "validation"
  | "repair"
  | "repair_validation"
  | "social_memory"
  | "diversity"
  | "diversity_repair"
  | "diversity_repair_validation"
  | "think_differently_repair"
  | "source_divergence"
  | "source_divergence_repair"
  | "source_divergence_repair_validation"
  | "revision_brief"
  | "conversation_revision_repair"
  | "conversation_revision_repair_validation"
  | "revision_satisfaction";

export class SocialPlannerGenerationError extends Error {
  readonly code: SocialPlannerGenerationErrorCode;
  readonly stage: SocialPlannerGenerationStage;
  readonly retryable: boolean;
  readonly failures: string[];

  constructor(input: {
    code: SocialPlannerGenerationErrorCode;
    message: string;
    stage: SocialPlannerGenerationStage;
    retryable?: boolean;
    failures?: string[];
  }) {
    super(input.message);
    this.name = "SocialPlannerGenerationError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable ?? false;
    this.failures = input.failures ?? [];
  }
}

export class SocialCalendarPackageValidationError extends Error {
  readonly code = "PACKAGE_VALIDATION_FAILED";
  readonly kind: "structural" | "portfolio" | "budget";
  readonly failures: string[];

  constructor(
    kind: "structural" | "portfolio" | "budget",
    failures: string[],
  ) {
    super(
      failures[0] ??
        `Social Calendar package failed ${kind} validation.`,
    );
    this.name = "SocialCalendarPackageValidationError";
    this.kind = kind;
    this.failures = failures;
  }
}

export class SocialPlannerStrategyValidationError extends Error {
  readonly code = "STRATEGY_VALIDATION_FAILED";
  readonly failures: string[];

  constructor(failures: string[]) {
    super(failures[0] ?? "Social Planner weekly strategy is invalid.");
    this.name = "SocialPlannerStrategyValidationError";
    this.failures = failures;
  }
}

export const SOCIAL_PLANNER_SOCIAL_MEMORY_FAILURE_REASONS = [
  "FOREIGN_ORGANIZATION",
  "TENANT_MISMATCH",
  "LOADER_FAILED",
] as const;

export type SocialPlannerSocialMemoryFailureReason =
  (typeof SOCIAL_PLANNER_SOCIAL_MEMORY_FAILURE_REASONS)[number];

/**
 * Tenant / loader failures for historical Social Memory.
 * Security reasons must not be wrapped into a generic generation failure.
 */
export class SocialPlannerSocialMemoryError extends Error {
  readonly code = "SOCIAL_MEMORY_LOAD_FAILED";
  readonly reason: SocialPlannerSocialMemoryFailureReason;
  readonly retryable: boolean;

  constructor(input: {
    reason: SocialPlannerSocialMemoryFailureReason;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "SocialPlannerSocialMemoryError";
    this.reason = input.reason;
    this.retryable = input.retryable ?? false;
  }
}
