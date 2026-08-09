/**
 * Athena V26 Estimate types (L1 foundation).
 * Persistence / request / package contracts only — no API or orchestration.
 */

export const ATHENA_ESTIMATE_STATUSES = [
  "Queued",
  "Processing",
  "Ready",
  "Processing Failed",
] as const;

export type AthenaEstimateStatus = (typeof ATHENA_ESTIMATE_STATUSES)[number];

export const ATHENA_ESTIMATE_GENERATION_STAGES = [
  "asserting_authorization",
  "loading_instruction",
  "assembling_context",
  "generating_estimate",
  "validating",
  "completed",
  "failed",
] as const;

export type AthenaEstimateGenerationStage =
  (typeof ATHENA_ESTIMATE_GENERATION_STAGES)[number];

export const ATHENA_ESTIMATE_TIMEFRAMES = [
  "asap",
  "2_4_weeks",
  "1_3_months",
  "flexible",
] as const;

export type AthenaEstimateTimeframe =
  (typeof ATHENA_ESTIMATE_TIMEFRAMES)[number];

export const ATHENA_ESTIMATE_CURRENCY_RESOLUTIONS = [
  "derived",
  "fallback",
] as const;

export type AthenaEstimateCurrencyResolution =
  (typeof ATHENA_ESTIMATE_CURRENCY_RESOLUTIONS)[number];

/** DB column may be null before Ready denormalization. */
export type AthenaEstimateCurrencyResolutionColumn =
  | AthenaEstimateCurrencyResolution
  | null;

export const ATHENA_ESTIMATE_SCHEMA_VERSION = "estimate_v1" as const;

export const ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY =
  "estimate_pricing_methodology" as const;

/**
 * Frozen Super Admin / generation-context budget for pricing methodology.
 * Enforced at update time — never silently truncated on save.
 */
export const ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS = 6_000 as const;

/**
 * Frozen Estimate request contract.
 * Validated/normalized before persistence in request_json.
 */
export type EstimateRequest = {
  projectNeed: string;
  additionalContext?: string;
  timeframe?: AthenaEstimateTimeframe;
};

export type EstimateMoney = {
  amount: number;
  currencyCode: string;
};

export type EstimatePriceRange = {
  low: EstimateMoney;
  high: EstimateMoney;
};

export type EstimateInstructionProvenance = {
  configKey: typeof ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY;
  revisionId: string | null;
  configured: boolean;
};

/**
 * Frozen Athena Estimate package contract (schemaVersion estimate_v1).
 * Ready packages are immutable — regenerate creates a new Estimate row.
 */
export type AthenaEstimatePackage = {
  schemaVersion: typeof ATHENA_ESTIMATE_SCHEMA_VERSION;
  recommendedClientPrice: EstimateMoney;
  recommendedPriceRange: EstimatePriceRange;
  scopeInterpretation: string;
  pricingRationale: string;
  keyPriceDrivers: string[];
  suggestedClientPositioning: string;
  risksAndAssumptions: string[];
  geographyLabel: string | null;
  currencyResolution: AthenaEstimateCurrencyResolution;
  guidanceDisclaimer: string;
  instructionProvenance: EstimateInstructionProvenance;
  marketResearchClaimed: false;
  competitorQuotesFabricated: false;
};

/**
 * Row shape for athena_estimates (service-role persistence).
 * Ready request_json / package_json are immutable at the service layer.
 */
export type AthenaEstimate = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  requested_by: string | null;
  organization_name_snapshot: string;
  request_json: EstimateRequest;
  status: AthenaEstimateStatus;
  generation_stage: AthenaEstimateGenerationStage | string | null;
  package_json: AthenaEstimatePackage | null;
  error_code: string | null;
  error_message: string | null;
  currency_code: string | null;
  geography_label: string | null;
  currency_resolution: AthenaEstimateCurrencyResolutionColumn;
  instruction_config_key: string | null;
  instruction_revision_id: string | null;
  instruction_configured: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Ask Athena message role for athena_estimate_messages.
 */
export type AthenaEstimateMessageRole = "user" | "assistant";

/**
 * Ask Athena durable message shape.
 * One logical conversation thread per Estimate (messages-only; no thread table).
 */
export type AthenaEstimateMessage = {
  id: string;
  estimateId: string;
  licenseeAccountId: string;
  organizationId: string;
  role: AthenaEstimateMessageRole;
  content: string;
  createdAt: string;
};

/**
 * Service-level immutability invariant for later CRUD phases.
 * Ready Estimate package/request must never be overwritten — regenerate as a new row.
 */
export class ReadyAthenaEstimateImmutableError extends Error {
  readonly code = "READY_IMMUTABLE";

  constructor(
    message = "Ready Estimates cannot be overwritten. Create a new Estimate to regenerate.",
  ) {
    super(message);
    this.name = "ReadyAthenaEstimateImmutableError";
  }
}

export function isAthenaEstimateStatus(
  value: unknown,
): value is AthenaEstimateStatus {
  return (
    typeof value === "string" &&
    (ATHENA_ESTIMATE_STATUSES as readonly string[]).includes(value)
  );
}

export function isAthenaEstimateTimeframe(
  value: unknown,
): value is AthenaEstimateTimeframe {
  return (
    typeof value === "string" &&
    (ATHENA_ESTIMATE_TIMEFRAMES as readonly string[]).includes(value)
  );
}

export function isAthenaEstimateCurrencyResolution(
  value: unknown,
): value is AthenaEstimateCurrencyResolution {
  return (
    typeof value === "string" &&
    (ATHENA_ESTIMATE_CURRENCY_RESOLUTIONS as readonly string[]).includes(value)
  );
}
