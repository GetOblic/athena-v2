/**
 * CQ-INV-1D — Invoice service, persistence mapping, and API contracts.
 * In-memory adapters only. The invoice table is not queried.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type {
  ClientInvoiceDeps,
  StoredClientInvoice,
} from "../../services/clientInvoice/clientInvoiceDeps";
import {
  createClientInvoiceFromIssuedQuote,
  issueClientInvoice,
  updateClientInvoiceDraft,
} from "../../services/clientInvoice/clientInvoiceDomain";
import { ClientInvoiceOperationError } from "../../services/clientInvoice/clientInvoiceErrors";
import {
  clientInvoiceFailure,
  isClientInvoiceHttpFailure,
  parseUpdateClientInvoiceBody,
} from "../../services/clientInvoice/clientInvoiceHttp";
import { toPublicClientInvoice } from "../../services/clientInvoice/clientInvoicePublic";
import {
  mapClientInvoiceRow,
  maskStoredClientInvoice,
  toClientInvoiceDraftUpdate,
  toClientInvoiceInsertRow,
  toClientInvoiceIssueUpdate,
} from "../../services/clientInvoice/clientInvoiceRow";
import {
  CLIENT_INVOICE_CREATE_ATTEMPTS,
  CLIENT_INVOICE_NUMBER_ATTEMPTS,
  createClientInvoiceFromQuoteForMaster,
  getClientInvoiceForMaster,
  issueClientInvoiceForMaster,
  listActiveInvoiceQuoteLinksForMaster,
  listClientInvoicesForMaster,
  maskClientInvoiceForMaster,
  updateClientInvoiceDraftForMaster,
} from "../../services/clientInvoice/clientInvoiceService";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import type { AthenaClientQuote } from "../../services/clientQuote/clientQuoteTypes";

const ROOT = process.cwd();
const USER_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_B = "88888888-8888-4888-8888-888888888888";
const USER_NONE = "77777777-7777-4777-8777-777777777777";
const QUOTE_REQUESTER = "56565656-5656-4565-8565-565656565656";
const LICENSEE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LICENSEE_B = "99999999-9999-4999-8999-999999999999";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_FOREIGN = "12121212-1212-4121-8121-121212121212";
const ESTIMATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const QUOTE_2 = "abababab-abab-4aba-8aba-abababababab";
const WINNER = "22222222-2222-4222-8222-222222222222";
const QUOTE_ISSUED_AT = "2026-01-15T08:30:00.000Z";
const T0 = "2026-10-10T09:00:00.000Z";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function licenseeAccess(message: string): Error {
  const error = new Error(message);
  error.name = "LicenseeAccessError";
  return error;
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
      additionalNote: null,
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
      phone: null,
      email: "ap@northwind.example",
      taxIdentifier: null,
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
      scheduleNote: null,
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

function makeQuote(
  options: {
    id?: string;
    currencyCode?: string;
    draft?: Record<string, unknown>;
    status?: "draft" | "issued";
    quoteNumber?: string;
    sourceEstimate?: boolean;
  } = {},
): AthenaClientQuote {
  const withEstimate = options.sourceEstimate !== false;
  const draftQuote = createDraftClientQuote({
    id: options.id ?? QUOTE,
    licenseeAccountId: LICENSEE_A,
    organizationId: ORG,
    requestedBy: QUOTE_REQUESTER,
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
  if (options.status === "draft") return draftQuote;
  const issued = issueClientQuote(draftQuote, {
    quoteNumber: options.quoteNumber ?? "Q-2026-0007",
    issuedAt: QUOTE_ISSUED_AT,
    updatedAt: QUOTE_ISSUED_AT,
    brand: { primaryColor: "#A1B2C3" },
  });
  const snapshot = issued.issued_snapshot_json as unknown as Record<string, unknown>;
  snapshot.prospect_generation_context_json = "SECRET_CONTEXT";
  return issued;
}

type Harness = {
  deps: ClientInvoiceDeps;
  quotes: Map<string, AthenaClientQuote>;
  invoices: Map<string, StoredClientInvoice>;
  extraNumbers: string[];
  staleNumberLists: { remaining: number };
  quoteSnapshots: Map<string, string>;
  insertCalls: { count: number };
  issueWrites: { count: number };
  setNow: (value: string) => void;
  rememberQuote: (quote: AthenaClientQuote) => void;
  assertQuotesUnchanged: () => void;
};

function createHarness(): Harness {
  const quotes = new Map<string, AthenaClientQuote>();
  const invoices = new Map<string, StoredClientInvoice>();
  const quoteSnapshots = new Map<string, string>();
  const extraNumbers: string[] = [];
  const staleNumberLists = { remaining: 0 };
  const insertCalls = { count: 0 };
  const issueWrites = { count: 0 };
  let now = T0;
  let idSequence = 1;
  const masters = new Map([
    [USER_A, LICENSEE_A],
    [USER_B, LICENSEE_B],
  ]);

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  async function tick() {
    await Promise.resolve();
  }

  const deps: ClientInvoiceDeps = {
    async requireMaster(masterUserId) {
      const licenseeAccountId = masters.get(masterUserId);
      if (!licenseeAccountId) {
        throw licenseeAccess("Authenticated user is not a Business Licensee Master.");
      }
      return { licenseeAccountId, masterUserId };
    },
    async getQuote(id, licenseeAccountId) {
      await tick();
      const quote = quotes.get(id);
      if (!quote || quote.licensee_account_id !== licenseeAccountId) return null;
      return clone(quote);
    },
    async insertInvoice(invoice, requestedBy) {
      await tick();
      insertCalls.count += 1;
      const occupied = [...invoices.values()].some(
        (row) =>
          !row.deletedAt &&
          row.draft.sourceQuote.quoteId === invoice.draft.sourceQuote.quoteId,
      );
      if (occupied) return { ok: false, reason: "source_occupied" };
      const saved: StoredClientInvoice = {
        ...clone(invoice),
        requestedBy,
        deletedAt: null,
      };
      invoices.set(saved.id, saved);
      return { ok: true, invoice: clone(saved) };
    },
    async updateDraftInvoice(invoice) {
      await tick();
      const current = invoices.get(invoice.id);
      if (
        !current ||
        current.status !== "draft" ||
        current.deletedAt ||
        current.licenseeAccountId !== invoice.licenseeAccountId
      ) {
        return null;
      }
      const saved = clone(invoice);
      saved.deletedAt = null;
      invoices.set(saved.id, saved);
      return clone(saved);
    },
    async issueInvoice(invoice) {
      await tick();
      const current = invoices.get(invoice.id);
      if (
        !current ||
        current.status !== "draft" ||
        current.deletedAt ||
        current.licenseeAccountId !== invoice.licenseeAccountId
      ) {
        return { ok: false, reason: "not_draft" };
      }
      const numberTaken = [...invoices.values()].some(
        (row) =>
          row.id !== invoice.id &&
          row.licenseeAccountId === invoice.licenseeAccountId &&
          row.invoiceNumber === invoice.invoiceNumber,
      );
      if (numberTaken) return { ok: false, reason: "conflict" };
      const saved = clone(invoice);
      saved.deletedAt = null;
      invoices.set(saved.id, saved);
      issueWrites.count += 1;
      return { ok: true, invoice: clone(saved) };
    },
    async getInvoice(id, licenseeAccountId) {
      await tick();
      const invoice = invoices.get(id);
      if (!invoice || invoice.licenseeAccountId !== licenseeAccountId) return null;
      return clone(invoice);
    },
    async listInvoices(licenseeAccountId) {
      await tick();
      return [...invoices.values()]
        .filter(
          (invoice) =>
            invoice.licenseeAccountId === licenseeAccountId && !invoice.deletedAt,
        )
        .map((invoice) => clone(invoice));
    },
    async findActiveInvoiceBySourceQuote(sourceQuoteId, licenseeAccountId) {
      await tick();
      const found = [...invoices.values()].find(
        (invoice) =>
          invoice.licenseeAccountId === licenseeAccountId &&
          !invoice.deletedAt &&
          invoice.draft.sourceQuote.quoteId === sourceQuoteId,
      );
      return found ? clone(found) : null;
    },
    async maskInvoice(id, licenseeAccountId, deletedAt) {
      await tick();
      const current = invoices.get(id);
      if (!current || current.licenseeAccountId !== licenseeAccountId) return null;
      const decision = maskStoredClientInvoice(current, deletedAt);
      if (!decision.alreadyMasked) invoices.set(id, decision.invoice);
      return {
        invoice: clone(decision.invoice),
        alreadyMasked: decision.alreadyMasked,
      };
    },
    async listInvoiceNumbers(licenseeAccountId) {
      await tick();
      if (staleNumberLists.remaining > 0) {
        staleNumberLists.remaining -= 1;
        return [];
      }
      const stored = [...invoices.values()]
        .filter(
          (invoice) =>
            invoice.licenseeAccountId === licenseeAccountId && invoice.invoiceNumber,
        )
        .map((invoice) => invoice.invoiceNumber as string);
      return [...stored, ...extraNumbers];
    },
    now() {
      return now;
    },
    newId() {
      const suffix = idSequence.toString(16).padStart(12, "0");
      idSequence += 1;
      return `11111111-1111-4111-8111-${suffix}`;
    },
  };

  return {
    deps,
    quotes,
    invoices,
    extraNumbers,
    staleNumberLists,
    quoteSnapshots,
    insertCalls,
    issueWrites,
    setNow(value: string) {
      now = value;
    },
    rememberQuote(quote: AthenaClientQuote) {
      const stored = clone(quote);
      quotes.set(stored.id, stored);
      quoteSnapshots.set(stored.id, JSON.stringify(stored));
    },
    assertQuotesUnchanged() {
      for (const [id, snapshot] of quoteSnapshots) {
        assert.equal(JSON.stringify(quotes.get(id)), snapshot);
      }
    },
  };
}

async function expectCode(run: () => Promise<unknown>, code: string, message?: RegExp) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof ClientInvoiceOperationError);
    assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}

function keysOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) keysOf(entry, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    found.push(key);
    keysOf(child, found);
  }
  return found;
}

async function draftWithDueDate(
  harness: Harness,
  quoteId = QUOTE,
  paymentDueDate = "2026-10-31",
) {
  const created = await createClientInvoiceFromQuoteForMaster({
    masterUserId: USER_A,
    quoteId,
    deps: harness.deps,
  });
  const updated = await updateClientInvoiceDraftForMaster({
    masterUserId: USER_A,
    invoiceId: created.invoice.id,
    draft: {
      ...created.invoice.draft,
      paymentDueDate,
      paymentInstructions: "Wire to Alpha IBAN.",
      totals: {
        subtotalMinor: 1,
        discountMinor: 1,
        taxableMinor: 1,
        taxMinor: 1,
        totalMinor: 1,
      },
    },
    deps: harness.deps,
  });
  return updated;
}

describe("client invoice authorization", () => {
  it("requires a Licensee Master and does not read invoices for anyone else", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    await assert.rejects(
      () => listClientInvoicesForMaster(USER_NONE, harness.deps),
      (error: unknown) => error instanceof Error && error.name === "LicenseeAccessError",
    );
    const failure = clientInvoiceFailure(licenseeAccess("Authenticated user is not a Business Licensee Master."));
    assert.equal(failure.status, 403);
    assert.equal(failure.code, "LICENSEE_ACCESS_DENIED");
    assert.equal(harness.invoices.size, 0);
    harness.assertQuotesUnchanged();
  });

  it("hides another Licensee's invoices and quotations", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    assert.equal(created.created, true);
    assert.equal(created.invoice.licenseeAccountId, LICENSEE_A);
    assert.equal(created.invoice.organizationId, ORG);
    assert.equal(created.invoice.requestedBy, USER_A);
    assert.notEqual(created.invoice.requestedBy, QUOTE_REQUESTER);

    assert.deepEqual(await listClientInvoicesForMaster(USER_B, harness.deps), []);
    await expectCode(
      () =>
        getClientInvoiceForMaster({
          masterUserId: USER_B,
          invoiceId: created.invoice.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        createClientInvoiceFromQuoteForMaster({
          masterUserId: USER_B,
          quoteId: QUOTE,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_B,
          invoiceId: created.invoice.id,
          draft: created.invoice.draft,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        maskClientInvoiceForMaster({
          masterUserId: USER_B,
          invoiceId: created.invoice.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_B,
          invoiceId: created.invoice.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.invoices.size, 1);
    assert.equal(harness.invoices.get(created.invoice.id)?.status, "draft");
    harness.assertQuotesUnchanged();
  });
});

describe("client invoice source eligibility and idempotent create", () => {
  it("creates an invoice from an issued direct quote with no Estimate", async () => {
    const harness = createHarness();
    const quote = makeQuote({ sourceEstimate: false });
    assert.equal(quote.source_estimate_id, null);
    assert.equal(quote.source_estimate_snapshot, null);
    assert.equal(quote.issued_snapshot_json?.sourceEstimate, null);
    harness.rememberQuote(quote);
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: quote.id,
      deps: harness.deps,
    });
    assert.equal(created.created, true);
    assert.equal(created.invoice.status, "draft");
    assert.equal(created.invoice.draft.sourceQuote.sourceEstimateId, null);
    assert.equal(created.invoice.draft.projectTitle, "Portal rebuild");
    assert.equal(created.invoice.invoiceNumber, null);
    harness.assertQuotesUnchanged();
  });

  it("rejects a draft quotation and hides a masked or missing quotation", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote({ status: "draft" }));
    await expectCode(
      () =>
        createClientInvoiceFromQuoteForMaster({
          masterUserId: USER_A,
          quoteId: QUOTE,
          deps: harness.deps,
        }),
      "SOURCE_QUOTE_NOT_ISSUED",
    );

    const issued = makeQuote();
    issued.deleted_at = QUOTE_ISSUED_AT;
    harness.rememberQuote(issued);
    await expectCode(
      () =>
        createClientInvoiceFromQuoteForMaster({
          masterUserId: USER_A,
          quoteId: QUOTE,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        createClientInvoiceFromQuoteForMaster({
          masterUserId: USER_A,
          quoteId: QUOTE_2,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.insertCalls.count, 0);
    harness.assertQuotesUnchanged();
  });

  it("returns the existing invoice instead of inserting another", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const first = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    const second = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.invoice.id, first.invoice.id);
    assert.equal(harness.insertCalls.count, 1);
    assert.equal(harness.invoices.size, 1);
    assert.equal(first.invoice.currencyCode, "EUR");
    assert.equal(first.invoice.contentLanguage, "fr");
    assert.equal(first.invoice.invoiceNumber, null);
    assert.equal(first.invoice.draft.totals.totalMinor, 250);
    assert.equal(JSON.stringify(first.invoice).includes("SECRET_CONTEXT"), false);
    assert.equal(JSON.stringify(first.invoice).includes("#A1B2C3"), false);
    assert.equal(JSON.stringify(first.invoice).includes("Method appendix"), false);
    assert.equal(JSON.stringify(harness.quotes.get(QUOTE)).includes("SECRET_CONTEXT"), true);
    assert.equal(JSON.stringify(harness.quotes.get(QUOTE)).includes("Q-2026-0007"), true);
    harness.assertQuotesUnchanged();
  });

  it("re-reads the winner after a unique source-quote collision", async () => {
    const harness = createHarness();
    const quote = makeQuote();
    harness.rememberQuote(quote);
    const winner = createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
      id: WINNER,
      createdAt: T0,
    });
    let collisions = 0;
    const deps: ClientInvoiceDeps = {
      ...harness.deps,
      async findActiveInvoiceBySourceQuote(sourceQuoteId, licenseeAccountId) {
        if (collisions === 0) return null;
        return harness.deps.findActiveInvoiceBySourceQuote(
          sourceQuoteId,
          licenseeAccountId,
        );
      },
      async insertInvoice(invoice) {
        collisions += 1;
        assert.notEqual(invoice.id, WINNER);
        harness.invoices.set(WINNER, {
          ...winner,
          requestedBy: USER_A,
          deletedAt: null,
        });
        return { ok: false, reason: "source_occupied" };
      },
    };
    const result = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps,
    });
    assert.equal(result.created, false);
    assert.equal(result.invoice.id, WINNER);
    assert.equal(collisions, 1);
    assert.equal(harness.invoices.size, 1);
    harness.assertQuotesUnchanged();
  });

  it("keeps one invoice when two creates race", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const [left, right] = await Promise.all([
      createClientInvoiceFromQuoteForMaster({
        masterUserId: USER_A,
        quoteId: QUOTE,
        deps: harness.deps,
      }),
      createClientInvoiceFromQuoteForMaster({
        masterUserId: USER_A,
        quoteId: QUOTE,
        deps: harness.deps,
      }),
    ]);
    assert.equal(left.invoice.id, right.invoice.id);
    assert.equal(harness.invoices.size, 1);
    assert.equal(
      [...harness.invoices.values()].filter((invoice) => !invoice.deletedAt).length,
      1,
    );
    harness.assertQuotesUnchanged();
  });

  it("does not return another Licensee's row when the source quote is occupied", async () => {
    const harness = createHarness();
    const quote = makeQuote();
    harness.rememberQuote(quote);
    const foreign = createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
      id: WINNER,
      createdAt: T0,
    });
    harness.invoices.set(WINNER, {
      ...foreign,
      licenseeAccountId: LICENSEE_B,
      requestedBy: USER_B,
      deletedAt: null,
    });
    await expectCode(
      () =>
        createClientInvoiceFromQuoteForMaster({
          masterUserId: USER_A,
          quoteId: QUOTE,
          deps: harness.deps,
        }),
      "PERSISTENCE_FAILED",
    );
    assert.equal(harness.insertCalls.count, CLIENT_INVOICE_CREATE_ATTEMPTS);
    assert.equal(harness.invoices.size, 1);
    assert.equal(harness.invoices.get(WINNER)?.licenseeAccountId, LICENSEE_B);
    await expectCode(
      () =>
        getClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: WINNER,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    harness.assertQuotesUnchanged();
  });
});

describe("client invoice draft editing", () => {
  it("recalculates totals and keeps mixed frequencies unsummed", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    harness.setNow("2026-10-10T11:00:00.000Z");
    const updated = await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: created.invoice.id,
      contentLanguage: "fr",
      draft: {
        ...created.invoice.draft,
        projectTitle: "Portal rebuild phase 2",
        paymentDueDate: "2026-10-31",
        paymentInstructions: "   ",
        currencyCode: "eur",
        lineItems: [
          {
            ...created.invoice.draft.lineItems[0],
            lineTotalMinor: 5,
          },
          {
            id: "line-2",
            description: "Care",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 3000,
            lineTotalMinor: 9,
            billingFrequency: "monthly",
          },
        ],
        totals: {
          subtotalMinor: 9,
          discountMinor: 9,
          taxableMinor: 9,
          taxMinor: 9,
          totalMinor: 9,
        },
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
      deps: harness.deps,
    });
    assert.equal(updated.draft.projectTitle, "Portal rebuild phase 2");
    assert.equal(updated.draft.paymentDueDate, "2026-10-31");
    assert.equal(updated.draft.paymentInstructions, null);
    assert.equal(updated.currencyCode, "EUR");
    assert.equal(updated.contentLanguage, "fr");
    assert.equal(updated.draft.lineItems[0]?.lineTotalMinor, 250);
    assert.equal(updated.draft.lineItems[1]?.lineTotalMinor, 3000);
    assert.equal(updated.draft.totals.totalMinor, 250);
    assert.notEqual(updated.draft.totals.totalMinor, 250 + 3000);
    assert.deepEqual(
      updated.draft.frequencyTotals.map((group) => [group.billingFrequency, group.totals.totalMinor]),
      [
        ["one_time", 250],
        ["monthly", 3000],
      ],
    );
    assert.equal(updated.draft.sourceQuote.quoteId, QUOTE);
    harness.assertQuotesUnchanged();
  });

  it("locks currency, including a historical ISO code and a same-scale switch", async () => {
    const harness = createHarness();
    harness.rememberQuote(
      makeQuote({
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
    );
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    assert.equal(created.invoice.currencyCode, "JPY");
    assert.equal(created.invoice.draft.currencyScale, 0);
    assert.equal(created.invoice.draft.totals.totalMinor, 1500);
    const same = await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: created.invoice.id,
      currencyCode: "jpy",
      draft: { ...created.invoice.draft, currencyCode: "JPY" },
      deps: harness.deps,
    });
    assert.equal(same.currencyCode, "JPY");
    assert.equal(same.draft.lineItems[0]?.unitPriceMinor, 1500);
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_A,
          invoiceId: created.invoice.id,
          currencyCode: "EUR",
          draft: created.invoice.draft,
          deps: harness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /locked/,
    );
    assert.equal(harness.invoices.get(created.invoice.id)?.currencyCode, "JPY");

    const gbpHarness = createHarness();
    gbpHarness.rememberQuote(makeQuote({ currencyCode: "GBP" }));
    const gbp = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: gbpHarness.deps,
    });
    assert.equal(gbp.invoice.currencyCode, "GBP");
    assert.equal(gbp.invoice.draft.currencyScale, 2);
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_A,
          invoiceId: gbp.invoice.id,
          draft: { ...gbp.invoice.draft, currencyCode: "USD" },
          deps: gbpHarness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /locked/,
    );
    assert.equal(gbpHarness.invoices.get(gbp.invoice.id)?.draft.totals.totalMinor, 250);
    harness.assertQuotesUnchanged();
    gbpHarness.assertQuotesUnchanged();
  });

  it("locks content language and source quote, and keeps licensee authority", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_A,
          invoiceId: created.invoice.id,
          contentLanguage: "en",
          draft: created.invoice.draft,
          deps: harness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /contentLanguage is locked/,
    );
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_A,
          invoiceId: created.invoice.id,
          draft: {
            ...created.invoice.draft,
            sourceQuote: { ...created.invoice.draft.sourceQuote, quoteId: QUOTE_2 },
          },
          deps: harness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /sourceQuote is fixed/,
    );
    const kept = await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: created.invoice.id,
      draft: {
        ...created.invoice.draft,
        licenseeAccountId: LICENSEE_B,
        organizationId: ORG_FOREIGN,
      },
      deps: harness.deps,
    });
    assert.equal(kept.licenseeAccountId, LICENSEE_A);
    assert.equal(kept.organizationId, ORG);
    assert.equal(kept.contentLanguage, "fr");
    assert.equal(kept.draft.sourceQuote.quoteId, QUOTE);
    harness.assertQuotesUnchanged();
  });

  it("keeps a historical quotation without frequency fields as one_time", async () => {
    const harness = createHarness();
    const historical = makeQuote();
    const snapshot = historical.issued_snapshot_json;
    if (!snapshot) throw new Error("expected snapshot");
    delete snapshot.frequencyTotals;
    for (const line of snapshot.lineItems) delete line.billingFrequency;
    snapshot.lineItems.push({
      id: "line-2",
      description: "Extra",
      quantity: { coefficient: 1, scale: 0 },
      unitPriceMinor: 500,
      lineTotalMinor: 9,
    });
    snapshot.totals.totalMinor = 9;
    harness.rememberQuote(historical);
    const created = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    assert.equal(created.invoice.draft.totals.totalMinor, 750);
    assert.deepEqual(
      created.invoice.draft.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time"],
    );
    assert.equal(historical.issued_snapshot_json?.frequencyTotals, undefined);
    assert.equal(harness.quotes.get(QUOTE)?.issued_snapshot_json?.frequencyTotals, undefined);
    harness.assertQuotesUnchanged();
  });
});

describe("client invoice issue, numbering, and immutability", () => {
  it("validates the payment due date against the UTC issue date", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const missing = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    harness.setNow("2026-10-10T23:30:00.000Z");
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: missing.invoice.id,
          deps: harness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /paymentDueDate is required/,
    );
    assert.equal(harness.issueWrites.count, 0);
    assert.equal(harness.invoices.get(missing.invoice.id)?.status, "draft");

    await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: missing.invoice.id,
      draft: { ...missing.invoice.draft, paymentDueDate: "2026-10-09" },
      deps: harness.deps,
    });
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: missing.invoice.id,
          deps: harness.deps,
        }),
      "INVALID_CLIENT_INVOICE",
      /on or after the invoice issue date/,
    );
    assert.equal(harness.invoices.get(missing.invoice.id)?.invoiceNumber, null);

    const ready = await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: missing.invoice.id,
      draft: {
        ...missing.invoice.draft,
        paymentDueDate: "2026-10-10",
        paymentInstructions: "Wire to Alpha IBAN.",
      },
      deps: harness.deps,
    });
    const issued = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: ready.id,
      deps: harness.deps,
    });
    assert.equal(issued.status, "issued");
    assert.equal(issued.invoiceNumber, "I-2026-0001");
    assert.equal(issued.issueDate, "2026-10-10");
    assert.equal(issued.issuedAt, "2026-10-10T23:30:00.000Z");
    assert.equal(issued.issuedSnapshot?.paymentDueDate, "2026-10-10");
    assert.equal(issued.issuedSnapshot?.paymentInstructions, "Wire to Alpha IBAN.");
    assert.equal(issued.issuedSnapshot?.invoiceNumber, "I-2026-0001");
    assert.equal(issued.issuedSnapshot?.brand.primaryColor, "#A1B2C3");
    assert.equal(issued.issuedSnapshot?.brand.logo, null);
    assert.equal("brand" in issued.draft, false);
    assert.notEqual(issued.invoiceNumber, "Q-2026-0007");
    const quote = harness.quotes.get(QUOTE);
    if (quote?.issued_snapshot_json) {
      quote.issued_snapshot_json.brand.primaryColor = "#FFFFFF";
    }
    const again = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: issued.id,
      deps: harness.deps,
    });
    assert.equal(again.issuedSnapshot?.brand.primaryColor, "#A1B2C3");
    if (quote?.issued_snapshot_json) {
      quote.issued_snapshot_json.brand.primaryColor = "#A1B2C3";
    }
    harness.assertQuotesUnchanged();
  });

  it("retries a number collision and reserves masked numbers", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    harness.rememberQuote(makeQuote({ id: QUOTE_2, quoteNumber: "Q-2026-0008" }));
    harness.extraNumbers.push("I-2026-0004", "Q-2026-0099", "I-2025-0099", "NOT-A-NUMBER");
    const first = await draftWithDueDate(harness, QUOTE);
    const issued = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: first.id,
      deps: harness.deps,
    });
    assert.equal(issued.invoiceNumber, "I-2026-0005");

    const second = await draftWithDueDate(harness, QUOTE_2);
    let conflicts = 0;
    const conflicting: ClientInvoiceDeps = {
      ...harness.deps,
      async issueInvoice(invoice) {
        if (conflicts < 1) {
          conflicts += 1;
          return { ok: false, reason: "conflict" };
        }
        return harness.deps.issueInvoice(invoice);
      },
    };
    const retried = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: second.id,
      deps: conflicting,
    });
    assert.equal(conflicts, 1);
    assert.equal(retried.invoiceNumber, "I-2026-0007");

    const masked = await maskClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: issued.id,
      deps: harness.deps,
    });
    assert.equal(masked.alreadyMasked, false);
    const numbers = await harness.deps.listInvoiceNumbers(LICENSEE_A);
    assert.ok(numbers.includes("I-2026-0005"));
    assert.ok(numbers.includes("I-2026-0007"));
    harness.assertQuotesUnchanged();
  });

  it("assigns distinct numbers when two issues race on a stale list", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    harness.rememberQuote(makeQuote({ id: QUOTE_2, quoteNumber: "Q-2026-0008" }));
    const left = await draftWithDueDate(harness, QUOTE);
    const right = await draftWithDueDate(harness, QUOTE_2);
    harness.staleNumberLists.remaining = 2;
    const [leftIssued, rightIssued] = await Promise.all([
      issueClientInvoiceForMaster({
        masterUserId: USER_A,
        invoiceId: left.id,
        deps: harness.deps,
      }),
      issueClientInvoiceForMaster({
        masterUserId: USER_A,
        invoiceId: right.id,
        deps: harness.deps,
      }),
    ]);
    assert.notEqual(leftIssued.invoiceNumber, rightIssued.invoiceNumber);
    assert.match(leftIssued.invoiceNumber ?? "", /^I-2026-\d{4}$/);
    assert.match(rightIssued.invoiceNumber ?? "", /^I-2026-\d{4}$/);
    harness.assertQuotesUnchanged();
  });

  it("stops after the bounded number retries", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const draft = await draftWithDueDate(harness);
    let conflicts = 0;
    const deps: ClientInvoiceDeps = {
      ...harness.deps,
      async issueInvoice() {
        conflicts += 1;
        return { ok: false, reason: "conflict" };
      },
    };
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: draft.id,
          deps,
        }),
      "INVOICE_NUMBER_EXHAUSTED",
    );
    assert.equal(conflicts, CLIENT_INVOICE_NUMBER_ATTEMPTS);
    assert.equal(harness.invoices.get(draft.id)?.status, "draft");
    assert.equal(harness.invoices.get(draft.id)?.invoiceNumber, null);
    harness.assertQuotesUnchanged();
  });

  it("is idempotent for an issued invoice and rejects later edits", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const draft = await draftWithDueDate(harness);
    harness.setNow("2026-10-10T12:00:00.000Z");
    const issued = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: draft.id,
      deps: harness.deps,
    });
    harness.setNow("2027-01-01T00:00:00.000Z");
    const again = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: draft.id,
      deps: harness.deps,
    });
    assert.equal(harness.issueWrites.count, 1);
    assert.equal(again.invoiceNumber, issued.invoiceNumber);
    assert.equal(again.issuedAt, issued.issuedAt);
    assert.equal(again.issueDate, "2026-10-10");
    assert.equal(again.updatedAt, issued.updatedAt);
    await expectCode(
      () =>
        updateClientInvoiceDraftForMaster({
          masterUserId: USER_A,
          invoiceId: draft.id,
          draft: {
            ...issued.draft,
            projectTitle: "Changed after issue",
            paymentDueDate: "2027-02-01",
          },
          deps: harness.deps,
        }),
      "ISSUED_INVOICE_IMMUTABLE",
    );
    assert.equal(harness.invoices.get(draft.id)?.draft.projectTitle, "Portal rebuild");
    assert.equal(
      harness.invoices.get(draft.id)?.issuedSnapshot?.projectTitle,
      "Portal rebuild",
    );
    harness.assertQuotesUnchanged();
  });

  it("refuses to issue when the source quotation snapshot cannot be read", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const ready = await draftWithDueDate(harness);
    harness.quotes.delete(QUOTE);
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: ready.id,
          deps: harness.deps,
        }),
      "PERSISTENCE_FAILED",
      /could not be invoiced/,
    );
    assert.equal(harness.invoices.get(ready.id)?.status, "draft");
    assert.equal(harness.invoices.get(ready.id)?.issuedSnapshot, null);
  });
});

describe("client invoice soft mask", () => {
  it("hides the invoice, keeps its number, and frees the quotation", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    const draft = await draftWithDueDate(harness);
    const issued = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: draft.id,
      deps: harness.deps,
    });
    assert.equal(issued.invoiceNumber, "I-2026-0001");
    const masked = await maskClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: issued.id,
      deps: harness.deps,
    });
    assert.equal(masked.alreadyMasked, false);
    const repeated = await maskClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: issued.id,
      deps: harness.deps,
    });
    assert.equal(repeated.alreadyMasked, true);
    await expectCode(
      () =>
        getClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.deepEqual(await listClientInvoicesForMaster(USER_A, harness.deps), []);
    await expectCode(
      () =>
        issueClientInvoiceForMaster({
          masterUserId: USER_A,
          invoiceId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    const stored = harness.invoices.get(issued.id);
    assert.ok(stored?.deletedAt);
    assert.equal(stored?.invoiceNumber, "I-2026-0001");
    assert.equal(stored?.status, "issued");

    const replacement = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE,
      deps: harness.deps,
    });
    assert.equal(replacement.created, true);
    assert.notEqual(replacement.invoice.id, issued.id);
    const ready = await updateClientInvoiceDraftForMaster({
      masterUserId: USER_A,
      invoiceId: replacement.invoice.id,
      draft: {
        ...replacement.invoice.draft,
        paymentDueDate: "2026-10-31",
      },
      deps: harness.deps,
    });
    const next = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: ready.id,
      deps: harness.deps,
    });
    assert.equal(next.invoiceNumber, "I-2026-0002");
    const numbers = await harness.deps.listInvoiceNumbers(LICENSEE_A);
    assert.ok(numbers.includes("I-2026-0001"));
    assert.ok(numbers.includes("I-2026-0002"));
    harness.assertQuotesUnchanged();
  });
});

describe("client invoice public DTO and row mapping", () => {
  it("omits licensee, requester, and mask fields", async () => {
    const harness = createHarness();
    const quote = makeQuote();
    const snapshot = quote.issued_snapshot_json;
    if (!snapshot) throw new Error("expected snapshot");
    snapshot.brand = {
      ...snapshot.brand,
      logo: {
        storagePath: `quotes/${QUOTE}/logo/PRIVATE_LOGO_PATH.png`,
        mimeType: "image/png",
        contentHash: "AB".repeat(32),
      },
    };
    harness.rememberQuote(quote);
    const draft = await draftWithDueDate(harness);
    const issued = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: draft.id,
      deps: harness.deps,
    });
    const pub = toPublicClientInvoice(issued);
    const names = keysOf(pub);
    assert.equal(names.includes("licenseeAccountId"), false);
    assert.equal(names.includes("licensee_account_id"), false);
    assert.equal(names.includes("requestedBy"), false);
    assert.equal(names.includes("requested_by"), false);
    assert.equal(names.includes("deletedAt"), false);
    assert.equal(names.includes("deleted_at"), false);
    const encoded = JSON.stringify(pub);
    assert.equal(encoded.includes(LICENSEE_A), false);
    assert.equal(encoded.includes(USER_A), false);
    assert.equal(encoded.includes(QUOTE_REQUESTER), false);
    assert.equal(encoded.includes("SECRET_CONTEXT"), false);
    assert.equal(pub.issuedSnapshot?.brand.primaryColor, "#A1B2C3");
    assert.equal(encoded.includes("storagePath"), false);
    assert.equal(encoded.includes("PRIVATE_LOGO_PATH"), false);
    assert.equal(pub.issuedSnapshot?.brand.logo?.mimeType, "image/png");
    assert.equal(pub.issuedSnapshot?.brand.logo?.contentHash, "ab".repeat(32));
    assert.equal(pub.organizationId, ORG);
    assert.equal(pub.sourceQuoteId, QUOTE);
    assert.equal(pub.issuedSnapshot?.invoiceNumber, issued.invoiceNumber);
    assert.equal("licenseeAccountId" in (pub.issuedSnapshot ?? {}), false);
    harness.assertQuotesUnchanged();
  });

  it("maps draft and issued rows without an issue_date column", () => {
    const quote = makeQuote();
    const snapshot = quote.issued_snapshot_json;
    if (!snapshot) throw new Error("expected snapshot");
    const draft = createClientInvoiceFromIssuedQuote(snapshot, {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: T0,
    });
    const insert = toClientInvoiceInsertRow(draft, USER_A);
    assert.equal(Object.hasOwn(insert, "issue_date"), false);
    assert.equal(insert.issued_snapshot_json, null);
    assert.equal(insert.invoice_number, null);
    assert.equal(insert.source_quote_id, QUOTE);
    assert.equal(Object.hasOwn(insert, "deleted_at"), false);
    const mapped = mapClientInvoiceRow(insert);
    assert.equal(mapped.requestedBy, USER_A);
    assert.equal(mapped.deletedAt, null);
    assert.equal(mapped.issueDate, null);
    assert.equal(mapped.draft.totals.totalMinor, 250);
    assert.deepEqual(mapped.draft.sourceQuote, draft.draft.sourceQuote);

    const edited = updateClientInvoiceDraft(draft, {
      ...draft.draft,
      paymentDueDate: "2026-10-31",
      paymentInstructions: "Wire to Alpha IBAN.",
    }, { updatedAt: "2026-10-10T10:00:00.000Z" });
    const issued = issueClientInvoice(edited, {
      invoiceNumber: "I-2026-0001",
      issuedAt: "2026-10-10T23:30:00.000Z",
      updatedAt: "2026-10-10T23:30:00.000Z",
    });
    const issuedRow = {
      ...insert,
      ...toClientInvoiceIssueUpdate(issued),
    };
    assert.equal(Object.hasOwn(issuedRow, "issue_date"), false);
    assert.equal(Object.hasOwn(issuedRow, "currency_code"), true);
    const issueUpdate = toClientInvoiceIssueUpdate(issued);
    assert.equal(Object.hasOwn(issueUpdate, "currency_code"), false);
    assert.equal(Object.hasOwn(issueUpdate, "licensee_account_id"), false);
    assert.equal(Object.hasOwn(issueUpdate, "source_quote_id"), false);
    const draftUpdate = toClientInvoiceDraftUpdate(draft);
    assert.equal(Object.hasOwn(draftUpdate, "currency_code"), false);
    assert.equal(Object.hasOwn(draftUpdate, "content_language"), false);
    assert.equal(Object.hasOwn(draftUpdate, "licensee_account_id"), false);
    const issuedMapped = mapClientInvoiceRow(issuedRow);
    assert.equal(issuedMapped.status, "issued");
    assert.equal(issuedMapped.invoiceNumber, "I-2026-0001");
    assert.equal(issuedMapped.issueDate, "2026-10-10");
    assert.equal(issuedMapped.issuedSnapshot?.issueDate, "2026-10-10");
    assert.equal(issuedMapped.currencyCode, "EUR");
    assert.equal(issuedMapped.draft.sourceQuote.quoteNumber, "Q-2026-0007");

    const hidden = mapClientInvoiceRow({
      ...insert,
      deleted_at: "1999-01-01T00:00:00.000Z",
    });
    assert.equal(hidden.deletedAt, "1999-01-01T00:00:00.000Z");
    const pub = toPublicClientInvoice(hidden);
    assert.equal(JSON.stringify(pub).includes("1999-01-01"), false);
    assert.equal(JSON.stringify(pub).includes(LICENSEE_A), false);
    const decision = maskStoredClientInvoice(hidden, "2026-10-10T12:00:00.000Z");
    assert.equal(decision.alreadyMasked, true);
    assert.equal(decision.invoice.deletedAt, hidden.deletedAt);

    assert.throws(
      () => mapClientInvoiceRow({ ...insert, status: "issued" }),
      (error: unknown) =>
        error instanceof ClientInvoiceOperationError && error.code === "PERSISTENCE_FAILED",
    );
  });

  it("drops authority fields from the update body", () => {
    const parsed = parseUpdateClientInvoiceBody({
      draft: { projectTitle: "Portal" },
      licenseeAccountId: LICENSEE_B,
      organizationId: ORG_FOREIGN,
      invoiceNumber: "I-2026-0099",
      totals: { totalMinor: 1 },
      issuedSnapshot: { invoiceNumber: "I-2026-0001" },
      contentLanguage: "it",
    });
    assert.equal(isClientInvoiceHttpFailure(parsed), false);
    if (!isClientInvoiceHttpFailure(parsed)) {
      assert.equal(parsed.contentLanguage, "it");
      assert.equal("licenseeAccountId" in parsed, false);
      assert.equal("organizationId" in parsed, false);
      assert.equal("invoiceNumber" in parsed, false);
      assert.equal("totals" in parsed, false);
      assert.equal("currencyCode" in parsed, false);
    }
    const currency = parseUpdateClientInvoiceBody({
      draft: { projectTitle: "Portal" },
      currency_code: "usd",
    });
    if (!isClientInvoiceHttpFailure(currency)) {
      assert.equal(currency.currencyCode, "usd");
    }
    const missing = parseUpdateClientInvoiceBody({
      licenseeAccountId: LICENSEE_B,
      invoiceNumber: "I-2026-0001",
    });
    assert.equal(isClientInvoiceHttpFailure(missing), true);
  });
});

describe("active invoice relationships for the quotation library", () => {
  it("lists one Licensee-scoped link and ignores drafts as finalized, masks, and other Licensees", async () => {
    const harness = createHarness();
    harness.rememberQuote(makeQuote());
    harness.rememberQuote(makeQuote({ id: QUOTE_2, quoteNumber: "Q-2026-0008" }));
    const finalizedDraft = await draftWithDueDate(harness, QUOTE);
    const finalized = await issueClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: finalizedDraft.id,
      deps: harness.deps,
    });
    const draftInvoice = await createClientInvoiceFromQuoteForMaster({
      masterUserId: USER_A,
      quoteId: QUOTE_2,
      deps: harness.deps,
    });

    const links = await listActiveInvoiceQuoteLinksForMaster(USER_A, harness.deps);
    assert.deepEqual(
      links.map((link) => link.sourceQuoteId).sort(),
      [QUOTE, QUOTE_2].sort(),
    );
    const finalizedLink = links.find((link) => link.sourceQuoteId === QUOTE);
    const draftLink = links.find((link) => link.sourceQuoteId === QUOTE_2);
    assert.deepEqual(finalizedLink, {
      sourceQuoteId: QUOTE,
      invoiceId: finalized.id,
      status: "issued",
    });
    assert.deepEqual(draftLink, {
      sourceQuoteId: QUOTE_2,
      invoiceId: draftInvoice.invoice.id,
      status: "draft",
    });
    assert.deepEqual(Object.keys(finalizedLink ?? {}).sort(), [
      "invoiceId",
      "sourceQuoteId",
      "status",
    ]);
    assert.equal(harness.quotes.get(QUOTE)?.status, "issued");
    assert.equal(harness.quotes.get(QUOTE_2)?.status, "issued");

    await maskClientInvoiceForMaster({
      masterUserId: USER_A,
      invoiceId: finalized.id,
      deps: harness.deps,
    });
    const afterMask = await listActiveInvoiceQuoteLinksForMaster(USER_A, harness.deps);
    assert.equal(
      afterMask.some((link) => link.invoiceId === finalized.id),
      false,
    );
    assert.deepEqual(afterMask, [
      {
        sourceQuoteId: QUOTE_2,
        invoiceId: draftInvoice.invoice.id,
        status: "draft",
      },
    ]);

    const foreignId = "99999999-9999-4999-8999-999999999999";
    const foreign = structuredClone(harness.invoices.get(draftInvoice.invoice.id));
    assert.ok(foreign);
    foreign.id = foreignId;
    foreign.licenseeAccountId = LICENSEE_B;
    harness.invoices.set(foreignId, foreign);
    const leaking: ClientInvoiceDeps = {
      ...harness.deps,
      async listInvoices() {
        return [...harness.invoices.values()].map((invoice) => structuredClone(invoice));
      },
    };
    const owned = await listActiveInvoiceQuoteLinksForMaster(USER_A, leaking);
    const other = await listActiveInvoiceQuoteLinksForMaster(USER_B, leaking);
    assert.equal(
      owned.some((link) => link.invoiceId === foreignId),
      false,
    );
    assert.equal(
      owned.some((link) => link.invoiceId === finalized.id),
      false,
    );
    assert.deepEqual(
      other.map((link) => link.invoiceId),
      [foreignId],
    );
    assert.equal(
      other.some((link) => link.invoiceId === draftInvoice.invoice.id),
      false,
    );
    harness.assertQuotesUnchanged();
  });
});

describe("client invoice API and persistence source contracts", () => {
  it("keeps routes Master-only and keeps PDF rendering out of the service", () => {
    const files = [
      "services/clientInvoice/clientInvoiceService.ts",
      "services/clientInvoice/clientInvoicePersistence.ts",
      "services/clientInvoice/clientInvoiceHttp.ts",
      "app/api/licensee/client-quotes/[id]/invoices/route.ts",
      "app/api/licensee/invoices/route.ts",
      "app/api/licensee/invoices/[id]/route.ts",
      "app/api/licensee/invoices/[id]/issue/route.ts",
    ];
    const source = files.map((file) => read(file)).join("\n");
    assert.doesNotMatch(source, /pdfkit|renderClientQuotePdf|renderClientInvoicePdf/i);
    assert.doesNotMatch(
      source,
      /resolveAuthorizedSubAccountHandoff|assertLicenseeOwnsSubAccount|provisionalClientAccountEmail/,
    );
    assert.doesNotMatch(source, /issueClientQuote|updateDraftClientQuote|maskAthenaClientQuote/);

    const service = read("services/clientInvoice/clientInvoiceService.ts");
    assert.match(service, /requireMaster\(/);
    assert.match(service, /master\.licenseeAccountId/);
    assert.match(service, /activeInvoices: \[\]/);
    assert.match(service, /listInvoiceNumbers/);
    assert.match(service, /formatClientInvoiceNumber/);
    assert.match(service, /CLIENT_INVOICE_NUMBER_ATTEMPTS/);
    assert.match(service, /CLIENT_INVOICE_CREATE_ATTEMPTS/);
    assert.doesNotMatch(service, /formatClientQuoteNumber|nextClientQuoteSequence|listQuoteNumbers/);
    assert.doesNotMatch(service, /supabase|athena_client_invoices/);

    const persistence = read("services/clientInvoice/clientInvoicePersistence.ts");
    assert.match(persistence, /requireLicenseeMasterAccount/);
    assert.match(persistence, /23505/);
    assert.match(persistence, /source_occupied/);
    const quoteRead = persistence.slice(
      persistence.indexOf("async function loadOwnedQuote"),
      persistence.indexOf("async function loadOwnedInvoice"),
    );
    assert.match(quoteRead, /from\("athena_client_quotes"\)/);
    assert.match(quoteRead, /\.select\("\*"\)/);
    assert.match(quoteRead, /\.eq\("licensee_account_id", licenseeAccountId\)/);
    assert.doesNotMatch(quoteRead, /\.(update|insert|delete)\(/);
    const numbers = persistence.slice(
      persistence.indexOf("async listInvoiceNumbers"),
      persistence.indexOf("now()"),
    );
    assert.match(numbers, /invoice_number/);
    assert.doesNotMatch(numbers, /deleted_at/);
    const list = persistence.slice(
      persistence.indexOf("async listInvoices"),
      persistence.indexOf("async findActiveInvoiceBySourceQuote"),
    );
    assert.match(list, /\.is\("deleted_at", null\)/);
    assert.match(persistence, /\.eq\("status", "draft"\)/);
    assert.doesNotMatch(persistence, /from\("athena_client_quotes"\)[\s\S]{0,180}\.(update|insert|delete)\(/);

    const invoiceRoot = join(ROOT, "app/api/licensee/invoices");
    assert.deepEqual(readdirSync(invoiceRoot).sort(), ["[id]", "route.ts"]);
    assert.deepEqual(readdirSync(join(invoiceRoot, "[id]")).sort(), ["issue", "pdf", "route.ts"]);
    assert.deepEqual(readdirSync(join(invoiceRoot, "[id]", "issue")), ["route.ts"]);
    assert.deepEqual(readdirSync(join(invoiceRoot, "[id]", "pdf")), ["route.ts"]);
    assert.equal(readdirSync(invoiceRoot).includes("payments"), false);
    assert.deepEqual(
      readdirSync(join(ROOT, "app/api/licensee/client-quotes/[id]/invoices")),
      ["route.ts"],
    );

    for (const file of files.filter((item) => item.startsWith("app/"))) {
      const route = read(file);
      assert.match(route, /createSupabaseServerClient/);
      assert.match(route, /auth\.getUser/);
      assert.match(route, /UNAUTHORIZED/);
      assert.match(route, /toPublicClientInvoice/);
      assert.match(route, /clientInvoiceFailure/);
      assert.doesNotMatch(route, /licenseeAccountId|licensee_account_id/);
      assert.doesNotMatch(route, /body\.organizationId|invoiceNumber|issuedSnapshot/);
    }
    const createRoute = read("app/api/licensee/client-quotes/[id]/invoices/route.ts");
    assert.doesNotMatch(createRoute, /request\.text|request\.json/);
    const issueRoute = read("app/api/licensee/invoices/[id]/issue/route.ts");
    assert.doesNotMatch(issueRoute, /request\.text|request\.json/);
  });
});
