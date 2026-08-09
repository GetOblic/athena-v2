/**
 * Server-side Estimate package normalization + invariant enforcement (V26 L5).
 * Model JSON cannot override trusted server facts (currency, geo, provenance, flags, disclaimer).
 */

import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimatePackage,
} from "@/services/estimate/athenaEstimateTypes";
import {
  AthenaEstimatePackageValidationError,
  validateAthenaEstimatePackage,
} from "@/services/estimate/athenaEstimateValidation";
import type { EstimateGeoCurrencyResult } from "@/services/estimate/estimateGeoCurrency";
import type { ActiveEstimatePricingMethodologyInstruction } from "@/services/estimate/estimatePricingMethodologyInstruction";

export const ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED =
  "This Athena Estimate is AI-assisted commercial guidance based on Athena organization evidence, operator project guidance, GetOblic pricing methodology, and general model knowledge. It is not a live market survey, competitor quotation sourcing, or a binding quote or invoice.";

export const ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK =
  "This Athena Estimate is AI-assisted commercial guidance based on Athena organization evidence, operator project guidance, GetOblic pricing methodology, and general model knowledge. Geography and currency could not be reliably established from trusted Athena evidence, so amounts are presented in USD as fallback guidance. It is not a live market survey, competitor quotation sourcing, or a binding quote or invoice.";

export function resolveEstimateGuidanceDisclaimer(
  currencyResolution: EstimateGeoCurrencyResult["currencyResolution"],
): string {
  return currencyResolution === "fallback"
    ? ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK
    : ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED;
}

function withServerCurrencyCode(
  value: unknown,
  currencyCode: string,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return {
    ...(value as Record<string, unknown>),
    currencyCode,
  };
}

/**
 * Apply server-authoritative fields, then structurally validate.
 * Model cannot control currency/geo/provenance/disclaimer/flags — those are
 * injected before validation so malformed model copies of those fields cannot
 * false-fail (or spoof) a package that is otherwise structurally sound.
 * Pricing amounts/text still undergo full structural + claim validation.
 */
export function normalizeAndValidateEstimatePackage(input: {
  raw: unknown;
  geoCurrency: EstimateGeoCurrencyResult;
  methodology: ActiveEstimatePricingMethodologyInstruction;
}): AthenaEstimatePackage {
  if (!input.methodology.configured || !input.methodology.instructionText.trim()) {
    throw new AthenaEstimatePackageValidationError([
      "Estimate pricing methodology is not configured.",
    ]);
  }

  const rawRecord =
    input.raw && typeof input.raw === "object" && !Array.isArray(input.raw)
      ? (input.raw as Record<string, unknown>)
      : null;
  if (!rawRecord) {
    throw new AthenaEstimatePackageValidationError([
      "Estimate package must be a JSON object.",
    ]);
  }

  const currencyCode = input.geoCurrency.currencyCode;
  const currencyResolution = input.geoCurrency.currencyResolution;
  const geographyLabel = input.geoCurrency.geographyLabel;
  const disclaimer = resolveEstimateGuidanceDisclaimer(currencyResolution);

  const rawRange =
    rawRecord.recommendedPriceRange &&
    typeof rawRecord.recommendedPriceRange === "object" &&
    !Array.isArray(rawRecord.recommendedPriceRange)
      ? (rawRecord.recommendedPriceRange as Record<string, unknown>)
      : null;

  // Inject server facts before structural validate (model cannot spoof these).
  // Text sections still reject live-research / competitor-sourcing claims.
  const coerced = {
    ...rawRecord,
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: withServerCurrencyCode(
      rawRecord.recommendedClientPrice,
      currencyCode,
    ),
    recommendedPriceRange: rawRange
      ? {
          ...rawRange,
          low: withServerCurrencyCode(rawRange.low, currencyCode),
          high: withServerCurrencyCode(rawRange.high, currencyCode),
        }
      : rawRecord.recommendedPriceRange,
    geographyLabel,
    currencyResolution,
    guidanceDisclaimer: disclaimer,
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: input.methodology.revisionId,
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };

  const validated = validateAthenaEstimatePackage(coerced);

  const price = validated.recommendedClientPrice.amount;
  const low = validated.recommendedPriceRange.low.amount;
  const high = validated.recommendedPriceRange.high.amount;
  if (price < low || price > high) {
    throw new AthenaEstimatePackageValidationError([
      "recommendedClientPrice.amount must lie within recommendedPriceRange.low..high.",
    ]);
  }

  if (validated.currencyResolution !== currencyResolution) {
    throw new AthenaEstimatePackageValidationError([
      "currencyResolution must match server geoCurrency resolution.",
    ]);
  }
  if (validated.geographyLabel !== geographyLabel) {
    throw new AthenaEstimatePackageValidationError([
      "geographyLabel must match server geoCurrency label.",
    ]);
  }
  if (
    validated.recommendedClientPrice.currencyCode !== currencyCode ||
    validated.recommendedPriceRange.low.currencyCode !== currencyCode ||
    validated.recommendedPriceRange.high.currencyCode !== currencyCode
  ) {
    throw new AthenaEstimatePackageValidationError([
      "All currencyCode values must match server geoCurrency.currencyCode.",
    ]);
  }

  return validated;
}
