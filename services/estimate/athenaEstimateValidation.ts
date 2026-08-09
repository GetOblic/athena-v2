/**
 * Strict validation for AthenaEstimatePackage before persistence.
 * Incomplete or claim-violating packages must never be marked Ready.
 */

import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  isAthenaEstimateCurrencyResolution,
  type AthenaEstimatePackage,
  type EstimateInstructionProvenance,
  type EstimateMoney,
  type EstimatePriceRange,
} from "@/services/estimate/athenaEstimateTypes";

export class AthenaEstimatePackageValidationError extends Error {
  readonly code = "INVALID_PACKAGE";
  readonly details: string[];

  constructor(details: string[]) {
    super(details[0] ?? "Athena Estimate package validation failed.");
    this.name = "AthenaEstimatePackageValidationError";
    this.details = details;
  }
}

export const ESTIMATE_PACKAGE_FIELD_LIMITS = {
  scopeInterpretation: 8_000,
  pricingRationale: 8_000,
  suggestedClientPositioning: 4_000,
  guidanceDisclaimer: 4_000,
  arrayItem: 2_000,
  keyPriceDrivers: { min: 1, max: 12 },
  risksAndAssumptions: { min: 1, max: 12 },
} as const;

/** Structural ISO-4217-style currency code (three uppercase letters). */
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Light defensive rejection for obvious forbidden research/quote claims.
 * Not a broad natural-language censorship engine.
 */
const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /\blive\s+market\s+research\b/i,
  /\bmarket\s+research\s+(was\s+)?(conducted|performed|completed|obtained)\b/i,
  /\b(checked|queried|looked\s+up)\s+(the\s+)?(current\s+)?market\s+rates?\b/i,
  /\bqueried\s+(a\s+)?(live|proprietary|real[- ]time)\s+(pricing\s+)?database\b/i,
  /\b(according\s+to|from)\s+(a\s+)?live\s+pricing\s+database\b/i,
  /\bproprietary\s+(live\s+)?pricing\s+database\b/i,
  /\bsearched\s+competitor\s+pricing\b/i,
  /\b(i|we)\s+found\s+agencies\s+charging\b/i,
  /\blooked\s+(this|it|that)\s+up\s+online\b/i,
  /\b(i|we)\s+(searched|checked|looked)\s+(this\s+up\s+)?(on\s+the\s+)?(web|internet|online)\b/i,
  /\breal\s+competitor\s+quot(e|ation)s?\b/i,
  /\bcompetitor\s+quot(e|ation)s?\s+(were\s+)?(obtained|collected|gathered)\b/i,
  /\bobtained\s+real\s+competitor\b/i,
  /\bfabricated\s+competitor\s+quot(e|ation)s?\b/i,
];

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

function requireBoundedStringArray(
  value: unknown,
  path: string,
  errors: string[],
  bounds: { min: number; max: number },
): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings.`);
    return null;
  }
  if (value.length < bounds.min || value.length > bounds.max) {
    errors.push(
      `${path} must contain between ${bounds.min} and ${bounds.max} item(s).`,
    );
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || !item.trim()) {
      errors.push(`${path}[${index}] must be a non-empty string.`);
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length > ESTIMATE_PACKAGE_FIELD_LIMITS.arrayItem) {
      errors.push(
        `${path}[${index}] exceeds maximum length of ${ESTIMATE_PACKAGE_FIELD_LIMITS.arrayItem} characters.`,
      );
      continue;
    }
    items.push(trimmed);
  }

  if (items.length < bounds.min) {
    return null;
  }
  if (items.length > bounds.max) {
    return null;
  }
  return items;
}

function requireCurrencyCode(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty currency code.`);
    return null;
  }
  const code = value.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(code)) {
    errors.push(`${path} must be a 3-letter ISO currency code.`);
    return null;
  }
  return code;
}

function requirePositiveFiniteAmount(
  value: unknown,
  path: string,
  errors: string[],
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${path} must be a finite number greater than 0.`);
    return null;
  }
  return value;
}

function requireMoney(
  value: unknown,
  path: string,
  errors: string[],
): EstimateMoney | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const raw = value as Record<string, unknown>;
  const amount = requirePositiveFiniteAmount(raw.amount, `${path}.amount`, errors);
  const currencyCode = requireCurrencyCode(
    raw.currencyCode,
    `${path}.currencyCode`,
    errors,
  );
  if (amount == null || currencyCode == null) return null;
  return { amount, currencyCode };
}

function collectForbiddenClaims(text: string, path: string, errors: string[]) {
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(
        `${path} contains a forbidden market-research/competitor-quote claim.`,
      );
      break;
    }
  }
}

/**
 * Light defensive check for Ask Athena assistant replies.
 * Same pattern family as Ready package validation — not a broad classifier.
 */
export function assistantReplyContainsForbiddenEstimateClaims(
  text: string,
): boolean {
  return FORBIDDEN_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function validateInstructionProvenance(
  value: unknown,
  errors: string[],
): EstimateInstructionProvenance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("instructionProvenance must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.configKey !== ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY) {
    errors.push(
      `instructionProvenance.configKey must be "${ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY}".`,
    );
  }
  if (typeof raw.configured !== "boolean") {
    errors.push("instructionProvenance.configured must be a boolean.");
  }
  let revisionId: string | null = null;
  if (raw.revisionId == null) {
    revisionId = null;
  } else if (typeof raw.revisionId === "string" && raw.revisionId.trim()) {
    revisionId = raw.revisionId.trim();
  } else {
    errors.push(
      "instructionProvenance.revisionId must be a non-empty string or null.",
    );
  }

  if (
    raw.configKey !== ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY ||
    typeof raw.configured !== "boolean"
  ) {
    return null;
  }

  return {
    configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    revisionId,
    configured: raw.configured,
  };
}

/**
 * Validate and normalize an Athena Estimate package from untrusted input.
 */
export function validateAthenaEstimatePackage(
  input: unknown,
): AthenaEstimatePackage {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AthenaEstimatePackageValidationError([
      "Estimate package must be an object.",
    ]);
  }

  const raw = input as Record<string, unknown>;

  if (raw.schemaVersion !== ATHENA_ESTIMATE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be exactly "${ATHENA_ESTIMATE_SCHEMA_VERSION}".`,
    );
  }

  const recommendedClientPrice = requireMoney(
    raw.recommendedClientPrice,
    "recommendedClientPrice",
    errors,
  );

  let recommendedPriceRange: EstimatePriceRange | null = null;
  if (
    !raw.recommendedPriceRange ||
    typeof raw.recommendedPriceRange !== "object" ||
    Array.isArray(raw.recommendedPriceRange)
  ) {
    errors.push("recommendedPriceRange must be an object.");
  } else {
    const rangeRaw = raw.recommendedPriceRange as Record<string, unknown>;
    const low = requireMoney(rangeRaw.low, "recommendedPriceRange.low", errors);
    const high = requireMoney(
      rangeRaw.high,
      "recommendedPriceRange.high",
      errors,
    );
    if (low && high) {
      if (high.amount < low.amount) {
        errors.push("recommendedPriceRange.high must be >= recommendedPriceRange.low.");
      }
      recommendedPriceRange = { low, high };
    }
  }

  const scopeInterpretation = requireNonEmptyString(
    raw.scopeInterpretation,
    "scopeInterpretation",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.scopeInterpretation,
  );
  const pricingRationale = requireNonEmptyString(
    raw.pricingRationale,
    "pricingRationale",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.pricingRationale,
  );
  const suggestedClientPositioning = requireNonEmptyString(
    raw.suggestedClientPositioning,
    "suggestedClientPositioning",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.suggestedClientPositioning,
  );
  const guidanceDisclaimer = requireNonEmptyString(
    raw.guidanceDisclaimer,
    "guidanceDisclaimer",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.guidanceDisclaimer,
  );

  const keyPriceDrivers = requireBoundedStringArray(
    raw.keyPriceDrivers,
    "keyPriceDrivers",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.keyPriceDrivers,
  );
  const risksAndAssumptions = requireBoundedStringArray(
    raw.risksAndAssumptions,
    "risksAndAssumptions",
    errors,
    ESTIMATE_PACKAGE_FIELD_LIMITS.risksAndAssumptions,
  );

  let geographyLabel: string | null = null;
  if (raw.geographyLabel == null) {
    geographyLabel = null;
  } else if (typeof raw.geographyLabel === "string") {
    const trimmed = raw.geographyLabel.trim();
    geographyLabel = trimmed || null;
  } else {
    errors.push("geographyLabel must be a string or null.");
  }

  if (!isAthenaEstimateCurrencyResolution(raw.currencyResolution)) {
    errors.push('currencyResolution must be "derived" or "fallback".');
  }

  const instructionProvenance = validateInstructionProvenance(
    raw.instructionProvenance,
    errors,
  );

  if (raw.marketResearchClaimed !== false) {
    errors.push("marketResearchClaimed must be false.");
  }
  if (raw.competitorQuotesFabricated !== false) {
    errors.push("competitorQuotesFabricated must be false.");
  }

  // Currency consistency across all money objects
  const currencyCodes = [
    recommendedClientPrice?.currencyCode,
    recommendedPriceRange?.low.currencyCode,
    recommendedPriceRange?.high.currencyCode,
  ].filter((code): code is string => Boolean(code));
  if (currencyCodes.length > 0) {
    const expected = currencyCodes[0];
    if (currencyCodes.some((code) => code !== expected)) {
      errors.push("All money objects must use the same currencyCode.");
    }
  }

  const textSections = [
    scopeInterpretation,
    pricingRationale,
    suggestedClientPositioning,
    guidanceDisclaimer,
    ...(keyPriceDrivers ?? []),
    ...(risksAndAssumptions ?? []),
  ].filter((value): value is string => Boolean(value));

  for (const text of textSections) {
    collectForbiddenClaims(text, "package text", errors);
  }

  if (errors.length > 0) {
    throw new AthenaEstimatePackageValidationError(errors);
  }

  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: recommendedClientPrice!,
    recommendedPriceRange: recommendedPriceRange!,
    scopeInterpretation: scopeInterpretation!,
    pricingRationale: pricingRationale!,
    keyPriceDrivers: keyPriceDrivers!,
    suggestedClientPositioning: suggestedClientPositioning!,
    risksAndAssumptions: risksAndAssumptions!,
    geographyLabel,
    currencyResolution: raw.currencyResolution as "derived" | "fallback",
    guidanceDisclaimer: guidanceDisclaimer!,
    instructionProvenance: instructionProvenance!,
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

export function isCompleteAthenaEstimatePackage(value: unknown): boolean {
  try {
    validateAthenaEstimatePackage(value);
    return true;
  } catch {
    return false;
  }
}
