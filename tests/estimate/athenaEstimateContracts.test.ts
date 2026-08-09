import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeEstimateRequest,
  EstimateRequestValidationError,
  ESTIMATE_REQUEST_FIELD_LIMITS,
} from "../../services/estimate/athenaEstimateRequest";
import {
  ATHENA_ESTIMATE_CURRENCY_RESOLUTIONS,
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  ATHENA_ESTIMATE_STATUSES,
  ATHENA_ESTIMATE_TIMEFRAMES,
  isAthenaEstimateStatus,
  isAthenaEstimateTimeframe,
  ReadyAthenaEstimateImmutableError,
  type AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";
import {
  AthenaEstimatePackageValidationError,
  isCompleteAthenaEstimatePackage,
  validateAthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateValidation";

function validPackage(
  overrides: Partial<AthenaEstimatePackage> = {},
): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 9000, currencyCode: "USD" },
      high: { amount: 15000, currencyCode: "USD" },
    },
    scopeInterpretation: "A bounded website redesign with CMS migration.",
    pricingRationale: "Effort aligns with mid-market delivery and review cycles.",
    keyPriceDrivers: [
      "Content migration volume",
      "Design system complexity",
      "Stakeholder review rounds",
    ],
    suggestedClientPositioning:
      "Position as a fixed-scope delivery with clear acceptance criteria.",
    risksAndAssumptions: [
      "Assumes existing brand assets are available",
      "Assumes one primary decision-maker",
    ],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer:
      "Guidance only — not a live market quote or binding commercial offer.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

describe("Athena Estimate L1 contracts", () => {
  it("1. Estimate status contract is frozen", () => {
    assert.deepEqual(ATHENA_ESTIMATE_STATUSES, [
      "Queued",
      "Processing",
      "Ready",
      "Processing Failed",
    ]);
    assert.equal(isAthenaEstimateStatus("Ready"), true);
    assert.equal(isAthenaEstimateStatus("ready"), false);
    assert.equal(isAthenaEstimateStatus("Completed"), false);
  });

  it("2. timeframe contract is frozen", () => {
    assert.deepEqual(ATHENA_ESTIMATE_TIMEFRAMES, [
      "asap",
      "2_4_weeks",
      "1_3_months",
      "flexible",
    ]);
    assert.equal(isAthenaEstimateTimeframe("asap"), true);
    assert.equal(isAthenaEstimateTimeframe("next_week"), false);
  });

  it("3. request validation requires/trims projectNeed and normalizes optionals", () => {
    const request = normalizeEstimateRequest({
      projectNeed: "  Rebuild the client portal  ",
      additionalContext: "  Include SSO  ",
      timeframe: "2_4_weeks",
      unknownKey: "ignored",
    });
    assert.deepEqual(request, {
      projectNeed: "Rebuild the client portal",
      additionalContext: "Include SSO",
      timeframe: "2_4_weeks",
    });

    assert.throws(
      () => normalizeEstimateRequest({ projectNeed: "   " }),
      EstimateRequestValidationError,
    );
    assert.throws(
      () => normalizeEstimateRequest({ projectNeed: "..." }),
      EstimateRequestValidationError,
    );
    assert.throws(
      () => normalizeEstimateRequest({ projectNeed: "ab" }),
      EstimateRequestValidationError,
    );
    assert.throws(
      () =>
        normalizeEstimateRequest({
          projectNeed: "x".repeat(ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed + 1),
        }),
      EstimateRequestValidationError,
    );
    assert.throws(
      () =>
        normalizeEstimateRequest({
          projectNeed: "Valid need",
          timeframe: "tomorrow",
        }),
      (error: unknown) =>
        error instanceof EstimateRequestValidationError &&
        error.field === "timeframe",
    );
    assert.throws(
      () => normalizeEstimateRequest("not-an-object"),
      EstimateRequestValidationError,
    );
  });

  it("4-8. package validation enforces price, currency, provenance, and forbidden claims", () => {
    const pkg = validateAthenaEstimatePackage(validPackage());
    assert.equal(pkg.schemaVersion, "estimate_v1");
    assert.equal(pkg.recommendedClientPrice.amount, 12000);
    assert.equal(pkg.marketResearchClaimed, false);
    assert.equal(pkg.competitorQuotesFabricated, false);
    assert.equal(isCompleteAthenaEstimatePackage(pkg), true);
    assert.deepEqual(ATHENA_ESTIMATE_CURRENCY_RESOLUTIONS, [
      "derived",
      "fallback",
    ]);

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({ schemaVersion: "estimate_v0" as "estimate_v1" }),
        ),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            recommendedClientPrice: { amount: 0, currencyCode: "USD" },
          }),
        ),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            recommendedPriceRange: {
              low: { amount: 20000, currencyCode: "USD" },
              high: { amount: 10000, currencyCode: "USD" },
            },
          }),
        ),
      (error: unknown) =>
        error instanceof AthenaEstimatePackageValidationError &&
        error.details.some((d) => d.includes("high must be >=")),
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
            recommendedPriceRange: {
              low: { amount: 9000, currencyCode: "EUR" },
              high: { amount: 15000, currencyCode: "USD" },
            },
          }),
        ),
      (error: unknown) =>
        error instanceof AthenaEstimatePackageValidationError &&
        error.details.some((d) => d.includes("same currencyCode")),
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            recommendedClientPrice: { amount: 12000, currencyCode: "us" },
          }),
        ),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            instructionProvenance: {
              configKey: "wrong_key" as typeof ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
              revisionId: null,
              configured: false,
            },
          }),
        ),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage({
          ...validPackage(),
          marketResearchClaimed: true,
        }),
      (error: unknown) =>
        error instanceof AthenaEstimatePackageValidationError &&
        error.details.some((d) => d.includes("marketResearchClaimed")),
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage({
          ...validPackage(),
          competitorQuotesFabricated: true,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            pricingRationale:
              "This price reflects live market research conducted last week.",
          }),
        ),
      (error: unknown) =>
        error instanceof AthenaEstimatePackageValidationError &&
        error.details.some((d) => d.includes("forbidden")),
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            scopeInterpretation:
              "Based on real competitor quotations obtained from vendors.",
          }),
        ),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        validateAthenaEstimatePackage(
          validPackage({
            suggestedClientPositioning:
              "We queried a proprietary live pricing database for this figure.",
          }),
        ),
      AthenaEstimatePackageValidationError,
    );
  });

  it("Ready Estimate immutability contract exists for later phases", () => {
    const error = new ReadyAthenaEstimateImmutableError();
    assert.equal(error.code, "READY_IMMUTABLE");
    assert.match(error.message, /cannot be overwritten/i);
  });
});
