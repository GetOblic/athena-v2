import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertOneActiveInvoicePerSourceQuote,
  createClientInvoiceFromIssuedQuote,
  findActiveInvoiceForSourceQuote,
  issueClientInvoice,
  updateClientInvoiceDraft,
} from "../../services/clientInvoice/clientInvoiceDomain";
import {
  assertClientInvoiceNumber,
  formatClientInvoiceNumber,
  invoiceNumberYear,
  nextClientInvoiceSequence,
  parseClientInvoiceNumber,
} from "../../services/clientInvoice/clientInvoiceNumber";
import {
  ClientInvoiceLifecycleError,
  ClientInvoiceSourceOccupiedError,
  ClientInvoiceValidationError,
  IssuedClientInvoiceImmutableError,
  clientInvoiceSourceQuoteId,
} from "../../services/clientInvoice/clientInvoiceTypes";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import { calculateClientQuote } from "../../services/clientQuote/clientQuoteMoney";
import {
  formatClientQuoteNumber,
  nextClientQuoteSequence,
} from "../../services/clientQuote/clientQuoteNumber";
import type {
  AthenaClientQuote,
  ClientQuoteIssuedSnapshotV1,
} from "../../services/clientQuote/clientQuoteTypes";

const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ESTIMATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const QUOTE_2 = "99999999-9999-4999-8999-999999999999";
const INVOICE = "11111111-1111-4111-8111-111111111111";
const INVOICE_2 = "22222222-2222-4222-8222-222222222222";
const QUOTE_ISSUED_AT = "2026-01-15T08:30:00.000Z";
const CREATED = "2026-10-10T09:00:00.000Z";
const UPDATED = "2026-10-10T10:00:00.000Z";
const ISSUED_AT = "2026-10-10T23:30:00.000Z";

function expectInvoiceValidation(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ClientInvoiceValidationError);
    assert.match(error.message, pattern);
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function quotationDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: {
      legalName: "Alpha Studio Ltd",
      tradingName: "Alpha",
      postalAddress: {
        line1: "1 Harbour Road",
        line2: null,
        city: "Valletta",
        region: null,
        postalCode: "VLT 1000",
        country: "Malta",
      },
      phone: "+35620000000",
      email: "billing@alpha.example",
      website: "https://alpha.example",
      registrationNumber: "C-100",
      taxIdentifier: "MT123",
      taxIdentifierLabel: "VAT",
      contactName: "Alex Issuer",
      jobTitle: "Director",
      additionalNote: "Payee note",
    },
    customer: {
      name: "Northwind",
      contactName: "Casey Buyer",
      jobTitle: "Finance",
      postalAddress: {
        line1: "9 Dock Street",
        line2: null,
        city: "Oslo",
        region: null,
        postalCode: "0150",
        country: "Norway",
      },
      phone: "+4700000000",
      email: "ap@northwind.example",
      taxIdentifier: "NO999",
    },
    projectTitle: "Portal rebuild",
    scopeSummary: "Rebuild the client portal.",
    lineItems: [
      {
        id: "line-1",
        description: "Portal rebuild",
        quantity: { coefficient: 25, scale: 2 },
        unitPriceMinor: 1000,
        lineTotalMinor: 5,
        billingFrequency: "one_time",
      },
    ],
    paymentTerms: {
      summary: "Net 30 from invoice issue.",
      scheduleNote: "50% was described on the quotation.",
    },
    validity: {
      validForDays: 30,
      validUntil: "2026-12-31",
      note: "Offer expires with the quotation.",
    },
    appendix: {
      enabled: true,
      sections: [{ heading: "Method appendix", body: "Quotation-only method." }],
    },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    },
    ...overrides,
  };
}

function issueQuotation(
  options: {
    currencyCode?: string;
    draft?: Record<string, unknown>;
    withEstimate?: boolean;
    quoteId?: string;
    quoteNumber?: string;
  } = {},
): AthenaClientQuote {
  const withEstimate = options.withEstimate !== false;
  const quote = createDraftClientQuote({
    id: options.quoteId ?? QUOTE,
    licenseeAccountId: LICENSEE,
    organizationId: ORG,
    requestedBy: USER,
    contentLanguage: "fr",
    currencyCode: options.currencyCode ?? "EUR",
    draft: options.draft ?? quotationDraft(),
    sourceEstimateId: withEstimate ? ESTIMATE : null,
    sourceEstimateSnapshot: withEstimate
      ? {
          schemaVersion: "client_quote_source_estimate_v1",
          estimateId: ESTIMATE,
          organizationId: ORG,
          organizationNameSnapshot: "Northwind",
          estimateSchemaVersion: "estimate_v1",
          currencyCode: "USD",
          recommendedClientPriceMinor: 5000,
        }
      : null,
    revisedFromQuoteId: null,
    createdAt: "2026-01-15T08:00:00.000Z",
  });
  return issueClientQuote(quote, {
    quoteNumber: options.quoteNumber ?? "Q-2026-0007",
    issuedAt: QUOTE_ISSUED_AT,
    updatedAt: QUOTE_ISSUED_AT,
    brand: { primaryColor: "#A1B2C3" },
  });
}

function requireSnapshot(quote: AthenaClientQuote): ClientQuoteIssuedSnapshotV1 {
  const snapshot = quote.issued_snapshot_json;
  if (!snapshot) throw new Error("expected an issued quotation snapshot");
  return snapshot;
}

function convert(
  source: unknown,
  options: { id?: string; activeInvoices?: unknown } = {},
) {
  return createClientInvoiceFromIssuedQuote(source, {
    id: options.id ?? INVOICE,
    createdAt: CREATED,
    activeInvoices: options.activeInvoices,
  });
}

describe("client invoice conversion", () => {
  it("copies an issued quotation into an editable draft and recalculates totals", () => {
    const quote = issueQuotation();
    const before = structuredClone(quote);
    const snapshot = requireSnapshot(quote);
    const invoice = convert(snapshot);

    assert.equal(invoice.status, "draft");
    assert.equal(invoice.invoiceNumber, null);
    assert.equal(invoice.issueDate, null);
    assert.equal(invoice.issuedAt, null);
    assert.equal(invoice.issuedSnapshot, null);
    assert.equal(invoice.contentLanguage, "fr");
    assert.equal(invoice.currencyCode, "EUR");
    assert.equal(invoice.draft.currencyScale, 2);
    assert.equal(invoice.draft.schemaVersion, "client_invoice_draft_v1");
    assert.equal(invoice.licenseeAccountId, LICENSEE);
    assert.equal(invoice.organizationId, ORG);
    assert.deepEqual(invoice.draft.issuer, snapshot.issuer);
    assert.deepEqual(invoice.draft.customer, snapshot.customer);
    assert.equal(invoice.draft.projectTitle, "Portal rebuild");
    assert.equal(invoice.draft.scopeSummary, "Rebuild the client portal.");
    assert.deepEqual(invoice.draft.lineItems, snapshot.lineItems);
    assert.deepEqual(invoice.draft.paymentTerms, snapshot.paymentTerms);
    assert.deepEqual(invoice.draft.discount, { kind: "none" });
    assert.deepEqual(invoice.draft.tax, { kind: "none" });
    assert.equal(invoice.draft.lineItems[0]?.lineTotalMinor, 250);
    assert.equal(invoice.draft.totals.totalMinor, 250);
    assert.deepEqual(invoice.draft.frequencyTotals, snapshot.frequencyTotals);
    assert.deepEqual(invoice.draft.sourceQuote, {
      schemaVersion: "client_invoice_source_quote_v1",
      quoteId: QUOTE,
      quoteNumber: "Q-2026-0007",
      quoteIssuedAt: QUOTE_ISSUED_AT,
      quoteSchemaVersion: "client_quote_issued_v1",
      sourceEstimateId: ESTIMATE,
    });
    assert.equal(invoice.draft.paymentDueDate, null);
    assert.equal(invoice.draft.paymentInstructions, null);
    assert.equal("validity" in invoice.draft, false);
    assert.equal("appendix" in invoice.draft, false);
    assert.equal("brand" in invoice.draft, false);
    const storedBrand = snapshot.brand.primaryColor;
    assert.ok(storedBrand);
    const encoded = JSON.stringify(invoice);
    assert.equal(encoded.includes(storedBrand), false);
    assert.equal(encoded.includes("Method appendix"), false);
    assert.equal(encoded.includes("Offer expires with the quotation."), false);
    assert.equal(encoded.includes("recommendedClientPriceMinor"), false);
    assert.deepEqual(quote, before);
    assert.equal(quote.status, "issued");
    assert.equal(quote.quote_number, "Q-2026-0007");
  });

  it("discards client totals on the issued snapshot", () => {
    const snapshot = structuredClone(requireSnapshot(issueQuotation()));
    snapshot.totals = {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    };
    snapshot.lineItems[0].lineTotalMinor = 5;
    snapshot.frequencyTotals = [
      {
        billingFrequency: "annually",
        totals: {
          subtotalMinor: 1,
          discountMinor: 1,
          taxableMinor: 1,
          taxMinor: 1,
          totalMinor: 1,
        },
      },
    ];
    const invoice = convert(snapshot);
    assert.equal(invoice.draft.lineItems[0]?.lineTotalMinor, 250);
    assert.equal(invoice.draft.totals.subtotalMinor, 250);
    assert.equal(invoice.draft.totals.totalMinor, 250);
    assert.deepEqual(
      invoice.draft.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time"],
    );
  });

  it("does not mutate a frozen issued snapshot", () => {
    const snapshot = deepFreeze(structuredClone(requireSnapshot(issueQuotation())));
    const before = structuredClone(snapshot);
    const invoice = convert(snapshot);
    invoice.draft.lineItems[0].unitPriceMinor = 1;
    invoice.draft.issuer.legalName = "Changed";
    invoice.draft.totals.totalMinor = 1;
    assert.deepEqual(snapshot, before);
    assert.equal(snapshot.lineItems[0]?.unitPriceMinor, 1000);
    assert.equal(snapshot.validity.validUntil, "2026-12-31");
  });

  it("keeps estimate provenance when present and leaves it empty otherwise", () => {
    const withEstimate = convert(requireSnapshot(issueQuotation()));
    assert.equal(withEstimate.draft.sourceQuote.sourceEstimateId, ESTIMATE);
    const withoutEstimate = convert(
      requireSnapshot(issueQuotation({ withEstimate: false })),
    );
    assert.equal(withoutEstimate.draft.sourceQuote.sourceEstimateId, null);
  });

  it("rejects a draft quotation, a quote row, and a commercially invalid snapshot", () => {
    const quote = issueQuotation();
    expectInvoiceValidation(
      () => convert(quote.draft_json),
      /client_quote_issued_v1/,
    );
    expectInvoiceValidation(() => convert(quote), /client_quote_issued_v1/);
    expectInvoiceValidation(() => convert(null), /object/);
    const broken = structuredClone(requireSnapshot(quote));
    broken.lineItems = [];
    expectInvoiceValidation(() => convert(broken), /line item/i);
    const mixedFixed = structuredClone(requireSnapshot(quote));
    mixedFixed.lineItems = [
      {
        id: "once",
        description: "Setup",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: 1000,
        lineTotalMinor: 1,
        billingFrequency: "one_time",
      },
      {
        id: "month",
        description: "Care",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: 500,
        lineTotalMinor: 1,
        billingFrequency: "monthly",
      },
    ];
    mixedFixed.discount = { kind: "fixed", amountMinor: 100 };
    expectInvoiceValidation(
      () => convert(mixedFixed),
      /same billing frequency/,
    );
  });
});

describe("client invoice amounts", () => {
  it("recalculates percentage discount and tax in minor units", () => {
    const snapshot = structuredClone(
      requireSnapshot(
        issueQuotation({
          draft: quotationDraft({
            lineItems: [
              {
                id: "line-1",
                description: "Build",
                quantity: { coefficient: 2, scale: 0 },
                unitPriceMinor: 1000,
                lineTotalMinor: 1,
                billingFrequency: "one_time",
              },
            ],
            discount: { kind: "percentage", ratePpm: 100_000 },
            tax: { kind: "percentage", ratePpm: 88_750, label: "Local tax" },
          }),
        }),
      ),
    );
    snapshot.totals.totalMinor = 1;
    snapshot.lineItems[0].lineTotalMinor = 1;
    const invoice = convert(snapshot);
    const expected = calculateClientQuote({
      currencyCode: "EUR",
      lineItems: [
        {
          quantity: { coefficient: 2, scale: 0 },
          unitPriceMinor: 1000,
          billingFrequency: "one_time",
        },
      ],
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "percentage", ratePpm: 88_750, label: "Local tax" },
    });
    assert.equal(expected.totals.discountMinor, 200);
    assert.equal(expected.totals.taxMinor, 160);
    assert.equal(expected.totals.totalMinor, 1960);
    assert.deepEqual(invoice.draft.totals, expected.totals);
    assert.deepEqual(invoice.draft.frequencyTotals, expected.frequencyTotals);
    assert.equal(invoice.draft.lineItems[0]?.lineTotalMinor, 2000);
    assert.deepEqual(invoice.draft.tax, {
      kind: "percentage",
      ratePpm: 88_750,
      label: "Local tax",
    });
  });

  it("recalculates a fixed discount and rounds a fractional quantity half away from zero", () => {
    const fixed = convert(
      requireSnapshot(
        issueQuotation({
          draft: quotationDraft({
            lineItems: [
              {
                id: "line-1",
                description: "Build",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 10_000,
                lineTotalMinor: 1,
                billingFrequency: "one_time",
              },
            ],
            discount: { kind: "fixed", amountMinor: 1500 },
            tax: { kind: "percentage", ratePpm: 100_000, label: "VAT" },
          }),
        }),
      ),
    );
    assert.equal(fixed.draft.totals.discountMinor, 1500);
    assert.equal(fixed.draft.totals.taxableMinor, 8500);
    assert.equal(fixed.draft.totals.taxMinor, 850);
    assert.equal(fixed.draft.totals.totalMinor, 9350);

    const rounded = convert(
      requireSnapshot(
        issueQuotation({
          quoteId: QUOTE_2,
          draft: quotationDraft({
            lineItems: [
              {
                id: "line-1",
                description: "Fraction",
                quantity: { coefficient: 1, scale: 1 },
                unitPriceMinor: 5,
                lineTotalMinor: 0,
                billingFrequency: "one_time",
              },
            ],
          }),
        }),
      ),
      { id: INVOICE_2 },
    );
    assert.equal(rounded.draft.lineItems[0]?.lineTotalMinor, 1);
    assert.equal(rounded.draft.totals.totalMinor, 1);
  });

  it("keeps mixed billing frequencies unsummed and in canonical order", () => {
    const invoice = convert(
      requireSnapshot(
        issueQuotation({
          draft: quotationDraft({
            discount: { kind: "percentage", ratePpm: 100_000 },
            lineItems: [
              {
                id: "annual",
                description: "Annual care",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 400,
                lineTotalMinor: 1,
                billingFrequency: "annually",
              },
              {
                id: "quarter",
                description: "Quarterly care",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 300,
                lineTotalMinor: 1,
                billingFrequency: "quarterly",
              },
              {
                id: "month",
                description: "Monthly care",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 200,
                lineTotalMinor: 1,
                billingFrequency: "monthly",
              },
              {
                id: "once",
                description: "Setup",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 100,
                lineTotalMinor: 1,
                billingFrequency: "one_time",
              },
            ],
          }),
        }),
      ),
    );
    assert.deepEqual(
      invoice.draft.lineItems.map((line) => line.billingFrequency),
      ["annually", "quarterly", "monthly", "one_time"],
    );
    assert.deepEqual(
      invoice.draft.frequencyTotals.map((group) => [
        group.billingFrequency,
        group.totals.totalMinor,
      ]),
      [
        ["one_time", 90],
        ["monthly", 180],
        ["quarterly", 270],
        ["annually", 360],
      ],
    );
    assert.equal(invoice.draft.totals.totalMinor, 90);
    assert.notEqual(
      invoice.draft.totals.totalMinor,
      90 + 180 + 270 + 360,
    );
  });

  it("treats a historical quotation without frequency fields as one_time", () => {
    const historical = structuredClone(requireSnapshot(issueQuotation()));
    delete historical.frequencyTotals;
    for (const line of historical.lineItems) delete line.billingFrequency;
    historical.lineItems.push({
      id: "line-2",
      description: "Extra",
      quantity: { coefficient: 1, scale: 0 },
      unitPriceMinor: 500,
      lineTotalMinor: 9,
    });
    historical.totals.totalMinor = 9;
    const before = structuredClone(historical);
    deepFreeze(historical);
    const invoice = convert(historical);
    assert.equal(before.frequencyTotals, undefined);
    assert.equal(before.lineItems[0]?.billingFrequency, undefined);
    assert.equal(historical.frequencyTotals, undefined);
    assert.deepEqual(
      invoice.draft.lineItems.map((line) => line.billingFrequency),
      ["one_time", "one_time"],
    );
    assert.deepEqual(
      invoice.draft.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time"],
    );
    assert.equal(invoice.draft.totals.totalMinor, 750);
    assert.equal(invoice.draft.lineItems[0]?.lineTotalMinor, 250);
    assert.equal(invoice.draft.lineItems[1]?.lineTotalMinor, 500);
  });
});

describe("client invoice currency", () => {
  it("locks a historical ISO code and does not convert minor units", () => {
    const invoice = convert(
      requireSnapshot(
        issueQuotation({
          currencyCode: "jpy",
          draft: quotationDraft({
            lineItems: [
              {
                id: "line-1",
                description: "Portal rebuild",
                quantity: { coefficient: 1, scale: 0 },
                unitPriceMinor: 1500,
                lineTotalMinor: 1,
                billingFrequency: "one_time",
              },
            ],
          }),
        }),
      ),
    );
    assert.equal(invoice.currencyCode, "JPY");
    assert.equal(invoice.draft.currencyScale, 0);
    assert.equal(invoice.draft.totals.totalMinor, 1500);

    const same = updateClientInvoiceDraft(
      invoice,
      { ...invoice.draft, currencyCode: "jpy" },
      { updatedAt: UPDATED },
    );
    assert.equal(same.currencyCode, "JPY");
    assert.equal(same.draft.lineItems[0]?.unitPriceMinor, 1500);

    expectInvoiceValidation(
      () =>
        updateClientInvoiceDraft(
          invoice,
          { ...invoice.draft, currencyCode: "EUR" },
          { updatedAt: UPDATED },
        ),
      /locked/,
    );
  });

  it("rejects a same-scale currency switch", () => {
    const invoice = convert(
      requireSnapshot(issueQuotation({ currencyCode: "GBP" })),
    );
    assert.equal(invoice.currencyCode, "GBP");
    assert.equal(invoice.draft.currencyScale, 2);
    expectInvoiceValidation(
      () =>
        updateClientInvoiceDraft(
          invoice,
          { ...invoice.draft, currencyCode: "USD" },
          { updatedAt: UPDATED },
        ),
      /locked/,
    );
    assert.equal(invoice.draft.lineItems[0]?.unitPriceMinor, 1000);
  });
});

describe("client invoice dates and issue", () => {
  it("does not copy quote validity into the payment due date", () => {
    const quote = issueQuotation();
    const invoice = convert(requireSnapshot(quote));
    assert.equal(requireSnapshot(quote).validity.validUntil, "2026-12-31");
    assert.equal(requireSnapshot(quote).validity.validForDays, 30);
    assert.equal(invoice.draft.paymentDueDate, null);
    assert.equal(invoice.draft.paymentTerms.summary, "Net 30 from invoice issue.");
    assert.equal(
      invoice.draft.paymentTerms.scheduleNote,
      "50% was described on the quotation.",
    );

    const smuggled = {
      ...structuredClone(invoice.draft),
      validity: {
        validForDays: 30,
        validUntil: "2027-01-01",
        note: "Offer expires with the quotation.",
      },
      paymentDueDate: null,
    };
    const updated = updateClientInvoiceDraft(invoice, smuggled, {
      updatedAt: UPDATED,
    });
    assert.equal(updated.draft.paymentDueDate, null);
    assert.equal("validity" in updated.draft, false);
    assert.equal(invoice.draft.paymentDueDate, null);
    expectInvoiceValidation(
      () =>
        issueClientInvoice(updated, {
          invoiceNumber: "I-2026-0001",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
        }),
      /paymentDueDate is required/,
    );
  });

  it("sets invoice issue and due dates without using the quotation timestamp", () => {
    const invoice = convert(requireSnapshot(issueQuotation()));
    const draft = structuredClone(invoice.draft);
    draft.paymentDueDate = "2026-02-29";
    expectInvoiceValidation(
      () => updateClientInvoiceDraft(invoice, draft, { updatedAt: UPDATED }),
      /YYYY-MM-DD/,
    );

    draft.paymentDueDate = "2026-10-09";
    draft.paymentInstructions = "   ";
    const tooEarly = updateClientInvoiceDraft(invoice, draft, {
      updatedAt: UPDATED,
    });
    assert.equal(tooEarly.draft.paymentInstructions, null);
    expectInvoiceValidation(
      () =>
        issueClientInvoice(tooEarly, {
          invoiceNumber: "I-2026-0001",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
        }),
      /on or after/,
    );

    draft.paymentDueDate = "2026-10-10";
    draft.paymentInstructions = "  Wire to IBAN MT00.  ";
    const ready = updateClientInvoiceDraft(invoice, draft, { updatedAt: UPDATED });
    assert.equal(ready.invoiceNumber, null);
    assert.equal(ready.issueDate, null);
    const before = structuredClone(ready);
    const issued = issueClientInvoice(ready, {
      invoiceNumber: " I-2026-0001 ",
      issuedAt: ISSUED_AT,
      updatedAt: ISSUED_AT,
    });
    assert.deepEqual(ready, before);
    assert.equal(issued.status, "issued");
    assert.equal(issued.invoiceNumber, "I-2026-0001");
    assert.equal(issued.issuedAt, ISSUED_AT);
    assert.equal(issued.issueDate, "2026-10-10");
    assert.notEqual(issued.issueDate, QUOTE_ISSUED_AT.slice(0, 10));
    assert.equal(issued.draft.paymentDueDate, "2026-10-10");
    assert.equal(issued.draft.paymentInstructions, "Wire to IBAN MT00.");
    assert.equal(issued.issuedSnapshot?.schemaVersion, "client_invoice_issued_v1");
    assert.equal(issued.issuedSnapshot?.invoiceNumber, "I-2026-0001");
    assert.equal(issued.issuedSnapshot?.issueDate, "2026-10-10");
    assert.equal(issued.issuedSnapshot?.paymentDueDate, "2026-10-10");
    assert.equal(issued.issuedSnapshot?.paymentInstructions, "Wire to IBAN MT00.");
    assert.equal(issued.issuedSnapshot?.sourceQuote.quoteIssuedAt, QUOTE_ISSUED_AT);
    assert.equal(issued.draft.schemaVersion, "client_invoice_draft_v1");
    assert.notEqual(issued.draft.lineItems, issued.issuedSnapshot?.lineItems);
    issued.draft.projectTitle = "Changed after issue";
    assert.equal(issued.issuedSnapshot?.projectTitle, "Portal rebuild");
    assert.equal(issued.issuedSnapshot?.brand.primaryColor, null);
    assert.equal(issued.issuedSnapshot?.brand.logo, null);
    assert.equal("brand" in issued.draft, false);
  });

  it("accepts an explicit issue date and freezes recalculated totals", () => {
    const invoice = convert(requireSnapshot(issueQuotation()));
    const draft = structuredClone(invoice.draft);
    draft.paymentDueDate = "2026-10-11";
    draft.totals.totalMinor = 1;
    draft.lineItems[0].lineTotalMinor = 1;
    const ready = updateClientInvoiceDraft(invoice, draft, { updatedAt: UPDATED });
    ready.draft.totals.totalMinor = 1;
    const issued = issueClientInvoice(ready, {
      invoiceNumber: "I-2026-0004",
      issuedAt: ISSUED_AT,
      updatedAt: ISSUED_AT,
      issueDate: "2026-10-11",
    });
    assert.equal(issued.issueDate, "2026-10-11");
    assert.equal(issued.issuedAt, ISSUED_AT);
    assert.equal(issued.issuedSnapshot?.totals.totalMinor, 250);
    assert.equal(issued.draft.totals.totalMinor, 250);

    expectInvoiceValidation(
      () =>
        issueClientInvoice(ready, {
          invoiceNumber: "I-2026-0004",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
          issueDate: "2026-10-12",
        }),
      /on or after/,
    );
    expectInvoiceValidation(
      () =>
        issueClientInvoice(ready, {
          invoiceNumber: "Q-2026-0004",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
          issueDate: "2026-10-11",
        }),
      /I-YYYY-####/,
    );
    assert.equal(ready.status, "draft");
    assert.equal(ready.invoiceNumber, null);
  });

  it("freezes quote-owned branding onto the issued snapshot only", () => {
    const source = requireSnapshot(issueQuotation());
    const invoice = convert(source);
    const draft = structuredClone(invoice.draft);
    draft.paymentDueDate = "2026-10-10";
    const ready = updateClientInvoiceDraft(invoice, draft, { updatedAt: UPDATED });
    const logo = {
      storagePath: `quotes/${QUOTE}/logo/mark.png`,
      mimeType: "image/png" as const,
      contentHash: "AB".repeat(32),
    };
    const issued = issueClientInvoice(ready, {
      invoiceNumber: "I-2026-0008",
      issuedAt: ISSUED_AT,
      updatedAt: ISSUED_AT,
      brand: {
        primaryColor: "#112233",
        secondaryColor: null,
        accentColor: "#c2410c",
        backgroundColor: null,
        font: "times_new_roman",
        logo,
      },
    });
    assert.equal(issued.issuedSnapshot?.brand.primaryColor, "#112233");
    assert.equal(issued.issuedSnapshot?.brand.accentColor, "#C2410C");
    assert.equal(issued.issuedSnapshot?.brand.font, "times_new_roman");
    assert.equal(issued.issuedSnapshot?.brand.logo?.contentHash, "ab".repeat(32));
    assert.equal(issued.issuedSnapshot?.brand.logo?.storagePath, logo.storagePath);
    assert.equal("brand" in issued.draft, false);
    assert.equal(JSON.stringify(issued.draft).includes("#112233"), false);
    assert.equal(JSON.stringify(issued.draft).includes("mark.png"), false);
    assert.equal(source.brand.primaryColor, "#A1B2C3");
    logo.storagePath = "mutated";
    assert.equal(
      issued.issuedSnapshot?.brand.logo?.storagePath,
      `quotes/${QUOTE}/logo/mark.png`,
    );
    expectInvoiceValidation(
      () =>
        issueClientInvoice(ready, {
          invoiceNumber: "I-2026-0008",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
          brand: { primaryColor: "red" },
        }),
      /hex/,
    );
  });

  it("rejects edits and a second issue after the snapshot is frozen", () => {
    const invoice = convert(requireSnapshot(issueQuotation()));
    const draft = structuredClone(invoice.draft);
    draft.paymentDueDate = "2026-10-10";
    const ready = updateClientInvoiceDraft(invoice, draft, { updatedAt: UPDATED });
    const issued = issueClientInvoice(ready, {
      invoiceNumber: "I-2026-0001",
      issuedAt: ISSUED_AT,
      updatedAt: ISSUED_AT,
    });
    const before = structuredClone(issued);
    assert.throws(
      () => updateClientInvoiceDraft(issued, issued.draft, { updatedAt: UPDATED }),
      (error: unknown) => error instanceof IssuedClientInvoiceImmutableError,
    );
    assert.throws(
      () =>
        issueClientInvoice(issued, {
          invoiceNumber: "I-2026-0002",
          issuedAt: ISSUED_AT,
          updatedAt: ISSUED_AT,
        }),
      (error: unknown) => error instanceof IssuedClientInvoiceImmutableError,
    );
    assert.deepEqual(issued, before);
  });
});

describe("client invoice numbers", () => {
  it("formats and validates I-YYYY-#### without using the quotation sequence", () => {
    assert.equal(formatClientInvoiceNumber(2026, 1), "I-2026-0001");
    assert.equal(formatClientInvoiceNumber(2026, 10000), "I-2026-10000");
    assert.equal(formatClientQuoteNumber(2026, 1), "Q-2026-0001");
    assert.throws(
      () => formatClientInvoiceNumber(1999, 1),
      /year is out of range/,
    );
    assert.throws(
      () => formatClientInvoiceNumber(2026, 0),
      /positive integer/,
    );
    assert.equal(assertClientInvoiceNumber(" I-2026-0004 "), "I-2026-0004");
    assert.equal(parseClientInvoiceNumber("I-2026-0001"), "I-2026-0001");
    assert.equal(parseClientInvoiceNumber("I-2026-1"), null);
    assert.equal(parseClientInvoiceNumber("I-2026-00001"), null);
    assert.equal(parseClientInvoiceNumber("Q-2026-0001"), null);
    assert.equal(parseClientInvoiceNumber("I-2026-0000"), null);
    assert.equal(invoiceNumberYear(ISSUED_AT), 2026);
    assert.equal(
      nextClientInvoiceSequence(
        ["I-2026-0004", "I-2025-0099", "Q-2026-0008", "I-2026-0002", "nope"],
        2026,
      ),
      5,
    );
    assert.equal(nextClientInvoiceSequence(["Q-2026-0009"], 2026), 1);
    assert.equal(nextClientQuoteSequence(["I-2026-0009", "Q-2026-0003"], 2026), 4);
  });
});

describe("client invoice source occupancy", () => {
  it("allows one active invoice for a quotation", () => {
    const snapshot = requireSnapshot(issueQuotation());
    const first = convert(snapshot);
    const occupancy = {
      id: first.id,
      sourceQuoteId: clientInvoiceSourceQuoteId(first),
      status: first.status,
    };
    assert.equal(findActiveInvoiceForSourceQuote([occupancy], QUOTE)?.id, INVOICE);
    assert.throws(
      () => convert(snapshot, { id: INVOICE_2, activeInvoices: [occupancy] }),
      (error: unknown) => {
        assert.ok(error instanceof ClientInvoiceSourceOccupiedError);
        assert.equal(error.code, "SOURCE_QUOTE_HAS_ACTIVE_INVOICE");
        assert.equal(error.sourceQuoteId, QUOTE);
        assert.equal(error.existingInvoiceId, INVOICE);
        return true;
      },
    );
    assert.throws(
      () =>
        convert(snapshot, {
          id: INVOICE_2,
          activeInvoices: [{ ...occupancy, status: "issued" }],
        }),
      (error: unknown) => error instanceof ClientInvoiceSourceOccupiedError,
    );

    const other = convert(requireSnapshot(issueQuotation({ quoteId: QUOTE_2 })), {
      id: INVOICE_2,
      activeInvoices: [occupancy],
    });
    assert.equal(other.draft.sourceQuote.quoteId, QUOTE_2);
    assert.doesNotThrow(() =>
      assertOneActiveInvoicePerSourceQuote([
        occupancy,
        {
          id: other.id,
          sourceQuoteId: QUOTE_2,
          status: "draft",
        },
      ]),
    );
    assert.throws(
      () =>
        assertOneActiveInvoicePerSourceQuote([
          occupancy,
          {
            id: INVOICE_2,
            sourceQuoteId: QUOTE.toUpperCase(),
            status: "issued",
          },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof ClientInvoiceSourceOccupiedError);
        assert.equal(error.existingInvoiceId, INVOICE);
        return true;
      },
    );
  });

  it("keeps the source quotation fixed while a draft is edited", () => {
    const invoice = convert(requireSnapshot(issueQuotation()));
    const before = structuredClone(invoice);
    const payload = structuredClone(invoice.draft);
    payload.projectTitle = "Portal phase two";
    payload.lineItems[0].unitPriceMinor = 2000;
    payload.lineItems[0].lineTotalMinor = 1;
    payload.totals.totalMinor = 1;
    payload.frequencyTotals = [
      {
        billingFrequency: "annually",
        totals: {
          subtotalMinor: 1,
          discountMinor: 0,
          taxableMinor: 1,
          taxMinor: 0,
          totalMinor: 1,
        },
      },
    ];
    payload.sourceQuote.quoteNumber = "Q-1999-0099";
    payload.paymentDueDate = "2026-11-01";
    payload.paymentInstructions = "Bank transfer.";
    const updated = updateClientInvoiceDraft(invoice, payload, {
      updatedAt: UPDATED,
    });
    assert.deepEqual(invoice, before);
    assert.equal(updated.draft.projectTitle, "Portal phase two");
    assert.equal(updated.draft.lineItems[0]?.lineTotalMinor, 500);
    assert.equal(updated.draft.totals.totalMinor, 500);
    assert.deepEqual(
      updated.draft.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time"],
    );
    assert.equal(updated.draft.sourceQuote.quoteNumber, "Q-2026-0007");
    assert.equal(updated.draft.sourceQuote.quoteId, QUOTE);
    assert.equal(updated.currencyCode, "EUR");
    assert.equal(updated.updatedAt, UPDATED);
    expectInvoiceValidation(
      () =>
        updateClientInvoiceDraft(
          invoice,
          {
            ...payload,
            sourceQuote: { ...payload.sourceQuote, quoteId: QUOTE_2 },
          },
          { updatedAt: UPDATED },
        ),
      /fixed to the originating/,
    );
    assert.throws(
      () =>
        updateClientInvoiceDraft(
          { ...invoice, status: "voided" as "draft" },
          payload,
          { updatedAt: UPDATED },
        ),
      (error: unknown) => error instanceof ClientInvoiceLifecycleError,
    );
  });
});

describe("client invoice module boundaries", () => {
  it("stays on the quotation calculator and does not reach persistence or PDF", () => {
    const root = process.cwd();
    const domain = readFileSync(
      join(root, "services/clientInvoice/clientInvoiceDomain.ts"),
      "utf8",
    );
    const numbers = readFileSync(
      join(root, "services/clientInvoice/clientInvoiceNumber.ts"),
      "utf8",
    );
    assert.match(domain, /normalizeClientQuoteDraft/);
    assert.doesNotMatch(domain, /unitPriceMinor \*|divRoundHalfAwayFromZero/);
    assert.doesNotMatch(
      domain,
      /clientQuoteLifecycle|clientQuotePdf|supabase|athenaEstimate|pdfkit/,
    );
    assert.doesNotMatch(numbers, /clientQuoteNumber|formatClientQuoteNumber/);
  });
});
