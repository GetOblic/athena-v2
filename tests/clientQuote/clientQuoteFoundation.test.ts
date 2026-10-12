import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  applySourceEstimateForeignKeyClear,
  createDraftClientQuote,
  issueClientQuote,
  reviseIssuedClientQuote,
  updateDraftClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import {
  mapOrganizationCommercialIdentityToIssuerSnapshot,
  type OrganizationCommercialIdentity,
} from "../../services/clientQuote/clientQuoteIssuerProfile";
import {
  CLIENT_QUOTE_CALCULATION_ORDER,
  CLIENT_QUOTE_ROUNDING_CONTRACT,
  calculateClientQuote,
  currencyMinorUnitScale,
  majorAmountToMinorUnits,
} from "../../services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_APPENDIX_HEADINGS,
  seedClientQuoteFromReadyEstimate,
  shortenClientQuoteScopeSummary,
} from "../../services/clientQuote/clientQuoteSeed";
import {
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_LOGO_MIME_TYPES,
  ClientQuoteCalculationError,
  ClientQuoteLifecycleError,
  ClientQuoteValidationError,
  IssuedClientQuoteImmutableError,
  preservedSourceEstimateId,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  assertClientQuoteIssuable,
  normalizeClientQuoteDraft,
} from "../../services/clientQuote/clientQuoteValidation";
import { BRAND_LOGO_ALLOWED_MIME_TYPES } from "../../services/identity/brandIdentity";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20261009000001_create_athena_client_quote_foundation.sql";

const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ESTIMATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REVISION = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const T0 = "2026-10-09T09:00:00.000Z";
const T1 = "2026-10-09T10:00:00.000Z";
const T2 = "2026-10-09T11:00:00.000Z";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function expectCalc(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ClientQuoteCalculationError);
    assert.match(error.message, pattern);
    return true;
  });
}

function expectValidation(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ClientQuoteValidationError);
    assert.match(error.message, pattern);
    return true;
  });
}

function baseDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: { legalName: "Alpha Studio Ltd" },
    customer: { name: "Northwind" },
    projectTitle: "Portal rebuild",
    scopeSummary: "Rebuild the client portal.",
    lineItems: [
      {
        id: "line-1",
        description: "Portal rebuild",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: 1000,
        lineTotalMinor: 5,
      },
    ],
    paymentTerms: { summary: "", scheduleNote: null },
    validity: { validForDays: null, validUntil: null, note: null },
    appendix: { enabled: false, sections: [] },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    },
    finalTotal: 1,
    ...overrides,
  };
}

describe("client quote currency scales and rounding", () => {
  it("uses ISO minor-unit scales, including 0, 2, 3, and listed 4", () => {
    assert.equal(currencyMinorUnitScale("JPY"), 0);
    assert.equal(currencyMinorUnitScale("jpy"), 0);
    assert.equal(currencyMinorUnitScale("KRW"), 0);
    assert.equal(currencyMinorUnitScale("USD"), 2);
    assert.equal(currencyMinorUnitScale("eur"), 2);
    assert.equal(currencyMinorUnitScale("CHF"), 2);
    assert.equal(currencyMinorUnitScale("BHD"), 3);
    assert.equal(currencyMinorUnitScale("KWD"), 3);
    assert.equal(currencyMinorUnitScale("OMR"), 3);
    assert.equal(currencyMinorUnitScale("CLF"), 4);
    assert.equal(CLIENT_QUOTE_ROUNDING_CONTRACT, "half-away-from-zero");
    assert.deepEqual(CLIENT_QUOTE_CALCULATION_ORDER, [
      "line_extensions",
      "subtotal",
      "discount",
      "taxable_amount",
      "tax",
      "total",
    ]);
  });

  it("converts major amounts with decimal rounding and without binary scaling", () => {
    assert.equal(majorAmountToMinorUnits(1500, "JPY"), 1500);
    assert.equal(majorAmountToMinorUnits("1500.4", "JPY"), 1500);
    assert.equal(majorAmountToMinorUnits("1500.5", "JPY"), 1501);
    assert.equal(majorAmountToMinorUnits(19.99, "USD"), 1999);
    assert.equal(majorAmountToMinorUnits("1.005", "USD"), 101);
    assert.equal(majorAmountToMinorUnits(0.1 + 0.2, "USD"), 30);
    assert.equal(majorAmountToMinorUnits("1.2344", "BHD"), 1234);
    assert.equal(majorAmountToMinorUnits("1.2345", "BHD"), 1235);
    assert.equal(majorAmountToMinorUnits(1.5, "KWD"), 1500);
    assert.equal(majorAmountToMinorUnits(Number.MAX_SAFE_INTEGER, "JPY"), Number.MAX_SAFE_INTEGER);
  });

  it("rejects malformed amounts and unsupported magnitudes", () => {
    expectCalc(() => majorAmountToMinorUnits(Number.NaN, "USD"), /finite/);
    expectCalc(() => majorAmountToMinorUnits(-1, "USD"), /nonnegative/);
    expectCalc(() => majorAmountToMinorUnits("12.00 USD", "USD"), /decimal/);
    expectCalc(() => majorAmountToMinorUnits("1e+21", "USD"), /magnitude|exceeds/);
    expectCalc(() => majorAmountToMinorUnits(Number.MAX_SAFE_INTEGER, "USD"), /exceeds/);
    expectCalc(() => currencyMinorUnitScale("US"), /3-letter/);
    expectCalc(() => currencyMinorUnitScale(""), /3-letter/);
  });
});

describe("client quote financial calculator", () => {
  it("rounds fractional quantities half away from zero", () => {
    const half = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 5, scale: 1 }, unitPriceMinor: 1 }],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.deepEqual(half.lineTotalsMinor, [1]);

    const belowHalf = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 4, scale: 1 }, unitPriceMinor: 1 }],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.deepEqual(belowHalf.lineTotalsMinor, [0]);

    const twoAndAHalf = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 25, scale: 1 }, unitPriceMinor: 4000 }],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.equal(twoAndAHalf.totals.totalMinor, 10_000);
  });

  it("applies one discount then optional tax, and rounds 2.5 away from zero", () => {
    const halfUp = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5 }],
      discount: { kind: "percentage", ratePpm: 500_000 },
      tax: { kind: "none" },
    });
    assert.equal(halfUp.totals.subtotalMinor, 5);
    assert.equal(halfUp.totals.discountMinor, 3);
    assert.equal(halfUp.totals.totalMinor, 2);

    const exactHalfUnit = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 1 }],
      discount: { kind: "percentage", ratePpm: 500_000 },
      tax: { kind: "none" },
    });
    assert.equal(exactHalfUnit.totals.discountMinor, 1);
    assert.equal(exactHalfUnit.totals.totalMinor, 0);

    const mixed = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        { quantity: { coefficient: 2, scale: 0 }, unitPriceMinor: 1000 },
        { quantity: { coefficient: 15, scale: 1 }, unitPriceMinor: 1000 },
        { quantity: { coefficient: 1, scale: 1 }, unitPriceMinor: 5 },
      ],
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "percentage", ratePpm: 88_750, label: "VAT" },
    });
    assert.deepEqual(mixed.lineTotalsMinor, [2000, 1500, 1]);
    assert.equal(mixed.totals.subtotalMinor, 3501);
    assert.equal(mixed.totals.discountMinor, 350);
    assert.equal(mixed.totals.taxableMinor, 3151);
    assert.equal(mixed.totals.taxMinor, 280);
    assert.equal(mixed.totals.totalMinor, 3431);

    const fixed = calculateClientQuote({
      currencyCode: "EUR",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5000 }],
      discount: { kind: "fixed", amountMinor: 1500 },
      tax: { kind: "percentage", ratePpm: 100_000, label: null },
    });
    assert.equal(fixed.totals.discountMinor, 1500);
    assert.equal(fixed.totals.taxableMinor, 3500);
    assert.equal(fixed.totals.taxMinor, 350);
    assert.equal(fixed.totals.totalMinor, 3850);
    assert.equal(fixed.currencyCode, "EUR");
    assert.equal(fixed.currencyScale, 2);
  });

  it("keeps a zero total and rejects a discount that would go negative", () => {
    const full = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5000 }],
      discount: { kind: "percentage", ratePpm: 1_000_000 },
      tax: { kind: "percentage", ratePpm: 200_000, label: "VAT" },
    });
    assert.equal(full.totals.taxableMinor, 0);
    assert.equal(full.totals.taxMinor, 0);
    assert.equal(full.totals.totalMinor, 0);

    const exactFixed = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5000 }],
      discount: { kind: "fixed", amountMinor: 5000 },
      tax: { kind: "none" },
    });
    assert.equal(exactFixed.totals.totalMinor, 0);

    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5000 }],
          discount: { kind: "fixed", amountMinor: 5001 },
          tax: { kind: "none" },
        }),
      /exceeds the subtotal/,
    );
  });

  it("rejects overflow and malformed calculation input", () => {
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [
            {
              quantity: { coefficient: 2, scale: 0 },
              unitPriceMinor: Number.MAX_SAFE_INTEGER,
            },
          ],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /exceeds/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: Number.MAX_SAFE_INTEGER,
            },
          ],
          discount: { kind: "none" },
          tax: { kind: "percentage", ratePpm: 1_000_000, label: null },
        }),
      /exceeds/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /at least one line item/i,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 0, scale: 0 }, unitPriceMinor: 100 }],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /coefficient/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 5 }, unitPriceMinor: 100 }],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /scale/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 1.5 }],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /unit price/i,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: -1 }],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /unit price/i,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 100 }],
          discount: { kind: "percentage", ratePpm: 1.5 },
          tax: { kind: "none" },
        }),
      /discount rate/i,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 100 }],
          discount: { kind: "percentage", ratePpm: 1_000_001 },
          tax: { kind: "none" },
        }),
      /discount rate/i,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 100 }],
          discount: { kind: "none" },
          tax: { kind: "fixed" } as never,
        }),
      /tax kind/i,
    );
    const first = calculateClientQuote({
      currencyCode: "usd",
      lineItems: [{ quantity: { coefficient: 3, scale: 0 }, unitPriceMinor: 250 }],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    const second = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 3, scale: 0 }, unitPriceMinor: 250 }],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.deepEqual(first, second);
    assert.equal(first.totals.totalMinor, 750);
  });

  it("allows an incomplete draft and still refuses to issue it", () => {
    const incomplete = {
      ...baseDraft(),
      projectTitle: "",
      scopeSummary: "   ",
      lineItems: [],
      paymentTerms: { summary: "", scheduleNote: null },
      validity: { validForDays: null, validUntil: null, note: null },
    };
    expectValidation(() => normalizeClientQuoteDraft(incomplete, "USD"), /projectTitle|line item/i);
    const draft = normalizeClientQuoteDraft(incomplete, "USD", { allowIncomplete: true });
    assert.equal(draft.projectTitle, "");
    assert.equal(draft.scopeSummary, "");
    assert.equal(draft.lineItems.length, 0);
    assert.equal(draft.totals.totalMinor, 0);
    assert.deepEqual(draft.frequencyTotals, []);
    expectValidation(() => assertClientQuoteIssuable(draft), /projectTitle/i);
    const saved = createDraftClientQuote({
      id: "11111111-1111-4111-8111-111111111111",
      licenseeAccountId: "22222222-2222-4222-8222-222222222222",
      organizationId: "33333333-3333-4333-8333-333333333333",
      requestedBy: null,
      contentLanguage: "en",
      currencyCode: "USD",
      draft,
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: "2026-10-12T12:00:00.000Z",
    });
    assert.equal(saved.source_estimate_id, null);
    assert.equal(saved.quote_number, null);
    expectValidation(
      () =>
        issueClientQuote(saved, {
          quoteNumber: "Q-2026-0001",
          issuedAt: "2026-10-12T12:05:00.000Z",
          updatedAt: "2026-10-12T12:05:00.000Z",
        }),
      /projectTitle/i,
    );
    expectValidation(
      () =>
        normalizeClientQuoteDraft(
          {
            ...incomplete,
            projectTitle: "Named",
            scopeSummary: "Scoped",
            lineItems: [
              {
                id: "line-1",
                description: "",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 100,
              },
            ],
          },
          "USD",
          { allowIncomplete: true },
        ),
      /description/i,
    );
  });

  it("discards client totals and line totals", () => {
    const normalized = normalizeClientQuoteDraft(baseDraft(), "USD");
    assert.equal(normalized.totals.totalMinor, 1000);
    assert.equal(normalized.totals.subtotalMinor, 1000);
    assert.equal(normalized.lineItems[0]?.lineTotalMinor, 1000);
    assert.equal("finalTotal" in normalized, false);
    assert.equal(normalized.currencyScale, 2);
    const again = normalizeClientQuoteDraft(normalized, "USD");
    assert.deepEqual(again, normalized);
    expectValidation(
      () => normalizeClientQuoteDraft({ ...baseDraft(), currencyScale: 0 }, "USD"),
      /currencyScale/,
    );
    expectValidation(
      () =>
        normalizeClientQuoteDraft(
          {
            ...baseDraft(),
            lineItems: [
              {
                id: "line-1",
                description: "Portal rebuild",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: "1000",
              },
            ],
          },
          "USD",
        ),
      /unitPriceMinor/,
    );
  });
});

describe("client quote Ready estimate seed", () => {
  it("maps one line from recommendedClientPrice and leaves the appendix off", () => {
    const estimatePackage = {
      schemaVersion: "estimate_v1" as const,
      recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
      recommendedPriceRange: {
        low: { amount: 1, currencyCode: "USD" },
        high: { amount: 999999, currencyCode: "USD" },
      },
      scopeInterpretation: "Rebuild the portal. Keep the existing information architecture.",
      pricingRationale: "Effort matches a fixed delivery.",
      keyPriceDrivers: ["Migration volume", "Review rounds"],
      suggestedClientPositioning: "Fixed scope with acceptance criteria.",
      risksAndAssumptions: ["Brand assets are available"],
      guidanceDisclaimer: "Guidance only.",
      geographyLabel: null,
      prospect_generation_context_json: {
        composedText: "SENTINEL_PROSPECT_CONTEXT",
      },
    };
    const before = structuredClone(estimatePackage);
    Object.freeze(estimatePackage);
    Object.freeze(estimatePackage.recommendedClientPrice);

    const seeded = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      organizationNameSnapshot: " Northwind ",
      estimatePackage,
      issuer: { legalName: "Alpha Studio Ltd", website: null },
      customer: { name: "Northwind" },
    });

    assert.deepEqual(estimatePackage, before);
    assert.equal(seeded.currencyCode, "USD");
    assert.equal(seeded.draft.currencyScale, 2);
    assert.equal(seeded.draft.lineItems.length, 1);
    assert.equal(seeded.draft.lineItems[0]?.unitPriceMinor, 1_200_000);
    assert.equal(seeded.draft.lineItems[0]?.quantity.coefficient, 1);
    assert.equal(seeded.draft.lineItems[0]?.quantity.scale, 0);
    assert.equal(seeded.draft.totals.totalMinor, 1_200_000);
    assert.equal(seeded.draft.discount.kind, "none");
    assert.equal(seeded.draft.tax.kind, "none");
    assert.equal(seeded.draft.paymentTerms.summary, "");
    assert.equal(seeded.draft.validity.validForDays, null);
    assert.equal(seeded.draft.appendix.enabled, false);
    assert.equal(seeded.draft.projectTitle, "Rebuild the portal.");
    assert.equal(
      seeded.draft.scopeSummary,
      "Rebuild the portal. Keep the existing information architecture.",
    );
    assert.deepEqual(
      seeded.draft.appendix.sections.map((section) => section.heading),
      [
        CLIENT_QUOTE_APPENDIX_HEADINGS.pricingRationale,
        CLIENT_QUOTE_APPENDIX_HEADINGS.positioning,
        CLIENT_QUOTE_APPENDIX_HEADINGS.drivers,
        CLIENT_QUOTE_APPENDIX_HEADINGS.risks,
        CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
      ],
    );
    assert.equal(seeded.draft.customer.phone, null);
    assert.equal(seeded.draft.customer.email, null);
    assert.equal(seeded.draft.issuer.website, null);
    assert.equal(seeded.draft.issuer.jobTitle, null);
    assert.equal(seeded.draft.issuer.contactName, null);
    assert.equal(seeded.draft.customer.jobTitle, null);
    assert.equal(seeded.draft.customer.contactName, null);
    assert.equal(seeded.sourceEstimateSnapshot.estimateId, ESTIMATE);
    assert.equal(seeded.sourceEstimateSnapshot.organizationNameSnapshot, "Northwind");
    assert.equal(seeded.sourceEstimateSnapshot.recommendedClientPriceMinor, 1_200_000);
    const serialized = JSON.stringify(seeded);
    assert.equal(serialized.includes("SENTINEL_PROSPECT_CONTEXT"), false);
    assert.equal(serialized.includes("prospect_generation_context"), false);
    assert.equal(serialized.includes("999999"), false);
  });

  it("accepts missing optional narrative and preserves JPY and EUR scales", () => {
    const sparse = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      estimatePackage: {
        schemaVersion: "estimate_v1",
        recommendedClientPrice: { amount: 10.5, currencyCode: "eur" },
        scopeInterpretation: "Short scope.",
        geographyLabel: null,
      },
      issuer: { legalName: "Alpha Studio Ltd" },
      customer: { name: "Northwind" },
    });
    assert.equal(sparse.currencyCode, "EUR");
    assert.equal(sparse.draft.lineItems[0]?.unitPriceMinor, 1050);
    assert.equal(sparse.draft.appendix.enabled, false);
    assert.deepEqual(sparse.draft.appendix.sections, []);
    assert.equal(sparse.draft.issuer.phone, null);
    assert.equal(sparse.draft.issuer.taxIdentifier, null);
    assert.equal(sparse.draft.customer.postalAddress.line1, null);
    assert.equal(sparse.sourceEstimateSnapshot.organizationNameSnapshot, null);

    const yen = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      estimatePackage: {
        schemaVersion: "estimate_v1",
        recommendedClientPrice: { amount: 1500, currencyCode: "JPY" },
        scopeInterpretation: "Yen priced scope.",
      },
      issuer: { legalName: "Alpha Studio Ltd" },
      customer: { name: "Northwind" },
    });
    assert.equal(yen.draft.currencyScale, 0);
    assert.equal(yen.draft.totals.totalMinor, 1500);
  });

  it("shortens scope on a boundary and keeps the full text in a disabled appendix", () => {
    const full = "word ".repeat(200).trim();
    assert.ok(full.length > CLIENT_QUOTE_FIELD_LIMITS.scopeSummarySeed);
    const shortened = shortenClientQuoteScopeSummary(full);
    assert.ok(shortened.endsWith("…"));
    assert.ok(shortened.length <= CLIENT_QUOTE_FIELD_LIMITS.scopeSummarySeed);
    assert.ok(full.startsWith(shortened.slice(0, -1).trimEnd()));
    assert.equal(shortenClientQuoteScopeSummary("Already short."), "Already short.");

    const seeded = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      estimatePackage: {
        schemaVersion: "estimate_v1",
        recommendedClientPrice: { amount: 20, currencyCode: "USD" },
        scopeInterpretation: full,
        pricingRationale: "Kept in full.",
      },
      projectTitle: "Bounded delivery",
      issuer: { legalName: "Alpha Studio Ltd" },
      customer: { name: "Northwind" },
    });
    assert.equal(seeded.draft.projectTitle, "Bounded delivery");
    assert.equal(seeded.draft.lineItems[0]?.description, "Bounded delivery");
    assert.equal(seeded.draft.scopeSummary, shortened);
    assert.equal(seeded.draft.appendix.enabled, false);
    assert.equal(seeded.draft.appendix.sections[0]?.heading, "Scope interpretation");
    assert.equal(seeded.draft.appendix.sections[0]?.body, full);
    assert.equal(seeded.draft.appendix.sections[1]?.body, "Kept in full.");
  });
});

describe("client quote lifecycle", () => {
  function seededQuote() {
    const seeded = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      organizationNameSnapshot: "Northwind",
      estimatePackage: {
        schemaVersion: "estimate_v1",
        recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
        scopeInterpretation: "Rebuild the portal.",
        pricingRationale: "Fixed delivery.",
      },
      issuer: { legalName: "Alpha Studio Ltd" },
      customer: { name: "Northwind" },
    });
    return createDraftClientQuote({
      id: QUOTE,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: USER,
      contentLanguage: "en",
      currencyCode: seeded.currencyCode,
      draft: seeded.draft,
      sourceEstimateId: ESTIMATE,
      sourceEstimateSnapshot: seeded.sourceEstimateSnapshot,
      revisedFromQuoteId: null,
      createdAt: T0,
    });
  }

  it("edits drafts, freezes issued snapshots, and keeps revisions independent", () => {
    const quote = seededQuote();
    const untouched = structuredClone(quote);
    expectValidation(
      () =>
        issueClientQuote(quote, {
          quoteNumber: "Q-1001",
          issuedAt: T1,
          updatedAt: T1,
        }),
      /paymentTerms/,
    );
    assert.deepEqual(quote, untouched);

    const edited = updateDraftClientQuote(
      quote,
      {
        ...quote.draft_json,
        paymentTerms: {
          summary: "50% to start and 50% on acceptance.",
          scheduleNote: null,
        },
        validity: { validForDays: 30, validUntil: null, note: null },
        totals: quote.draft_json.totals,
      },
      { updatedAt: T1, contentLanguage: "fr" },
    );
    assert.equal(quote.draft_json.paymentTerms.summary, "");
    assert.equal(edited.status, "draft");
    assert.equal(edited.content_language, "fr");
    assert.equal(edited.quote_number, null);
    assert.equal(edited.issued_snapshot_json, null);
    assert.equal(edited.draft_json.totals.totalMinor, 1_200_000);

    const issued = issueClientQuote(edited, {
      quoteNumber: " Q-1001 ",
      issuedAt: T1,
      updatedAt: T1,
    });
    assert.equal(issued.status, "issued");
    assert.equal(issued.quote_number, "Q-1001");
    assert.equal(issued.issued_at, T1);
    assert.equal(issued.issued_snapshot_json?.schemaVersion, "client_quote_issued_v1");
    assert.equal(issued.issued_snapshot_json?.currencyCode, "USD");
    assert.equal(issued.issued_snapshot_json?.currencyScale, 2);
    assert.equal(issued.issued_snapshot_json?.contentLanguage, "fr");
    assert.equal(issued.issued_snapshot_json?.quoteNumber, "Q-1001");
    assert.equal(issued.issued_snapshot_json?.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(issued.issued_snapshot_json?.customer.name, "Northwind");
    assert.equal(
      issued.issued_snapshot_json?.totals.totalMinor,
      issued.draft_json.totals.totalMinor,
    );
    assert.equal(issued.issued_snapshot_json?.sourceEstimate?.estimateId, ESTIMATE);
    assert.equal(
      "brandPrimaryColor" in (issued.issued_snapshot_json?.issuer ?? {}),
      false,
    );
    assert.equal(issued.issued_snapshot_json?.issuer.jobTitle, null);
    assert.equal(issued.issued_snapshot_json?.customer.jobTitle, null);
    assert.equal(issued.issued_snapshot_json?.brand.primaryColor, null);
    assert.equal(issued.issued_snapshot_json?.brand.font, null);
    assert.equal(issued.issued_snapshot_json?.brand.logo, null);
    assert.equal("brand" in issued.draft_json, false);
    assert.equal(edited.status, "draft");

    const issuedBefore = structuredClone(issued);
    assert.throws(
      () =>
        updateDraftClientQuote(issued, issued.draft_json, { updatedAt: T2 }),
      (error: unknown) => error instanceof IssuedClientQuoteImmutableError,
    );
    assert.throws(
      () =>
        issueClientQuote(issued, {
          quoteNumber: "Q-1002",
          issuedAt: T2,
          updatedAt: T2,
        }),
      (error: unknown) => error instanceof IssuedClientQuoteImmutableError,
    );
    assert.deepEqual(issued, issuedBefore);

    const revision = reviseIssuedClientQuote(issued, {
      id: REVISION,
      createdAt: T2,
    });
    assert.deepEqual(issued, issuedBefore);
    assert.equal(revision.status, "draft");
    assert.equal(revision.id, REVISION);
    assert.equal(revision.quote_number, null);
    assert.equal(revision.issued_at, null);
    assert.equal(revision.issued_snapshot_json, null);
    assert.equal(revision.revised_from_quote_id, issued.id);
    assert.deepEqual(revision.draft_json.totals, issued.draft_json.totals);
    assert.equal(revision.source_estimate_snapshot?.estimateId, ESTIMATE);

    revision.draft_json.issuer.legalName = "MUTATED";
    assert.equal(issued.draft_json.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(issued.issued_snapshot_json?.issuer.legalName, "Alpha Studio Ltd");

    const changed = updateDraftClientQuote(
      reviseIssuedClientQuote(issued, { id: REVISION, createdAt: T2 }),
      {
        ...issued.draft_json,
        lineItems: issued.draft_json.lineItems.map((line, index) =>
          index === 0
            ? { ...line, unitPriceMinor: line.unitPriceMinor + 500 }
            : line,
        ),
      },
      { updatedAt: T2 },
    );
    assert.equal(changed.draft_json.totals.totalMinor, 1_200_500);
    assert.equal(issued.draft_json.totals.totalMinor, 1_200_000);
    assert.deepEqual(issued, issuedBefore);

    const reissued = issueClientQuote(changed, {
      quoteNumber: "Q-1002",
      issuedAt: T2,
      updatedAt: T2,
    });
    assert.equal(reissued.quote_number, "Q-1002");
    assert.equal(reissued.revised_from_quote_id, QUOTE);
    assert.equal(issued.quote_number, "Q-1001");

    assert.throws(
      () => reviseIssuedClientQuote(quote, { id: REVISION, createdAt: T2 }),
      (error: unknown) => error instanceof ClientQuoteLifecycleError,
    );
  });

  it("keeps the source Estimate id after the foreign key is cleared", () => {
    const issued = issueClientQuote(
      updateDraftClientQuote(
        seededQuote(),
        {
          ...seededQuote().draft_json,
          paymentTerms: { summary: "Due on receipt.", scheduleNote: null },
          validity: { validForDays: null, validUntil: "2026-12-31", note: null },
        },
        { updatedAt: T1 },
      ),
      { quoteNumber: "Q-1001", issuedAt: T1, updatedAt: T1 },
    );
    const before = structuredClone(issued);
    const cleared = applySourceEstimateForeignKeyClear(issued);
    assert.equal(cleared.source_estimate_id, null);
    assert.equal(cleared.source_estimate_snapshot?.estimateId, ESTIMATE);
    assert.equal(cleared.issued_snapshot_json?.sourceEstimate?.estimateId, ESTIMATE);
    assert.equal(preservedSourceEstimateId(cleared), ESTIMATE);
    assert.deepEqual(issued, before);
    assert.deepEqual(cleared.draft_json, before.draft_json);
    assert.deepEqual(cleared.issued_snapshot_json, before.issued_snapshot_json);
  });

  it("maps organization identity without rewriting an issued snapshot", () => {
    const organization: OrganizationCommercialIdentity & {
      email: string;
      brand_primary_color: string;
    } = {
      name: " Alpha Studio ",
      legal_name: "  Alpha Studio Ltd  ",
      business_email: "billing@alpha.example",
      email: "login@alpha.example",
      job_title: " Managing Director ",
      decision_maker: "Ada Lovelace",
      address: "1 High Street",
      address_line2: "Suite 2",
      city: "London",
      state: "Greater London",
      postal_code: "EC1A 1BB",
      country: "United Kingdom",
      phone: "+44 20 0000 0000",
      registration_number: "12345678",
      tax_identifier: "GB123",
      tax_identifier_label: "VAT",
      brand_primary_color: "#112233",
    };
    const snapshot = mapOrganizationCommercialIdentityToIssuerSnapshot(
      organization,
      " https://alpha.example ",
    );
    assert.equal(snapshot.legalName, "Alpha Studio Ltd");
    assert.equal(snapshot.tradingName, "Alpha Studio");
    assert.equal(snapshot.email, "billing@alpha.example");
    assert.notEqual(snapshot.email, organization.email);
    assert.equal(snapshot.jobTitle, "Managing Director");
    assert.equal(snapshot.contactName, "Ada Lovelace");
    assert.equal(snapshot.website, "https://alpha.example");
    assert.equal(snapshot.postalAddress.line1, "1 High Street");
    assert.equal(snapshot.postalAddress.line2, "Suite 2");
    assert.equal(snapshot.postalAddress.city, "London");
    assert.equal(snapshot.postalAddress.region, "Greater London");
    assert.equal(snapshot.postalAddress.postalCode, "EC1A 1BB");
    assert.equal(snapshot.postalAddress.country, "United Kingdom");
    assert.equal(snapshot.phone, "+44 20 0000 0000");
    assert.equal(snapshot.registrationNumber, "12345678");
    assert.equal(snapshot.taxIdentifier, "GB123");
    assert.equal(snapshot.taxIdentifierLabel, "VAT");
    assert.equal(snapshot.additionalNote, null);
    assert.equal("primaryColor" in snapshot, false);
    assert.equal("brand_primary_color" in snapshot, false);

    const issued = issueClientQuote(
      createDraftClientQuote({
        id: QUOTE,
        licenseeAccountId: LICENSEE,
        organizationId: ORG,
        requestedBy: null,
        contentLanguage: "en",
        currencyCode: "USD",
        draft: {
          ...baseDraft(),
          issuer: snapshot,
          customer: {
            name: "Northwind",
            contactName: "Pat Lee",
            jobTitle: "Buyer",
          },
          paymentTerms: { summary: "Due on receipt.", scheduleNote: null },
          validity: { validForDays: 14, validUntil: null, note: null },
        },
        sourceEstimateId: null,
        sourceEstimateSnapshot: null,
        revisedFromQuoteId: null,
        createdAt: T0,
      }),
      { quoteNumber: "Q-9", issuedAt: T1, updatedAt: T1 },
    );

    organization.legal_name = "Beta Ltd";
    organization.business_email = "other@beta.example";
    organization.job_title = "Clerk";
    const remapped = mapOrganizationCommercialIdentityToIssuerSnapshot(
      organization,
      "https://beta.example",
    );
    assert.equal(remapped.legalName, "Beta Ltd");
    assert.equal(remapped.email, "other@beta.example");
    assert.equal(remapped.jobTitle, "Clerk");
    assert.equal(remapped.website, "https://beta.example");
    assert.equal(issued.issued_snapshot_json?.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(issued.issued_snapshot_json?.issuer.email, "billing@alpha.example");
    assert.equal(issued.issued_snapshot_json?.issuer.jobTitle, "Managing Director");
    assert.equal(issued.issued_snapshot_json?.customer.contactName, "Pat Lee");
    assert.equal(issued.issued_snapshot_json?.customer.jobTitle, "Buyer");
    expectValidation(
      () =>
        mapOrganizationCommercialIdentityToIssuerSnapshot(
          { name: "Alpha Studio" },
          null,
        ),
      /legalName/,
    );
    expectValidation(
      () =>
        mapOrganizationCommercialIdentityToIssuerSnapshot({
          name: "Alpha Studio",
          legal_name: "Alpha Studio Ltd",
          business_email: "not-an-email",
        }),
      /business_email/,
    );
  });
});

describe("issued quotation brand snapshot", () => {
  it("freezes palette, font, and the quote-owned logo without copying storage", () => {
    assert.deepEqual(CLIENT_QUOTE_LOGO_MIME_TYPES, BRAND_LOGO_ALLOWED_MIME_TYPES);
    const liveOrganizationLogo =
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc/identity/logo/live.png";
    const quoteLogoPath = `quotes/${QUOTE}/logo/mark.png`;
    const contentHash = "AB".repeat(32);
    const brand = {
      primaryColor: "#112233",
      secondaryColor: "445566",
      accentColor: "#778899",
      backgroundColor: "#aabbcc",
      font: "georgia",
      brand_logo_storage_path: liveOrganizationLogo,
      logo: {
        storagePath: quoteLogoPath,
        mimeType: "image/png" as const,
        contentHash,
      },
    };
    const draft = createDraftClientQuote({
      id: QUOTE,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: null,
      contentLanguage: "en",
      currencyCode: "USD",
      draft: {
        ...baseDraft(),
        issuer: {
          legalName: "Alpha Studio Ltd",
          contactName: "Ada Lovelace",
          jobTitle: "Managing Director",
        },
        customer: {
          name: "Northwind",
          contactName: "Pat Lee",
          jobTitle: "Buyer",
        },
        paymentTerms: { summary: "Due on receipt.", scheduleNote: null },
        validity: { validForDays: 14, validUntil: null, note: null },
      },
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: T0,
    });
    const beforeIssue = structuredClone(draft);
    const issued = issueClientQuote(draft, {
      quoteNumber: "Q-1001",
      issuedAt: T1,
      updatedAt: T1,
      brand,
    });
    assert.deepEqual(draft, beforeIssue);
    brand.primaryColor = "#000000";
    brand.font = "arial";
    brand.logo.storagePath = liveOrganizationLogo;
    brand.logo.contentHash = "00".repeat(32);
    const frozen = issued.issued_snapshot_json;
    assert.equal(frozen?.brand.primaryColor, "#112233");
    assert.equal(frozen?.brand.secondaryColor, "#445566");
    assert.equal(frozen?.brand.accentColor, "#778899");
    assert.equal(frozen?.brand.backgroundColor, "#AABBCC");
    assert.equal(frozen?.brand.font, "georgia");
    assert.equal(frozen?.brand.logo?.storagePath, quoteLogoPath);
    assert.equal(frozen?.brand.logo?.mimeType, "image/png");
    assert.equal(frozen?.brand.logo?.contentHash, contentHash.toLowerCase());
    assert.equal(JSON.stringify(frozen?.brand).includes("live.png"), false);
    assert.equal(frozen?.issuer.contactName, "Ada Lovelace");
    assert.equal(frozen?.issuer.jobTitle, "Managing Director");
    assert.equal(frozen?.customer.contactName, "Pat Lee");
    assert.equal(frozen?.customer.jobTitle, "Buyer");
    assert.equal("primaryColor" in (frozen?.issuer ?? {}), false);
    assert.equal("brand" in issued.draft_json, false);

    const issuedBefore = structuredClone(issued);
    const revision = reviseIssuedClientQuote(issued, {
      id: REVISION,
      createdAt: T2,
    });
    assert.deepEqual(issued, issuedBefore);
    assert.equal(revision.status, "draft");
    assert.equal(revision.issued_snapshot_json, null);
    assert.equal(revision.draft_json.issuer.jobTitle, "Managing Director");
    assert.equal(revision.draft_json.customer.jobTitle, "Buyer");
    assert.equal("brand" in revision.draft_json, false);

    expectValidation(
      () =>
        issueClientQuote(draft, {
          quoteNumber: "Q-1001",
          issuedAt: T1,
          updatedAt: T1,
          brand: { font: "comic sans" },
        }),
      /font/,
    );
    assert.deepEqual(draft, beforeIssue);
  });
});

describe("client quote migration contract", () => {
  const sql = read(MIGRATION);
  const prospectColumns = [
    "legal_name",
    "address_line2",
    "postal_code",
    "registration_number",
    "tax_identifier",
    "tax_identifier_label",
  ];
  const organizationColumns = [
    "legal_name",
    "address",
    "address_line2",
    "city",
    "state",
    "postal_code",
    "country",
    "phone",
    "business_email",
    "decision_maker",
    "job_title",
    "registration_number",
    "tax_identifier",
    "tax_identifier_label",
  ];

  function alterStatement(table: string): string {
    const match = sql.match(new RegExp(`alter table ${table}\\b[\\s\\S]*?;`, "i"));
    assert.ok(match, `missing alter table ${table}`);
    return match[0];
  }

  it("adds nullable identity columns and keeps quotations service-role only", () => {
    assert.doesNotMatch(sql, /athena_client_quote_issuer_profiles/i);
    assert.doesNotMatch(sql, /issuer_profile/i);
    assert.equal((sql.match(/create table/gi) ?? []).length, 1);
    assert.match(sql, /create table if not exists athena_client_quotes/i);
    const prospects = alterStatement("prospects");
    for (const column of prospectColumns) {
      assert.match(
        prospects,
        new RegExp(`add column if not exists ${column} text`, "i"),
      );
    }
    assert.doesNotMatch(prospects, /not null/i);
    assert.doesNotMatch(prospects, /business_name/);
    const organizations = alterStatement("organizations");
    for (const column of organizationColumns) {
      assert.match(
        organizations,
        new RegExp(`add column if not exists ${column} text`, "i"),
      );
    }
    assert.doesNotMatch(organizations, /not null/i);
    assert.doesNotMatch(organizations, /add column if not exists name text/i);
    assert.match(
      sql,
      /business_email is the commercial contact email, not the login email/,
    );
    assert.match(sql, /references athena_estimates\(id\) on delete set null/i);
    assert.match(sql, /source_estimate_snapshot/i);
    assert.match(sql, /client_quote_source_estimate_v1/);
    assert.match(sql, /status in \('draft', 'issued'\)/);
    assert.match(sql, /client_quote_draft_v1/);
    assert.match(sql, /client_quote_issued_v1/);
    assert.match(
      sql,
      /athena_client_quotes_licensee_quote_number_uidx[\s\S]*where quote_number is not null/i,
    );
    assert.equal((sql.match(/enable row level security/g) ?? []).length, 1);
    assert.match(sql, /grant all on table athena_client_quotes to service_role/i);
    assert.match(sql, /revoke all on table athena_client_quotes from authenticated/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+authenticated\b/i);
    assert.doesNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+anon\b/i);
    assert.doesNotMatch(sql, /brand_|logo_url|primary_color/i);
    assert.doesNotMatch(sql, /alter table athena_estimates/i);
    assert.doesNotMatch(sql, /alter table athena_identity/i);
    assert.doesNotMatch(sql, /\bupdate\s+/i);
    assert.doesNotMatch(sql, /\binsert\s+into\b/i);
    assert.doesNotMatch(sql, /rename column/i);
    assert.doesNotMatch(sql, /schema_migrations|supabase_migrations/i);
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.match(sql, new RegExp(`'${language}'`));
    }
  });

  it("extends canonical types and maps organization commercial identity", () => {
    const prospect = read("services/prospects/prospectService.ts");
    const organization = read("services/organizationService.ts");
    const mapper = read("services/clientQuote/clientQuoteIssuerProfile.ts");
    assert.match(prospect, /business_name: string/);
    for (const column of prospectColumns) {
      assert.match(prospect, new RegExp(`${column}\\?:`));
    }
    assert.match(organization, /name: string/);
    for (const column of organizationColumns) {
      assert.match(organization, new RegExp(`${column}\\?:`));
    }
    assert.match(mapper, /business_email/);
    assert.match(mapper, /job_title/);
    assert.match(mapper, /decision_maker/);
    assert.match(mapper, /identityWebsite/);
    assert.doesNotMatch(mapper, /athena_client_quote_issuer_profiles|createIssuerProfile|supabase/i);
    assert.doesNotMatch(mapper, /organization\.email/);
  });

  it("stays inside the pure domain and does not touch workers or generation", () => {
    const files = [
      "services/clientQuote/clientQuoteTypes.ts",
      "services/clientQuote/clientQuoteMoney.ts",
      "services/clientQuote/clientQuoteValidation.ts",
      "services/clientQuote/clientQuoteIssuerProfile.ts",
      "services/clientQuote/clientQuoteSeed.ts",
      "services/clientQuote/clientQuoteLifecycle.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /supabase|openrouter|workers\//i);
      assert.doesNotMatch(source, /\.from\(/);
    }
    const seed = read("services/clientQuote/clientQuoteSeed.ts");
    assert.doesNotMatch(seed, /prospect_generation_context/);
    assert.doesNotMatch(seed, /athenaEstimateService/);
    const lifecycle = read("services/clientQuote/clientQuoteLifecycle.ts");
    assert.doesNotMatch(lifecycle, /createInvoice|sendEmail|stripe|enqueue/i);
  });
});

describe("client quote soft-mask migration", () => {
  const MASK_MIGRATION =
    "supabase/migrations/20261009000002_add_athena_client_quotes_deleted_at.sql";

  it("adds a nullable deleted_at column without rewriting the applied foundation", () => {
    const sql = read(MASK_MIGRATION);
    const foundation = read(MIGRATION);
    assert.match(sql, /alter table athena_client_quotes/i);
    assert.match(sql, /add column if not exists deleted_at timestamptz/i);
    assert.match(
      sql,
      /create index if not exists athena_client_quotes_licensee_active_created_idx[\s\S]*where deleted_at is null/i,
    );
    assert.doesNotMatch(sql, /not null/i);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /\bdrop\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\bupdate\s+/i);
    assert.doesNotMatch(sql, /alter table athena_estimates/i);
    assert.doesNotMatch(foundation, /deleted_at/);
  });
});

describe("client quote recurring pricing", () => {
  const ZERO_TOTALS = {
    subtotalMinor: 0,
    discountMinor: 0,
    taxableMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
  };

  function commercialDraft(overrides: Record<string, unknown> = {}) {
    return {
      ...baseDraft(),
      paymentTerms: { summary: "Due on receipt.", scheduleNote: null },
      validity: { validForDays: 30, validUntil: null, note: null },
      ...overrides,
    };
  }

  function draftQuote(draft: unknown, id = QUOTE) {
    return createDraftClientQuote({
      id,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: USER,
      contentLanguage: "en",
      currencyCode: "USD",
      draft,
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: T0,
    });
  }

  it("treats a missing frequency as one_time and keeps EST-QUOTE-1 rounding", () => {
    const lines = [
      { quantity: { coefficient: 2, scale: 0 }, unitPriceMinor: 1000 },
      { quantity: { coefficient: 15, scale: 1 }, unitPriceMinor: 1000 },
      { quantity: { coefficient: 1, scale: 1 }, unitPriceMinor: 5 },
    ];
    const discount = { kind: "percentage" as const, ratePpm: 100_000 };
    const tax = { kind: "percentage" as const, ratePpm: 88_750, label: "VAT" };
    const legacy = calculateClientQuote({
      currencyCode: "USD",
      lineItems: lines,
      discount,
      tax,
    });
    const stamped = calculateClientQuote({
      currencyCode: "USD",
      lineItems: lines.map((line) => ({ ...line, billingFrequency: "one_time" as const })),
      discount,
      tax,
    });
    assert.deepEqual(legacy, stamped);
    assert.deepEqual(legacy.lineTotalsMinor, [2000, 1500, 1]);
    assert.equal(legacy.totals.subtotalMinor, 3501);
    assert.equal(legacy.totals.discountMinor, 350);
    assert.equal(legacy.totals.taxableMinor, 3151);
    assert.equal(legacy.totals.taxMinor, 280);
    assert.equal(legacy.totals.totalMinor, 3431);
    assert.equal(legacy.frequencyTotals.length, 1);
    assert.equal(legacy.frequencyTotals[0]?.billingFrequency, "one_time");
    assert.deepEqual(legacy.totals, legacy.frequencyTotals[0]?.totals);

    const halfUp = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [{ quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 5 }],
      discount: { kind: "percentage", ratePpm: 500_000 },
      tax: { kind: "none" },
    });
    assert.equal(halfUp.totals.discountMinor, 3);
    assert.equal(halfUp.totals.totalMinor, 2);
    assert.deepEqual(halfUp.totals, halfUp.frequencyTotals[0]?.totals);

    const normalized = normalizeClientQuoteDraft(
      {
        ...baseDraft(),
        frequencyTotals: [
          {
            billingFrequency: "annually",
            totals: {
              subtotalMinor: 9,
              discountMinor: 9,
              taxableMinor: 9,
              taxMinor: 9,
              totalMinor: 9,
            },
          },
        ],
      },
      "USD",
    );
    assert.equal(normalized.schemaVersion, "client_quote_draft_v1");
    assert.equal(normalized.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(normalized.frequencyTotals?.[0]?.billingFrequency, "one_time");
    assert.equal(normalized.totals.totalMinor, 1000);
    assert.deepEqual(normalized.totals, normalized.frequencyTotals?.[0]?.totals);

    const fromNull = normalizeClientQuoteDraft(
      {
        ...baseDraft(),
        lineItems: [
          {
            id: "line-1",
            description: "Portal rebuild",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 1000,
            billingFrequency: null,
          },
        ],
      },
      "USD",
    );
    assert.equal(fromNull.lineItems[0]?.billingFrequency, "one_time");
    expectValidation(
      () =>
        normalizeClientQuoteDraft(
          {
            ...baseDraft(),
            lineItems: [
              {
                id: "line-1",
                description: "Portal rebuild",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 1000,
                billingFrequency: "weekly",
              },
            ],
          },
          "USD",
        ),
      /billingFrequency/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: 100,
              billingFrequency: "weekly" as never,
            },
          ],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /billingFrequency/,
    );
  });

  it("prices one frequency without annualizing and keeps totals equal to that group", () => {
    for (const billingFrequency of ["one_time", "monthly", "quarterly", "annually"] as const) {
      const result = calculateClientQuote({
        currencyCode: "USD",
        lineItems: [
          {
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 1000,
            billingFrequency,
          },
        ],
        discount: { kind: "none" },
        tax: { kind: "none" },
      });
      assert.equal(result.totals.totalMinor, 1000);
      assert.equal(result.frequencyTotals.length, 1);
      assert.equal(result.frequencyTotals[0]?.billingFrequency, billingFrequency);
      assert.deepEqual(result.totals, result.frequencyTotals[0]?.totals);
      assert.notEqual(result.totals.totalMinor, 12_000);
      assert.notEqual(result.totals.totalMinor, 4_000);
    }

    const quarterly = calculateClientQuote({
      currencyCode: "EUR",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 5000,
          billingFrequency: "quarterly",
        },
      ],
      discount: { kind: "fixed", amountMinor: 1500 },
      tax: { kind: "percentage", ratePpm: 100_000, label: null },
    });
    assert.equal(quarterly.totals.discountMinor, 1500);
    assert.equal(quarterly.totals.taxableMinor, 3500);
    assert.equal(quarterly.totals.taxMinor, 350);
    assert.equal(quarterly.totals.totalMinor, 3850);
    assert.deepEqual(quarterly.totals, quarterly.frequencyTotals[0]?.totals);
  });

  it("rounds percentage discount and tax independently and rejects mixed fixed discounts", () => {
    const discounted = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 5,
          billingFrequency: "one_time",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 5,
          billingFrequency: "monthly",
        },
      ],
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "none" },
    });
    assert.deepEqual(
      discounted.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time", "monthly"],
    );
    assert.equal(discounted.frequencyTotals[0]?.totals.discountMinor, 1);
    assert.equal(discounted.frequencyTotals[1]?.totals.discountMinor, 1);
    assert.equal(discounted.frequencyTotals[0]?.totals.totalMinor, 4);
    assert.equal(discounted.frequencyTotals[1]?.totals.totalMinor, 4);
    assert.deepEqual(discounted.totals, discounted.frequencyTotals[0]?.totals);
    assert.notEqual(discounted.totals.totalMinor, 9);
    assert.notEqual(
      discounted.totals.totalMinor,
      discounted.frequencyTotals[0].totals.totalMinor +
        discounted.frequencyTotals[1].totals.totalMinor,
    );

    const taxed = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 5,
          billingFrequency: "quarterly",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 5,
          billingFrequency: "monthly",
        },
      ],
      discount: { kind: "none" },
      tax: { kind: "percentage", ratePpm: 100_000, label: "VAT" },
    });
    assert.deepEqual(
      taxed.frequencyTotals.map((group) => group.billingFrequency),
      ["monthly", "quarterly"],
    );
    assert.equal(taxed.frequencyTotals[0]?.totals.taxMinor, 1);
    assert.equal(taxed.frequencyTotals[1]?.totals.taxMinor, 1);
    assert.equal(taxed.frequencyTotals[0]?.totals.totalMinor, 6);
    assert.equal(taxed.frequencyTotals[1]?.totals.totalMinor, 6);
    assert.deepEqual(taxed.totals, ZERO_TOTALS);
    assert.notEqual(taxed.totals.totalMinor, 11);
    assert.notEqual(taxed.totals.totalMinor, 12);
    assert.notEqual(taxed.totals.taxMinor, 2);

    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "USD",
          lineItems: [
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: 5000,
              billingFrequency: "one_time",
            },
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: 5000,
              billingFrequency: "annually",
            },
          ],
          discount: { kind: "fixed", amountMinor: 100 },
          tax: { kind: "none" },
        }),
      /same billing frequency/,
    );
  });

  it("keeps group order, line order, and overflow inside one frequency", () => {
    const ordered = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 400,
          billingFrequency: "quarterly",
        },
        {
          quantity: { coefficient: 5, scale: 1 },
          unitPriceMinor: 1,
          billingFrequency: "monthly",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 10,
          billingFrequency: "one_time",
        },
        {
          quantity: { coefficient: 4, scale: 1 },
          unitPriceMinor: 1,
          billingFrequency: "monthly",
        },
      ],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.deepEqual(ordered.lineTotalsMinor, [400, 1, 10, 0]);
    assert.deepEqual(
      ordered.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time", "monthly", "quarterly"],
    );
    assert.equal(ordered.frequencyTotals[1]?.totals.subtotalMinor, 1);
    assert.equal(ordered.totals.totalMinor, 10);
    assert.equal(ordered.frequencyTotals[2]?.totals.totalMinor, 400);
    assert.notEqual(ordered.totals.totalMinor, 411);

    const separated = calculateClientQuote({
      currencyCode: "JPY",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: Number.MAX_SAFE_INTEGER,
          billingFrequency: "one_time",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: Number.MAX_SAFE_INTEGER,
          billingFrequency: "annually",
        },
      ],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.equal(separated.frequencyTotals.length, 2);
    assert.equal(separated.totals.totalMinor, Number.MAX_SAFE_INTEGER);
    assert.equal(separated.frequencyTotals[0]?.totals.totalMinor, Number.MAX_SAFE_INTEGER);
    assert.equal(separated.frequencyTotals[1]?.totals.totalMinor, Number.MAX_SAFE_INTEGER);

    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "JPY",
          lineItems: [
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: Number.MAX_SAFE_INTEGER,
              billingFrequency: "monthly",
            },
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: Number.MAX_SAFE_INTEGER,
              billingFrequency: "monthly",
            },
          ],
          discount: { kind: "none" },
          tax: { kind: "none" },
        }),
      /exceeds/,
    );
    expectCalc(
      () =>
        calculateClientQuote({
          currencyCode: "JPY",
          lineItems: [
            {
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: Number.MAX_SAFE_INTEGER,
              billingFrequency: "monthly",
            },
          ],
          discount: { kind: "none" },
          tax: { kind: "percentage", ratePpm: 1_000_000, label: null },
        }),
      /exceeds/,
    );
  });

  it("seeds one one_time line and does not change the Estimate", () => {
    const estimatePackage = {
      schemaVersion: "estimate_v1" as const,
      recommendedClientPrice: { amount: 250, currencyCode: "USD" },
      scopeInterpretation: "Retain the portal.",
      prospect_generation_context_json: { composedText: "SENTINEL_PROSPECT_CONTEXT" },
    };
    const before = structuredClone(estimatePackage);
    Object.freeze(estimatePackage);
    const seeded = seedClientQuoteFromReadyEstimate({
      estimateId: ESTIMATE,
      organizationId: ORG,
      estimatePackage,
      issuer: { legalName: "Alpha Studio Ltd" },
      customer: { name: "Northwind" },
    });
    assert.deepEqual(estimatePackage, before);
    assert.equal(seeded.draft.schemaVersion, "client_quote_draft_v1");
    assert.equal(seeded.draft.lineItems.length, 1);
    assert.equal(seeded.draft.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(seeded.draft.lineItems[0]?.unitPriceMinor, 25_000);
    assert.equal(seeded.draft.frequencyTotals?.length, 1);
    assert.equal(seeded.draft.frequencyTotals?.[0]?.billingFrequency, "one_time");
    assert.deepEqual(seeded.draft.totals, seeded.draft.frequencyTotals?.[0]?.totals);
    assert.equal(JSON.stringify(seeded).includes("SENTINEL_PROSPECT_CONTEXT"), false);
  });

  it("freezes frequencies on issue and preserves them on revision", () => {
    const issued = issueClientQuote(
      draftQuote(
        commercialDraft({
          lineItems: [
            {
              id: "setup",
              description: "Setup",
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: 5000,
              billingFrequency: "one_time",
            },
            {
              id: "care",
              description: "Care plan",
              quantity: { coefficient: 1, scale: 0 },
              unitPriceMinor: 2000,
              billingFrequency: "monthly",
            },
          ],
          discount: { kind: "percentage", ratePpm: 100_000 },
          tax: { kind: "percentage", ratePpm: 100_000, label: "VAT" },
        }),
      ),
      { quoteNumber: "Q-2001", issuedAt: T1, updatedAt: T1 },
    );
    const snapshot = issued.issued_snapshot_json;
    assert.equal(snapshot?.schemaVersion, "client_quote_issued_v1");
    assert.equal(snapshot?.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(snapshot?.lineItems[1]?.billingFrequency, "monthly");
    assert.equal(snapshot?.frequencyTotals?.[0]?.totals.subtotalMinor, 5000);
    assert.equal(snapshot?.frequencyTotals?.[0]?.totals.discountMinor, 500);
    assert.equal(snapshot?.frequencyTotals?.[0]?.totals.taxMinor, 450);
    assert.equal(snapshot?.frequencyTotals?.[0]?.totals.totalMinor, 4950);
    assert.equal(snapshot?.frequencyTotals?.[1]?.billingFrequency, "monthly");
    assert.equal(snapshot?.frequencyTotals?.[1]?.totals.totalMinor, 1980);
    assert.deepEqual(snapshot?.totals, snapshot?.frequencyTotals?.[0]?.totals);
    assert.deepEqual(snapshot?.frequencyTotals, issued.draft_json.frequencyTotals);
    assert.notEqual(snapshot?.totals.totalMinor, 4950 + 1980);
    assert.notEqual(snapshot?.totals.totalMinor, 2000 * 12);

    const before = structuredClone(issued);
    const revision = reviseIssuedClientQuote(issued, { id: REVISION, createdAt: T2 });
    assert.deepEqual(issued, before);
    assert.equal(revision.draft_json.schemaVersion, "client_quote_draft_v1");
    assert.equal(revision.draft_json.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(revision.draft_json.lineItems[1]?.billingFrequency, "monthly");
    assert.deepEqual(revision.draft_json.frequencyTotals, snapshot?.frequencyTotals);
    assert.deepEqual(revision.draft_json.totals, snapshot?.totals);
  });

  it("revises a legacy issued snapshot as one_time without rewriting it", () => {
    const issued = issueClientQuote(
      draftQuote(
        commercialDraft({
          lineItems: [
            {
              id: "line-1",
              description: "Build",
              quantity: { coefficient: 2, scale: 0 },
              unitPriceMinor: 1000,
            },
            {
              id: "line-2",
              description: "Review",
              quantity: { coefficient: 15, scale: 1 },
              unitPriceMinor: 1000,
            },
            {
              id: "line-3",
              description: "Rounding",
              quantity: { coefficient: 1, scale: 1 },
              unitPriceMinor: 5,
            },
          ],
          discount: { kind: "percentage", ratePpm: 100_000 },
          tax: { kind: "percentage", ratePpm: 88_750, label: "VAT" },
        }),
      ),
      { quoteNumber: "Q-1001", issuedAt: T1, updatedAt: T1 },
    );
    const legacy = structuredClone(issued);
    const legacySnapshot = legacy.issued_snapshot_json;
    assert.ok(legacySnapshot);
    for (const line of legacySnapshot.lineItems) delete line.billingFrequency;
    delete legacySnapshot.frequencyTotals;
    for (const line of legacy.draft_json.lineItems) delete line.billingFrequency;
    delete legacy.draft_json.frequencyTotals;
    assert.equal(legacySnapshot.schemaVersion, "client_quote_issued_v1");
    assert.equal(legacySnapshot.totals.subtotalMinor, 3501);
    assert.equal(legacySnapshot.totals.discountMinor, 350);
    assert.equal(legacySnapshot.totals.taxableMinor, 3151);
    assert.equal(legacySnapshot.totals.taxMinor, 280);
    assert.equal(legacySnapshot.totals.totalMinor, 3431);
    const fingerprint = structuredClone(legacy);

    const revision = reviseIssuedClientQuote(legacy, { id: REVISION, createdAt: T2 });
    assert.deepEqual(legacy, fingerprint);
    assert.equal(JSON.stringify(legacy.issued_snapshot_json).includes("billingFrequency"), false);
    assert.equal(JSON.stringify(legacy.issued_snapshot_json).includes("frequencyTotals"), false);
    assert.equal(revision.status, "draft");
    assert.equal(revision.issued_snapshot_json, null);
    assert.equal(revision.draft_json.schemaVersion, "client_quote_draft_v1");
    assert.equal(
      revision.draft_json.lineItems.every((line) => line.billingFrequency === "one_time"),
      true,
    );
    assert.deepEqual(revision.draft_json.totals, legacySnapshot.totals);
    assert.equal(revision.draft_json.totals.totalMinor, 3431);
    assert.deepEqual(revision.draft_json.totals, revision.draft_json.frequencyTotals?.[0]?.totals);
    assert.equal(revision.draft_json.frequencyTotals?.[0]?.billingFrequency, "one_time");
  });
});
