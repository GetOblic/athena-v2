/**
 * CQ-STRIPE-1 Gate 2A — domain and persistence.
 * Does not apply the migration and does not call Stripe.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { commitClientQuotePaymentRequestIntents } from "../../services/clientQuotePayment/clientQuotePaymentCommit";
import {
  canonicalJson,
  clientQuotePaymentExpiresAt,
  clientQuotePaymentStripeIdempotencyKey,
  configureOneTimeCollection,
  extractChargeableFrequencyGroups,
  planClientQuotePaymentRequestIntents,
  toClientQuotePaymentQuote,
} from "../../services/clientQuotePayment/clientQuotePaymentDomain";
import { applyClientQuotePaymentStripeFulfillment } from "../../services/clientQuotePayment/clientQuotePaymentFulfillment";
import { mapClientQuotePaymentRpcError } from "../../services/clientQuotePayment/clientQuotePaymentRpc";
import { mapClientQuotePaymentRequestRow } from "../../services/clientQuotePayment/clientQuotePaymentRow";
import {
  createClientQuotePaymentRequestIntents,
  getClientQuotePaymentRequest,
  listClientQuotePaymentRequests,
  recordClientQuotePaymentStripeFulfillment,
} from "../../services/clientQuotePayment/clientQuotePaymentService";
import type { ClientQuotePaymentRequestStore } from "../../services/clientQuotePayment/clientQuotePaymentStore";
import {
  CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR,
  CLIENT_QUOTE_PAYMENT_SQL_ERRORS,
  CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC,
  RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC,
  ClientQuotePaymentRequestError,
  clientQuotePaymentError,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentErrorCode,
  type ClientQuotePaymentRequest,
} from "../../services/clientQuotePayment/clientQuotePaymentTypes";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import type {
  AthenaClientQuote,
  ClientQuoteBillingFrequency,
  ClientQuoteTotals,
} from "../../services/clientQuote/clientQuoteTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261012000001_create_athena_client_quote_payment_requests.sql";
const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_LICENSEE = "abababab-abab-4aba-8aba-abababababab";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const QUOTE_2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ISSUED_AT = "2026-01-15T08:30:00.000Z";
const NOW = "2026-10-12T00:00:00.000Z";

type LineInput = {
  id: string;
  unitPriceMinor: number;
  billingFrequency?: ClientQuoteBillingFrequency | null;
};

function totals(totalMinor: number): ClientQuoteTotals {
  return {
    subtotalMinor: totalMinor,
    discountMinor: 0,
    taxableMinor: totalMinor,
    taxMinor: 0,
    totalMinor,
  };
}

function expectCode(error: unknown, code: ClientQuotePaymentErrorCode): void {
  assert.ok(error instanceof ClientQuotePaymentRequestError);
  assert.equal(error.code, code);
}

function issuedQuote(options: {
  id?: string;
  currencyCode?: string;
  lines?: LineInput[];
  discount?: Record<string, unknown>;
  tax?: Record<string, unknown>;
  validity?: Record<string, unknown>;
  quoteNumber?: string;
} = {}): AthenaClientQuote {
  const lines = options.lines ?? [
    { id: "line-1", unitPriceMinor: 10_000, billingFrequency: "one_time" as const },
  ];
  const draft = createDraftClientQuote({
    id: options.id ?? QUOTE,
    licenseeAccountId: LICENSEE,
    organizationId: ORG,
    requestedBy: USER,
    contentLanguage: "en",
    currencyCode: options.currencyCode ?? "USD",
    draft: {
      schemaVersion: "client_quote_draft_v1",
      issuer: {
        legalName: "Alpha Studio Ltd",
        tradingName: null,
        postalAddress: {
          line1: "1 Harbour Road",
          line2: null,
          city: "Valletta",
          region: null,
          postalCode: null,
          country: "Malta",
        },
        phone: null,
        email: null,
        website: null,
        registrationNumber: null,
        taxIdentifier: null,
        taxIdentifierLabel: null,
        contactName: null,
        jobTitle: null,
        additionalNote: null,
      },
      customer: {
        name: "Northwind",
        contactName: null,
        jobTitle: null,
        postalAddress: {
          line1: null,
          line2: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
        },
        phone: null,
        email: null,
        taxIdentifier: null,
      },
      projectTitle: "Portal rebuild",
      scopeSummary: "Rebuild the client portal.",
      lineItems: lines.map((line) => ({
        id: line.id,
        description: "Portal work",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: 0,
        ...(line.billingFrequency === undefined
          ? {}
          : { billingFrequency: line.billingFrequency }),
      })),
      paymentTerms: { summary: "Due on acceptance.", scheduleNote: null },
      validity: options.validity ?? {
        validForDays: null,
        validUntil: "2027-12-31",
        note: null,
      },
      appendix: { enabled: false, sections: [] },
      discount: options.discount ?? { kind: "none" },
      tax: options.tax ?? { kind: "none" },
      totals: totals(1),
    },
    sourceEstimateId: null,
    sourceEstimateSnapshot: null,
    revisedFromQuoteId: null,
    createdAt: "2026-01-15T08:00:00.000Z",
  });
  return issueClientQuote(draft, {
    quoteNumber: options.quoteNumber ?? "Q-2026-0007",
    issuedAt: ISSUED_AT,
    updatedAt: ISSUED_AT,
  });
}

function snapshotOf(quote: AthenaClientQuote): Record<string, unknown> {
  const snapshot = quote.issued_snapshot_json;
  if (!snapshot) throw new Error("expected an issued snapshot");
  return snapshot as unknown as Record<string, unknown>;
}

function viewOf(quote: AthenaClientQuote) {
  return toClientQuotePaymentQuote(quote);
}

function createMemoryStore(seed: AthenaClientQuote[]) {
  const quotes = new Map<string, AthenaClientQuote>();
  for (const quote of seed) quotes.set(quote.id, structuredClone(quote));
  const requests: ClientQuotePaymentRequest[] = [];
  const tails = new Map<string, Promise<void>>();

  async function exclusive<T>(quoteId: string, run: () => T | Promise<T>): Promise<T> {
    const previous = tails.get(quoteId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    tails.set(
      quoteId,
      previous.then(() => gate),
    );
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }

  const store: ClientQuotePaymentRequestStore = {
    async getOwnedQuote(id, licenseeAccountId) {
      const quote = quotes.get(id);
      if (!quote || quote.licensee_account_id !== licenseeAccountId) return null;
      return structuredClone(quote);
    },
    async commitPaymentRequestIntents(input) {
      return exclusive(input.sourceQuoteId, async () => {
        await Promise.resolve();
        const quote = quotes.get(input.sourceQuoteId) ?? null;
        const owned =
          quote && quote.licensee_account_id === input.licenseeAccountId ? quote : null;
        const inserted = commitClientQuotePaymentRequestIntents(
          {
            quote: owned,
            requests: requests.filter(
              (row) =>
                row.sourceQuoteId === input.sourceQuoteId &&
                row.licenseeAccountId === input.licenseeAccountId,
            ),
          },
          input,
        );
        requests.push(...inserted);
        return inserted.map((row) => structuredClone(row));
      });
    },
    async listPaymentRequests(sourceQuoteId, licenseeAccountId) {
      return requests
        .filter(
          (row) =>
            row.sourceQuoteId === sourceQuoteId &&
            row.licenseeAccountId === licenseeAccountId,
        )
        .map((row) => structuredClone(row));
    },
    async getPaymentRequest(id, licenseeAccountId) {
      const row = requests.find(
        (entry) => entry.id === id && entry.licenseeAccountId === licenseeAccountId,
      );
      return row ? structuredClone(row) : null;
    },
    async recordStripeFulfillment(input) {
      const located = requests.find(
        (entry) => entry.id === input.requestId && entry.licenseeAccountId === input.licenseeAccountId,
      );
      if (!located) {
        throw clientQuotePaymentError(
          "NOT_FOUND",
          "Payment request was not found for this Licensee.",
        );
      }
      return exclusive(located.sourceQuoteId, async () => {
        const current = requests.find(
          (entry) =>
            entry.id === input.requestId && entry.licenseeAccountId === input.licenseeAccountId,
        );
        if (!current) {
          throw clientQuotePaymentError(
            "NOT_FOUND",
            "Payment request was not found for this Licensee.",
          );
        }
        const next = applyClientQuotePaymentStripeFulfillment(current, input);
        const index = requests.findIndex((entry) => entry.id === current.id);
        requests[index] = next;
        return structuredClone(next);
      });
    },
  };

  return { store, quotes, requests };
}

async function createIntent(
  store: ClientQuotePaymentRequestStore,
  decision: ClientQuotePaymentDecision,
  options: { quoteId?: string; now?: string; licenseeAccountId?: string } = {},
) {
  return createClientQuotePaymentRequestIntents(store, {
    licenseeAccountId: options.licenseeAccountId ?? LICENSEE,
    sourceQuoteId: options.quoteId ?? QUOTE,
    requestedBy: USER,
    now: options.now ?? NOW,
    decision,
  });
}

describe("client quote payment domain", () => {
  it("charges the frozen frequency total and does not reapply discount or tax", () => {
    const quote = issuedQuote({
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "percentage", ratePpm: 100_000, label: "VAT" },
    });
    const snapshot = snapshotOf(quote);
    const frozen = (
      snapshot.frequencyTotals as Array<{ totals: ClientQuoteTotals }>
    )[0]?.totals.totalMinor;
    assert.equal(frozen, 9900);
    const groups = extractChargeableFrequencyGroups(snapshot);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.amountMinor, 9900);
    assert.equal(groups[0]?.amountSource, "frequency_totals");

    snapshot.discount = { kind: "none" };
    snapshot.tax = { kind: "none" };
    (snapshot.lineItems as Array<{ unitPriceMinor: number }>)[0].unitPriceMinor = 1;
    assert.equal(extractChargeableFrequencyGroups(snapshot)[0]?.amountMinor, 9900);
  });

  it("keeps mixed frequencies separate and drops zero, duplicate, and unknown groups", () => {
    const quote = issuedQuote({
      lines: [
        { id: "setup", unitPriceMinor: 10_000, billingFrequency: "one_time" },
        { id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" },
        { id: "retainer", unitPriceMinor: 4_000, billingFrequency: "quarterly" },
      ],
    });
    const snapshot = snapshotOf(quote);
    const groups = extractChargeableFrequencyGroups(snapshot);
    assert.deepEqual(
      groups.map((group) => [group.billingFrequency, group.amountMinor]),
      [
        ["one_time", 10_000],
        ["monthly", 2_500],
        ["quarterly", 4_000],
      ],
    );
    assert.equal(
      groups.some((group) => group.amountMinor === 16_500),
      false,
    );

    snapshot.frequencyTotals = [
      { billingFrequency: "one_time", totals: totals(0) },
      { billingFrequency: "monthly", totals: totals(100) },
      { billingFrequency: "monthly", totals: totals(200) },
      { billingFrequency: "weekly", totals: totals(999) },
      { billingFrequency: "annually", totals: totals(800) },
    ];
    assert.deepEqual(
      extractChargeableFrequencyGroups(snapshot).map((group) => [
        group.billingFrequency,
        group.amountMinor,
      ]),
      [["annually", 800]],
    );
  });

  it("uses a legacy one-time total only when frequencyTotals is omitted", () => {
    const quote = issuedQuote();
    const snapshot = snapshotOf(quote);
    delete snapshot.frequencyTotals;
    for (const line of snapshot.lineItems as Array<Record<string, unknown>>) {
      delete line.billingFrequency;
    }
    (snapshot.totals as ClientQuoteTotals).totalMinor = 4242;
    (snapshot.lineItems as Array<{ unitPriceMinor: number }>)[0].unitPriceMinor = 1;
    snapshot.discount = { kind: "percentage", ratePpm: 500_000 };
    const legacy = extractChargeableFrequencyGroups(snapshot);
    assert.deepEqual(legacy, [
      {
        billingFrequency: "one_time",
        amountMinor: 4242,
        amountSource: "legacy_one_time_totals",
      },
    ]);

    const mixed = snapshotOf(issuedQuote({
      lines: [
        { id: "setup", unitPriceMinor: 10_000, billingFrequency: "one_time" },
        { id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" },
      ],
    }));
    const compatibility = (mixed.totals as ClientQuoteTotals).totalMinor;
    assert.equal(compatibility, 10_000);
    delete mixed.frequencyTotals;
    assert.deepEqual(extractChargeableFrequencyGroups(mixed), []);

    const empty = snapshotOf(issuedQuote());
    empty.frequencyTotals = [];
    assert.deepEqual(extractChargeableFrequencyGroups(empty), []);
  });

  it("configures a full charge or a deposit/balance pair from the frozen total", () => {
    const full = configureOneTimeCollection(50, { mode: "full" });
    assert.deepEqual(full, { mode: "full", oneTimeTotalMinor: 50, amountMinor: 50 });
    assert.throws(
      () => configureOneTimeCollection(49, { mode: "full" }),
      (error: unknown) => {
        expectCode(error, "AMOUNT_REJECTED");
        return true;
      },
    );
    assert.throws(
      () => configureOneTimeCollection(0, { mode: "full" }),
      (error: unknown) => {
        expectCode(error, "FREQUENCY_NOT_CHARGEABLE");
        return true;
      },
    );

    const split = configureOneTimeCollection(10_000, { mode: "split", depositMinor: 4_000 });
    assert.deepEqual(split, {
      mode: "split",
      oneTimeTotalMinor: 10_000,
      depositMinor: 4_000,
      balanceMinor: 6_000,
    });
    assert.equal(Object.isFrozen(split), true);
    assert.equal(split.oneTimeTotalMinor - split.depositMinor, split.balanceMinor);
    assert.equal("amountPaidMinor" in split, false);

    assert.throws(
      () =>
        configureOneTimeCollection(10_000, {
          mode: "split",
          depositMinor: CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR - 1,
        }),
      (error: unknown) => {
        expectCode(error, "DEPOSIT_BELOW_MINIMUM");
        return true;
      },
    );
    assert.throws(
      () => configureOneTimeCollection(99, { mode: "split", depositMinor: 50 }),
      (error: unknown) => {
        expectCode(error, "BALANCE_BELOW_MINIMUM");
        assert.match(error instanceof Error ? error.message : "", /not an amount already paid|frozen deposit/);
        return true;
      },
    );
    assert.throws(
      () => configureOneTimeCollection(100, { mode: "split", depositMinor: 100 }),
      (error: unknown) => {
        expectCode(error, "BALANCE_BELOW_MINIMUM");
        return true;
      },
    );
    const edges = configureOneTimeCollection(100, { mode: "split", depositMinor: 50 });
    assert.equal(edges.mode === "split" && edges.balanceMinor, 50);
  });

  it("rejects unsupported currency, a bad scale, expiry, and an unissued or masked quote", () => {
    const usd = viewOf(issuedQuote());
    const eur = viewOf(issuedQuote({ id: QUOTE_2, currencyCode: "EUR", quoteNumber: "Q-2026-0008" }));
    assert.equal(
      planClientQuotePaymentRequestIntents(usd, {
        now: NOW,
        decision: { kind: "one_time_full" },
      })[0]?.requestParameters.currencyCode,
      "USD",
    );
    assert.equal(
      planClientQuotePaymentRequestIntents(eur, {
        now: NOW,
        decision: { kind: "one_time_full" },
      })[0]?.requestParameters.currencyCode,
      "EUR",
    );

    assert.throws(
      () => planClientQuotePaymentRequestIntents(viewOf(issuedQuote({ currencyCode: "GBP" })), {
        now: NOW,
        decision: { kind: "one_time_full" },
      }),
      (error: unknown) => {
        expectCode(error, "CURRENCY_NOT_SUPPORTED");
        return true;
      },
    );
    assert.throws(
      () => planClientQuotePaymentRequestIntents(viewOf(issuedQuote({ currencyCode: "JPY" })), {
        now: NOW,
        decision: { kind: "one_time_full" },
      }),
      (error: unknown) => {
        expectCode(error, "CURRENCY_NOT_SUPPORTED");
        return true;
      },
    );

    const scaled = viewOf(issuedQuote());
    (scaled.issuedSnapshot as { currencyScale: number }).currencyScale = 0;
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(scaled, {
          now: NOW,
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "CURRENCY_NOT_SUPPORTED");
        return true;
      },
    );

    const mismatched = viewOf(issuedQuote());
    mismatched.currencyCode = "EUR";
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(mismatched, {
          now: NOW,
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "SNAPSHOT_UNUSABLE");
        return true;
      },
    );

    const durationOnly = viewOf(issuedQuote({
      validity: { validForDays: 30, validUntil: null, note: null },
    }));
    assert.equal(clientQuotePaymentExpiresAt(durationOnly), "2026-02-15T00:00:00.000Z");
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(durationOnly, {
          now: "2026-02-15T00:00:00.000Z",
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "QUOTE_EXPIRED");
        return true;
      },
    );
    const stillValid = planClientQuotePaymentRequestIntents(durationOnly, {
      now: "2026-02-14T23:59:59.999Z",
      decision: { kind: "one_time_full" },
    });
    assert.equal(stillValid.length, 1);

    const dated = viewOf(issuedQuote({
      validity: { validForDays: 30, validUntil: "2026-01-20", note: null },
    }));
    assert.equal(clientQuotePaymentExpiresAt(dated), "2026-01-21T00:00:00.000Z");

    const draft = issuedQuote();
    draft.status = "draft";
    draft.issued_snapshot_json = null;
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(viewOf(draft), {
          now: NOW,
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "QUOTE_NOT_ISSUED");
        return true;
      },
    );
    const masked = viewOf(issuedQuote());
    masked.deletedAt = NOW;
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(masked, {
          now: NOW,
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "QUOTE_MASKED");
        return true;
      },
    );
  });

  it("builds separate deterministic price and payment-link keys from immutable parameters", () => {
    const quote = viewOf(issuedQuote());
    const full = planClientQuotePaymentRequestIntents(quote, {
      now: NOW,
      decision: { kind: "one_time_full" },
    });
    const again = planClientQuotePaymentRequestIntents(quote, {
      now: NOW,
      decision: { kind: "one_time_full" },
    });
    assert.deepEqual(full, again);
    assert.match(full[0].stripePriceIdempotencyKey, /^cqpr_price_v1_[0-9a-f]{64}$/);
    assert.match(full[0].stripePaymentLinkIdempotencyKey, /^cqpr_link_v1_[0-9a-f]{64}$/);
    assert.notEqual(full[0].stripePriceIdempotencyKey, full[0].stripePaymentLinkIdempotencyKey);
    assert.equal(full[0].requestParameters.settlementAccount, "getoblic_central");
    assert.equal("amountPaidMinor" in full[0].requestParameters, false);
    assert.equal("status" in full[0].requestParameters, false);
    assert.equal(canonicalJson(full[0].requestParameters).includes("draft_json"), false);

    const split = planClientQuotePaymentRequestIntents(quote, {
      now: NOW,
      decision: { kind: "one_time_split", depositMinor: 2_500 },
    });
    assert.equal(split.length, 2);
    assert.equal(split[0]?.requestParameters.purpose, "one_time_deposit");
    assert.equal(split[0]?.requestParameters.amountMinor, 2_500);
    assert.equal(split[1]?.requestParameters.purpose, "one_time_balance");
    assert.equal(split[1]?.requestParameters.amountMinor, 7_500);
    assert.equal(split[0]?.requestParameters.balanceMinor, 7_500);
    assert.notEqual(split[0]?.stripePriceIdempotencyKey, split[1]?.stripePriceIdempotencyKey);
    assert.equal(
      planClientQuotePaymentRequestIntents(quote, {
        now: NOW,
        decision: { kind: "one_time_split", depositMinor: 2_500 },
      })[0]?.stripePriceIdempotencyKey,
      split[0]?.stripePriceIdempotencyKey,
    );
    assert.notEqual(
      planClientQuotePaymentRequestIntents(quote, {
        now: NOW,
        decision: { kind: "one_time_split", depositMinor: 3_000 },
      })[0]?.stripePriceIdempotencyKey,
      split[0]?.stripePriceIdempotencyKey,
    );

    const monthly = planClientQuotePaymentRequestIntents(
      viewOf(issuedQuote({
        lines: [{ id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" }],
      })),
      { now: NOW, decision: { kind: "recurring", billingFrequency: "monthly" } },
    );
    assert.equal(monthly[0]?.requestParameters.oneTimeCollectionMode, null);
    assert.equal(monthly[0]?.requestParameters.amountMinor, 2_500);
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(
          viewOf(issuedQuote({
            lines: [{ id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" }],
          })),
          { now: NOW, decision: { kind: "one_time_full" } },
        ),
      (error: unknown) => {
        expectCode(error, "FREQUENCY_NOT_CHARGEABLE");
        return true;
      },
    );
  });
});

describe("client quote payment persistence", () => {
  it("records a full intent without mutating the quotation and keeps it after expiry", async () => {
    const quote = issuedQuote({
      validity: { validForDays: null, validUntil: "2026-12-31", note: null },
    });
    const memory = createMemoryStore([quote]);
    const stored = memory.quotes.get(QUOTE);
    if (!stored?.issued_snapshot_json) throw new Error("missing quote");
    const before = structuredClone(stored);
    stored.draft_json.totals.totalMinor = 1;
    stored.draft_json.frequencyTotals = [];

    const created = await createIntent(memory.store, { kind: "one_time_full" }, {
      now: "2026-12-31T23:59:59.999Z",
    });
    assert.equal(created.length, 1);
    assert.equal(created[0]?.amountMinor, 10_000);
    assert.equal(created[0]?.amountSource, "frequency_totals");
    assert.equal(created[0]?.requestedBy, USER);
    assert.deepEqual(stored.issued_snapshot_json, before.issued_snapshot_json);
    assert.equal(stored.status, "issued");
    assert.equal(stored.quote_number, before.quote_number);
    assert.equal(stored.draft_json.totals.totalMinor, 1);
    assert.equal(stored.deleted_at, null);
    assert.equal(stored.updated_at, before.updated_at);

    created[0].amountMinor = 1;
    const loaded = await getClientQuotePaymentRequest(memory.store, LICENSEE, created[0].id);
    assert.equal(loaded?.amountMinor, 10_000);

    stored.issued_snapshot_json.frequencyTotals![0].totals.totalMinor = 5;
    await assert.rejects(
      () =>
        createIntent(memory.store, { kind: "one_time_full" }, {
          now: "2027-01-01T00:00:00.000Z",
        }),
      (error: unknown) => {
        expectCode(error, "QUOTE_EXPIRED");
        return true;
      },
    );
    const afterExpiry = await listClientQuotePaymentRequests(memory.store, LICENSEE, QUOTE);
    assert.equal(afterExpiry.length, 1);
    assert.equal(afterExpiry[0]?.amountMinor, 10_000);
    assert.equal(afterExpiry[0]?.stripePriceIdempotencyKey, created[0].stripePriceIdempotencyKey);
    assert.equal(
      (await listClientQuotePaymentRequests(memory.store, OTHER_LICENSEE, QUOTE)).length,
      0,
    );
    assert.equal(
      await getClientQuotePaymentRequest(memory.store, OTHER_LICENSEE, created[0].id),
      null,
    );
  });

  it("rejects masked, draft, foreign, zero, and legacy-ineligible quotations before insert", async () => {
    const quote = issuedQuote();
    const memory = createMemoryStore([quote]);
    const stored = memory.quotes.get(QUOTE);
    if (!stored) throw new Error("missing quote");
    stored.deleted_at = NOW;
    await assert.rejects(
      () => createIntent(memory.store, { kind: "one_time_full" }),
      (error: unknown) => {
        expectCode(error, "QUOTE_MASKED");
        return true;
      },
    );
    assert.equal(memory.requests.length, 0);
    stored.deleted_at = null;

    stored.status = "draft";
    await assert.rejects(
      () => createIntent(memory.store, { kind: "one_time_full" }),
      (error: unknown) => {
        expectCode(error, "QUOTE_NOT_ISSUED");
        return true;
      },
    );
    stored.status = "issued";

    await assert.rejects(
      () =>
        createIntent(memory.store, { kind: "one_time_full" }, {
          licenseeAccountId: OTHER_LICENSEE,
        }),
      (error: unknown) => {
        expectCode(error, "NOT_FOUND");
        return true;
      },
    );

    const zero = issuedQuote({
      id: QUOTE_2,
      lines: [{ id: "free", unitPriceMinor: 0, billingFrequency: "one_time" }],
      quoteNumber: "Q-2026-0008",
    });
    const zeroStore = createMemoryStore([zero]);
    await assert.rejects(
      () => createIntent(zeroStore.store, { kind: "one_time_full" }, { quoteId: QUOTE_2 }),
      (error: unknown) => {
        expectCode(error, "FREQUENCY_NOT_CHARGEABLE");
        return true;
      },
    );
    assert.equal(zeroStore.requests.length, 0);

    const legacy = issuedQuote();
    const legacyStore = createMemoryStore([legacy]);
    const legacyQuote = legacyStore.quotes.get(QUOTE);
    if (!legacyQuote?.issued_snapshot_json) throw new Error("missing legacy quote");
    delete (legacyQuote.issued_snapshot_json as { frequencyTotals?: unknown }).frequencyTotals;
    for (const line of legacyQuote.issued_snapshot_json.lineItems) {
      line.billingFrequency = "monthly";
    }
    await assert.rejects(
      () => createIntent(legacyStore.store, { kind: "one_time_full" }),
      (error: unknown) => {
        expectCode(error, "FREQUENCY_NOT_CHARGEABLE");
        return true;
      },
    );
    assert.equal(legacyStore.requests.length, 0);

    for (const line of legacyQuote.issued_snapshot_json.lineItems) {
      delete line.billingFrequency;
    }
    legacyQuote.issued_snapshot_json.totals.totalMinor = 4242;
    const recorded = await createIntent(legacyStore.store, { kind: "one_time_full" });
    assert.equal(recorded[0]?.amountMinor, 4242);
    assert.equal(recorded[0]?.amountSource, "legacy_one_time_totals");
    assert.equal(legacyQuote.status, "issued");
  });

  it("stores recurring purposes independently and excludes full from split", async () => {
    const quote = issuedQuote({
      lines: [
        { id: "setup", unitPriceMinor: 10_000, billingFrequency: "one_time" },
        { id: "month", unitPriceMinor: 2_500, billingFrequency: "monthly" },
        { id: "quarter", unitPriceMinor: 4_000, billingFrequency: "quarterly" },
        { id: "year", unitPriceMinor: 8_000, billingFrequency: "annually" },
      ],
    });
    const memory = createMemoryStore([quote]);
    const full = await createIntent(memory.store, { kind: "one_time_full" });
    const monthly = await createIntent(memory.store, {
      kind: "recurring",
      billingFrequency: "monthly",
    });
    const quarterly = await createIntent(memory.store, {
      kind: "recurring",
      billingFrequency: "quarterly",
    });
    const annually = await createIntent(memory.store, {
      kind: "recurring",
      billingFrequency: "annually",
    });
    assert.deepEqual(
      [full, monthly, quarterly, annually].map((rows) => rows[0]?.amountMinor),
      [10_000, 2_500, 4_000, 8_000],
    );
    assert.equal(
      memory.requests.some((row) => row.amountMinor === 24_500),
      false,
    );
    await assert.rejects(
      () => createIntent(memory.store, { kind: "one_time_split", depositMinor: 2_500 }),
      (error: unknown) => {
        expectCode(error, "COLLECTION_CONFLICT");
        return true;
      },
    );
    await assert.rejects(
      () =>
        createIntent(memory.store, { kind: "recurring", billingFrequency: "monthly" }),
      (error: unknown) => {
        expectCode(error, "DUPLICATE_PURPOSE");
        return true;
      },
    );
    assert.equal(memory.requests.length, 4);
    assert.equal(
      memory.requests.find((row) => row.purpose === "one_time_full")?.amountMinor,
      10_000,
    );

    const splitQuote = issuedQuote({ id: QUOTE_2, quoteNumber: "Q-2026-0009" });
    const splitMemory = createMemoryStore([splitQuote]);
    await assert.rejects(
      () =>
        createIntent(splitMemory.store, { kind: "one_time_split", depositMinor: 49 }, {
          quoteId: QUOTE_2,
        }),
      (error: unknown) => {
        expectCode(error, "DEPOSIT_BELOW_MINIMUM");
        return true;
      },
    );
    assert.equal(splitMemory.requests.length, 0);
    const pair = await createIntent(
      splitMemory.store,
      { kind: "one_time_split", depositMinor: 2_500 },
      { quoteId: QUOTE_2 },
    );
    assert.deepEqual(
      pair.map((row) => [row.purpose, row.amountMinor, row.balanceMinor]),
      [
        ["one_time_deposit", 2_500, 7_500],
        ["one_time_balance", 7_500, 7_500],
      ],
    );
    await assert.rejects(
      () => createIntent(splitMemory.store, { kind: "one_time_full" }, { quoteId: QUOTE_2 }),
      (error: unknown) => {
        expectCode(error, "COLLECTION_CONFLICT");
        return true;
      },
    );
    assert.equal(splitMemory.requests.length, 2);
  });

  it("serializes concurrent intents and refuses a partial deposit", async () => {
    const quote = issuedQuote();
    const memory = createMemoryStore([quote]);
    const raced = await Promise.allSettled([
      createIntent(memory.store, { kind: "one_time_full" }),
      createIntent(memory.store, { kind: "one_time_split", depositMinor: 4_000 }),
    ]);
    const fulfilled = raced.filter((result) => result.status === "fulfilled");
    const rejected = raced.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.status, "rejected");
    if (rejected[0]?.status === "rejected") expectCode(rejected[0].reason, "COLLECTION_CONFLICT");
    const purposes = memory.requests.map((row) => row.purpose);
    const fullWon = purposes.includes("one_time_full");
    const splitWon = purposes.includes("one_time_deposit") && purposes.includes("one_time_balance");
    assert.equal(fullWon !== splitWon, true);
    assert.equal(purposes.includes("one_time_full") && purposes.includes("one_time_deposit"), false);
    assert.equal(memory.requests.length, fullWon ? 1 : 2);

    const recurringQuote = issuedQuote({
      lines: [{ id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" }],
    });
    const recurringMemory = createMemoryStore([recurringQuote]);
    const repeated = await Promise.allSettled([
      createIntent(recurringMemory.store, { kind: "recurring", billingFrequency: "monthly" }),
      createIntent(recurringMemory.store, { kind: "recurring", billingFrequency: "monthly" }),
    ]);
    assert.equal(repeated.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(recurringMemory.requests.length, 1);
    assert.equal(recurringMemory.requests[0]?.amountMinor, 2_500);

    const both = createMemoryStore([
      issuedQuote({
        lines: [
          { id: "setup", unitPriceMinor: 10_000, billingFrequency: "one_time" },
          { id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" },
        ],
      }),
    ]);
    const independent = await Promise.all([
      createIntent(both.store, { kind: "one_time_full" }),
      createIntent(both.store, { kind: "recurring", billingFrequency: "monthly" }),
    ]);
    assert.equal(independent.length, 2);
    assert.equal(both.requests.length, 2);

    const partial = issuedQuote();
    const frozenRequests: ClientQuotePaymentRequest[] = [];
    assert.throws(
      () =>
        commitClientQuotePaymentRequestIntents(
          { quote: partial, requests: frozenRequests },
          {
            licenseeAccountId: LICENSEE,
            sourceQuoteId: QUOTE,
            requestedBy: USER,
            now: NOW,
            decision: { kind: "one_time_split", depositMinor: 2_500 },
            intents: planClientQuotePaymentRequestIntents(viewOf(partial), {
              now: NOW,
              decision: { kind: "one_time_split", depositMinor: 2_500 },
            }).slice(0, 1),
          },
        ),
      (error: unknown) => {
        expectCode(error, "PAIR_INCOMPLETE");
        return true;
      },
    );
    assert.equal(frozenRequests.length, 0);
    assert.equal(partial.status, "issued");
    assert.equal(partial.issued_snapshot_json?.totals.totalMinor, 10_000);
  });

  it("maps stored rows and RPC failures without treating them as payment status", () => {
    const intent = planClientQuotePaymentRequestIntents(viewOf(issuedQuote()), {
      now: NOW,
      decision: { kind: "one_time_full" },
    })[0];
    if (!intent) throw new Error("missing intent");
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      licensee_account_id: intent.requestParameters.licenseeAccountId,
      organization_id: intent.requestParameters.organizationId,
      requested_by: USER,
      source_quote_id: intent.requestParameters.sourceQuoteId,
      purpose: intent.requestParameters.purpose,
      billing_frequency: intent.requestParameters.billingFrequency,
      currency_code: intent.requestParameters.currencyCode,
      currency_scale: "2",
      amount_minor: String(intent.requestParameters.amountMinor),
      amount_source: intent.requestParameters.amountSource,
      one_time_collection_mode: "full",
      one_time_total_minor: intent.requestParameters.oneTimeTotalMinor,
      deposit_minor: null,
      balance_minor: null,
      quote_number: intent.requestParameters.quoteNumber,
      quote_issued_at: intent.requestParameters.quoteIssuedAt,
      settlement_account: "getoblic_central",
      request_parameters: intent.requestParameters,
      stripe_price_idempotency_key: intent.stripePriceIdempotencyKey,
      stripe_payment_link_idempotency_key: intent.stripePaymentLinkIdempotencyKey,
      created_at: NOW,
    };
    const mapped = mapClientQuotePaymentRequestRow(row);
    assert.equal(mapped.amountMinor, 10_000);
    assert.equal(mapped.stripePriceId, null);
    assert.equal(mapped.stripePaymentLinkId, null);
    assert.equal(mapped.stripePaymentLinkUrl, null);
    assert.equal("status" in mapped, false);

    const customUrl = "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08";
    const linkedRow = mapClientQuotePaymentRequestRow({
      ...row,
      stripe_price_id: "price_1N0aTestPrice123456",
      stripe_payment_link_id: "plink_1N0aTestLink1234567",
      stripe_payment_link_url: customUrl,
    });
    assert.equal(linkedRow.stripePaymentLinkUrl, customUrl);
    assert.equal(linkedRow.amountMinor, mapped.amountMinor);
    assert.equal(linkedRow.stripePriceIdempotencyKey, mapped.stripePriceIdempotencyKey);
    const buyLive = mapClientQuotePaymentRequestRow({
      ...row,
      stripe_price_id: "price_1N0aTestPrice123456",
      stripe_payment_link_id: "plink_1N0aTestLink1234567",
      stripe_payment_link_url: "https://buy.stripe.com/cN25nr0iZ7bUa7meUY",
    });
    assert.equal(buyLive.stripePaymentLinkUrl, "https://buy.stripe.com/cN25nr0iZ7bUa7meUY");
    assert.throws(
      () =>
        mapClientQuotePaymentRequestRow({
          ...row,
          stripe_price_id: "price_1N0aTestPrice123456",
          stripe_payment_link_id: "plink_1N0aTestLink1234567",
          stripe_payment_link_url: "https://pay.getoblic.com/14AdRb6Mt0NF4Fv1hmdIA08",
        }),
      (error: unknown) => {
        expectCode(error, "PERSISTENCE_FAILED");
        return true;
      },
    );

    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.conflict,
      }).code,
      "COLLECTION_CONFLICT",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({ code: "23505", message: "duplicate key" }).code,
      "DUPLICATE_PURPOSE",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.pair,
      }).code,
      "PAIR_INCOMPLETE",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.amount,
      }).code,
      "AMOUNT_REJECTED",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({ message: "connection refused" }).code,
      "PERSISTENCE_FAILED",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.expired,
      }).code,
      "QUOTE_EXPIRED",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.validity,
      }).code,
      "VALIDITY_UNREADABLE",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.fulfillment,
      }).code,
      "FULFILLMENT_REJECTED",
    );
    assert.equal(
      mapClientQuotePaymentRpcError({
        message: CLIENT_QUOTE_PAYMENT_SQL_ERRORS.notFound,
      }).code,
      "NOT_FOUND",
    );
  });

  it("keeps the migration as source SQL for a locked service-role insert", () => {
    const names = readdirSync(join(ROOT, "supabase/migrations")).filter((name) =>
      name.startsWith("20261012000001"),
    );
    assert.deepEqual(names, [
      "20261012000001_create_athena_client_quote_payment_requests.sql",
    ]);
    const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
    assert.equal((sql.match(/create table/gi) ?? []).length, 1);
    assert.match(sql, /create table if not exists public\.athena_client_quote_payment_requests/i);
    assert.match(sql, /references public\.licensee_accounts\(id\) on delete cascade/i);
    assert.match(sql, /references public\.organizations\(id\) on delete restrict/i);
    assert.match(sql, /references public\.athena_client_quotes\(id\) on delete restrict/i);
    assert.match(sql, /source_quote_id, purpose/i);
    assert.match(sql, /for update/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = pg_catalog, public, pg_temp/i);
    assert.match(
      sql,
      new RegExp(`function public\\.${CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC}\\(`),
    );
    for (const code of Object.values(CLIENT_QUOTE_PAYMENT_SQL_ERRORS)) {
      assert.match(sql, new RegExp(code));
    }
    assert.match(sql, /deposit_minor >= 50/);
    assert.match(sql, /balance_minor >= 50/);
    assert.match(sql, /amount_minor >= 50/);
    assert.match(sql, /v_amount < 50/);
    assert.match(sql, /frequencyTotals/);
    assert.match(sql, /legacy_one_time_totals/);
    assert.match(sql, /totalMinor/);
    assert.doesNotMatch(sql, /update\s+(public\.)?athena_client_quotes/i);
    assert.doesNotMatch(sql, /update\s+(public\.)?athena_client_invoices/i);
    assert.doesNotMatch(sql, /insert into public\.athena_client_quotes/i);
    assert.doesNotMatch(sql, /insert into public\.athena_client_invoices/i);
    assert.match(sql, /grant select on table public\.athena_client_quote_payment_requests to service_role/i);
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC}\\(uuid, uuid, uuid, jsonb\\) to service_role`,
      ),
    );
    assert.doesNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+authenticated\b/i);
    assert.doesNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+anon\b/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /before delete/i);
    assert.match(sql, /before update on public\.athena_client_quote_payment_requests/i);
    assert.doesNotMatch(sql, /stripe_status|payment_status|amount_paid|sk_live|api\.stripe\.com/i);
    assert.match(sql, /Do not run supabase db push/i);

    const domain = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentDomain.ts"),
      "utf8",
    );
    const service = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentService.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentSupabaseStore.ts"),
      "utf8",
    );
    assert.doesNotMatch(domain, /calculateClientQuote|draft_json|supabase|athena_client_invoices/);
    assert.doesNotMatch(service, /supabaseAdmin|athena_client_invoices|from\s+["']stripe["']/);
    assert.match(adapter, new RegExp(CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC));
    assert.doesNotMatch(adapter, /\.(update|insert|delete|upsert)\(/);
    assert.doesNotMatch(adapter, /athena_client_invoices|from\s+["']stripe["']|api\.stripe\.com/);
  });
});

const PRICE_ID = "price_1N0aTestPrice123456";
const OTHER_PRICE_ID = "price_1N0aOtherPrice654321";
const LINK_ID = "plink_1N0aTestLink1234567";
const LINK_URL = "https://buy.stripe.com/test_aE1234567890abcd";

function hashedIdempotencyKey(
  kind: "stripe_price" | "stripe_payment_link",
  parameters: ClientQuotePaymentRequest["requestParameters"],
): { payload: string; key: string } {
  const payload = canonicalJson({ kind, parameters });
  const prefix = kind === "stripe_price" ? "cqpr_price_v1_" : "cqpr_link_v1_";
  return {
    payload,
    key: `${prefix}${createHash("sha256").update(payload).digest("hex")}`,
  };
}

describe("client quote payment gate 2A-R", () => {
  it("rejects a charge below 50 minor units for every V1 purpose", () => {
    const full = viewOf(issuedQuote({
      lines: [{ id: "line-1", unitPriceMinor: 49, billingFrequency: "one_time" }],
    }));
    assert.throws(
      () =>
        planClientQuotePaymentRequestIntents(full, {
          now: NOW,
          decision: { kind: "one_time_full" },
        }),
      (error: unknown) => {
        expectCode(error, "AMOUNT_REJECTED");
        return true;
      },
    );
    const fullMinimum = planClientQuotePaymentRequestIntents(
      viewOf(issuedQuote({
        lines: [{ id: "line-1", unitPriceMinor: 50, billingFrequency: "one_time" }],
      })),
      { now: NOW, decision: { kind: "one_time_full" } },
    );
    assert.equal(fullMinimum[0]?.requestParameters.amountMinor, 50);

    for (const frequency of ["monthly", "quarterly", "annually"] as const) {
      assert.throws(
        () =>
          planClientQuotePaymentRequestIntents(
            viewOf(issuedQuote({
              lines: [{ id: "care", unitPriceMinor: 49, billingFrequency: frequency }],
            })),
            { now: NOW, decision: { kind: "recurring", billingFrequency: frequency } },
          ),
        (error: unknown) => {
          expectCode(error, "AMOUNT_REJECTED");
          return true;
        },
      );
      const planned = planClientQuotePaymentRequestIntents(
        viewOf(issuedQuote({
          lines: [{ id: "care", unitPriceMinor: 50, billingFrequency: frequency }],
        })),
        { now: NOW, decision: { kind: "recurring", billingFrequency: frequency } },
      );
      assert.equal(planned[0]?.requestParameters.purpose, frequency);
      assert.equal(planned[0]?.requestParameters.amountMinor, 50);
    }
  });

  it("binds price and payment-link keys to quote and purpose without a row UUID", () => {
    const quote = viewOf(issuedQuote());
    const full = planClientQuotePaymentRequestIntents(quote, {
      now: NOW,
      decision: { kind: "one_time_full" },
    })[0];
    if (!full) throw new Error("missing full intent");
    const later = planClientQuotePaymentRequestIntents(quote, {
      now: "2026-10-12T05:00:00.000Z",
      decision: { kind: "one_time_full" },
    })[0];
    const price = hashedIdempotencyKey("stripe_price", full.requestParameters);
    const link = hashedIdempotencyKey("stripe_payment_link", full.requestParameters);
    assert.equal(full.stripePriceIdempotencyKey, price.key);
    assert.equal(full.stripePaymentLinkIdempotencyKey, link.key);
    assert.equal(
      clientQuotePaymentStripeIdempotencyKey("stripe_price", full.requestParameters),
      price.key,
    );
    assert.equal(later?.stripePriceIdempotencyKey, full.stripePriceIdempotencyKey);
    assert.equal(later?.stripePaymentLinkIdempotencyKey, full.stripePaymentLinkIdempotencyKey);
    assert.notEqual(price.key, link.key);
    const pricePayload = JSON.parse(price.payload) as {
      kind: string;
      id?: string;
      parameters: { sourceQuoteId: string; purpose: string; requestedBy?: string };
    };
    assert.equal(pricePayload.kind, "stripe_price");
    assert.equal(pricePayload.parameters.sourceQuoteId, QUOTE);
    assert.equal(pricePayload.parameters.purpose, "one_time_full");
    assert.equal(Object.hasOwn(pricePayload, "id"), false);
    assert.equal(Object.hasOwn(pricePayload.parameters, "requestedBy"), false);
    assert.equal(JSON.parse(link.payload).kind, "stripe_payment_link");

    const otherQuote = viewOf(issuedQuote({
      id: QUOTE_2,
      quoteNumber: "Q-2026-0008",
    }));
    const other = planClientQuotePaymentRequestIntents(otherQuote, {
      now: NOW,
      decision: { kind: "one_time_full" },
    })[0];
    assert.notEqual(other?.stripePriceIdempotencyKey, full.stripePriceIdempotencyKey);
    assert.notEqual(other?.stripePaymentLinkIdempotencyKey, full.stripePaymentLinkIdempotencyKey);
    assert.equal(other?.requestParameters.amountMinor, full.requestParameters.amountMinor);

    const even = planClientQuotePaymentRequestIntents(
      viewOf(issuedQuote({
        id: QUOTE_2,
        quoteNumber: "Q-2026-0100",
        lines: [{ id: "line-1", unitPriceMinor: 100, billingFrequency: "one_time" }],
      })),
      { now: NOW, decision: { kind: "one_time_split", depositMinor: 50 } },
    );
    assert.equal(even[0]?.requestParameters.purpose, "one_time_deposit");
    assert.equal(even[1]?.requestParameters.purpose, "one_time_balance");
    assert.equal(even[0]?.requestParameters.amountMinor, 50);
    assert.equal(even[1]?.requestParameters.amountMinor, 50);
    assert.notEqual(even[0]?.stripePriceIdempotencyKey, even[1]?.stripePriceIdempotencyKey);
    assert.notEqual(even[0]?.stripePaymentLinkIdempotencyKey, even[1]?.stripePaymentLinkIdempotencyKey);
    const depositPayload = JSON.parse(
      hashedIdempotencyKey("stripe_price", even[0]!.requestParameters).payload,
    ) as { parameters: { purpose: string; amountMinor: number; sourceQuoteId: string } };
    const balancePayload = JSON.parse(
      hashedIdempotencyKey("stripe_price", even[1]!.requestParameters).payload,
    ) as { parameters: { purpose: string; amountMinor: number } };
    assert.equal(depositPayload.parameters.amountMinor, balancePayload.parameters.amountMinor);
    assert.notEqual(depositPayload.parameters.purpose, balancePayload.parameters.purpose);
    assert.equal(depositPayload.parameters.sourceQuoteId, QUOTE_2);
  });

  it("writes Stripe identifiers once and still excludes full from split", async () => {
    const quote = issuedQuote({
      validity: { validForDays: null, validUntil: "2026-12-31", note: null },
      lines: [
        { id: "setup", unitPriceMinor: 10_000, billingFrequency: "one_time" },
        { id: "care", unitPriceMinor: 2_500, billingFrequency: "monthly" },
      ],
    });
    const memory = createMemoryStore([quote]);
    const created = await createIntent(memory.store, { kind: "one_time_full" });
    const intent = created[0];
    if (!intent) throw new Error("missing intent");
    const commercial = {
      amountMinor: intent.amountMinor,
      purpose: intent.purpose,
      sourceQuoteId: intent.sourceQuoteId,
      currencyCode: intent.currencyCode,
      requestParameters: structuredClone(intent.requestParameters),
      stripePriceIdempotencyKey: intent.stripePriceIdempotencyKey,
      stripePaymentLinkIdempotencyKey: intent.stripePaymentLinkIdempotencyKey,
    };

    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: LICENSEE,
          requestId: intent.id,
          stripePriceId: null,
          stripePaymentLinkId: LINK_ID,
          stripePaymentLinkUrl: LINK_URL,
        }),
      (error: unknown) => {
        expectCode(error, "FULFILLMENT_REJECTED");
        return true;
      },
    );
    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: LICENSEE,
          requestId: intent.id,
          stripePriceId: "price_short",
          stripePaymentLinkId: null,
          stripePaymentLinkUrl: null,
        }),
      (error: unknown) => {
        expectCode(error, "FULFILLMENT_REJECTED");
        return true;
      },
    );
    assert.equal(memory.requests[0]?.stripePriceId, null);

    const priced = await recordClientQuotePaymentStripeFulfillment(memory.store, {
      licenseeAccountId: LICENSEE,
      requestId: intent.id,
      stripePriceId: PRICE_ID,
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
    });
    assert.equal(priced.stripePriceId, PRICE_ID);
    assert.equal(priced.stripePaymentLinkId, null);
    const repeated = await recordClientQuotePaymentStripeFulfillment(memory.store, {
      licenseeAccountId: LICENSEE,
      requestId: intent.id,
      stripePriceId: PRICE_ID,
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
    });
    assert.equal(repeated.stripePriceId, PRICE_ID);
    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: LICENSEE,
          requestId: intent.id,
          stripePriceId: OTHER_PRICE_ID,
          stripePaymentLinkId: null,
          stripePaymentLinkUrl: null,
        }),
      (error: unknown) => {
        expectCode(error, "FULFILLMENT_REJECTED");
        return true;
      },
    );
    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: LICENSEE,
          requestId: intent.id,
          stripePriceId: null,
          stripePaymentLinkId: LINK_ID,
          stripePaymentLinkUrl: null,
        }),
      (error: unknown) => {
        expectCode(error, "FULFILLMENT_REJECTED");
        return true;
      },
    );

    const linked = await recordClientQuotePaymentStripeFulfillment(memory.store, {
      licenseeAccountId: LICENSEE,
      requestId: intent.id,
      stripePriceId: null,
      stripePaymentLinkId: LINK_ID,
      stripePaymentLinkUrl: LINK_URL,
    });
    assert.equal(linked.stripePriceId, PRICE_ID);
    assert.equal(linked.stripePaymentLinkId, LINK_ID);
    assert.equal(linked.stripePaymentLinkUrl, LINK_URL);
    assert.equal(linked.amountMinor, commercial.amountMinor);
    assert.equal(linked.purpose, commercial.purpose);
    assert.equal(linked.sourceQuoteId, commercial.sourceQuoteId);
    assert.equal(linked.currencyCode, commercial.currencyCode);
    assert.deepEqual(linked.requestParameters, commercial.requestParameters);
    assert.equal(linked.stripePriceIdempotencyKey, commercial.stripePriceIdempotencyKey);
    assert.equal(linked.stripePaymentLinkIdempotencyKey, commercial.stripePaymentLinkIdempotencyKey);
    assert.equal("status" in linked, false);

    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: LICENSEE,
          requestId: intent.id,
          stripePriceId: null,
          stripePaymentLinkId: LINK_ID,
          stripePaymentLinkUrl: "https://buy.stripe.com/test_replacedurl1234",
        }),
      (error: unknown) => {
        expectCode(error, "FULFILLMENT_REJECTED");
        return true;
      },
    );
    await assert.rejects(
      () =>
        recordClientQuotePaymentStripeFulfillment(memory.store, {
          licenseeAccountId: OTHER_LICENSEE,
          requestId: intent.id,
          stripePriceId: OTHER_PRICE_ID,
          stripePaymentLinkId: null,
          stripePaymentLinkUrl: null,
        }),
      (error: unknown) => {
        expectCode(error, "NOT_FOUND");
        return true;
      },
    );

    const monthly = await createIntent(memory.store, {
      kind: "recurring",
      billingFrequency: "monthly",
    });
    const monthlyIntent = monthly[0];
    if (!monthlyIntent) throw new Error("missing monthly intent");
    const together = await recordClientQuotePaymentStripeFulfillment(memory.store, {
      licenseeAccountId: LICENSEE,
      requestId: monthlyIntent.id,
      stripePriceId: OTHER_PRICE_ID,
      stripePaymentLinkId: "plink_1N0aMonthLink123456",
      stripePaymentLinkUrl: "https://buy.stripe.com/aE1234567890month",
    });
    assert.equal(together.purpose, "monthly");
    assert.equal(together.amountMinor, 2_500);
    assert.equal(together.stripePriceId, OTHER_PRICE_ID);

    await assert.rejects(
      () => createIntent(memory.store, { kind: "one_time_split", depositMinor: 2_500 }),
      (error: unknown) => {
        expectCode(error, "COLLECTION_CONFLICT");
        return true;
      },
    );

    const stored = memory.quotes.get(QUOTE);
    if (!stored?.issued_snapshot_json) throw new Error("missing quote");
    stored.issued_snapshot_json.validity = {
      validForDays: null,
      validUntil: "2026-01-01",
      note: null,
    };
    await assert.rejects(
      () => createIntent(memory.store, { kind: "one_time_full" }),
      (error: unknown) => {
        expectCode(error, "QUOTE_EXPIRED");
        return true;
      },
    );
    const afterExpiry = await listClientQuotePaymentRequests(memory.store, LICENSEE, QUOTE);
    assert.equal(afterExpiry.find((row) => row.purpose === "one_time_full")?.stripePaymentLinkUrl, LINK_URL);
    assert.equal(afterExpiry.find((row) => row.purpose === "one_time_full")?.amountMinor, 10_000);
    assert.equal(memory.requests.length, 2);
  });

  it("keeps the SQL source contract for expiry, the 50 floor, and write-once fulfillment", () => {
    const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
    const expiresBody = sql.slice(
      sql.indexOf("function public.client_quote_payment_expires_at"),
      sql.indexOf("comment on function public.client_quote_payment_expires_at"),
    );
    const createBody = sql.slice(
      sql.indexOf("function public.create_client_quote_payment_request_intents"),
      sql.indexOf("comment on function public.create_client_quote_payment_request_intents"),
    );
    const fulfillBody = sql.slice(
      sql.indexOf("function public.record_client_quote_payment_request_stripe_fulfillment"),
      sql.indexOf("comment on function public.record_client_quote_payment_request_stripe_fulfillment"),
    );
    const triggerBody = sql.slice(
      sql.indexOf("function public.reject_athena_client_quote_payment_request_update"),
      sql.indexOf("comment on function public.reject_athena_client_quote_payment_request_update"),
    );

    assert.ok(expiresBody.indexOf("validUntil") < expiresBody.indexOf("validForDays"));
    assert.match(expiresBody, /at time zone 'UTC'/);
    assert.match(expiresBody, /\+ 1\)::timestamp/);
    assert.match(expiresBody, /v_issued_date \+ v_days/);
    assert.match(createBody, /public\.client_quote_payment_expires_at\(v_snapshot, v_issued_at\)/);
    assert.match(createBody, /pg_catalog\.now\(\) >= v_expires_at/);
    assert.match(createBody, /client_quote_payment_quote_expired/);
    assert.match(createBody, /client_quote_payment_validity_unreadable/);
    assert.match(createBody, /v_amount < 50/);
    assert.match(createBody, /client_quote_payment_collection_conflict/);
    assert.match(createBody, /one_time_deposit/);
    assert.match(createBody, /one_time_balance/);
    assert.doesNotMatch(fulfillBody, /client_quote_payment_expires_at/);
    assert.doesNotMatch(fulfillBody, /amount_minor/);
    assert.doesNotMatch(fulfillBody, /request_parameters/);
    assert.match(fulfillBody, /stripe_price_id = v_price/);
    assert.match(fulfillBody, /stripe_payment_link_id = v_link_id/);
    assert.match(fulfillBody, /stripe_payment_link_url = v_link_url/);
    assert.match(fulfillBody, /for update/);
    assert.match(triggerBody, /old\.stripe_price_id is not null/);
    assert.match(triggerBody, /new\.amount_minor is distinct from old\.amount_minor/);
    assert.match(triggerBody, /new\.stripe_price_idempotency_key is distinct from old\.stripe_price_idempotency_key/);
    assert.match(triggerBody, /new\.request_parameters is distinct from old\.request_parameters/);
    assert.match(sql, /does not model conversion into a different settlement currency/);
    assert.ok(sql.includes("stripe_price_id ~ '^price_[A-Za-z0-9]{8,80}$'"));
    assert.ok(sql.includes("stripe_payment_link_id ~ '^plink_[A-Za-z0-9]{8,80}$'"));
    assert.ok(
      sql.includes(
        "stripe_payment_link_url ~ '^https://buy\\.stripe\\.com/(test_)?[A-Za-z0-9]{8,80}$'",
      ),
    );
    assert.doesNotMatch(sql, /delete from public\.athena_client_quote_payment_requests/i);
    assert.doesNotMatch(sql, /grant\s+update/i);
    assert.doesNotMatch(sql, /grant\s+insert/i);
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC}\\(uuid, uuid, text, text, text\\) to service_role`,
      ),
    );
    assert.match(sql, /where stripe_price_id is not null/);

    const types = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentTypes.ts"),
      "utf8",
    );
    assert.match(types, /Settlement-currency activation caveat/);
    const adapter = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentSupabaseStore.ts"),
      "utf8",
    );
    assert.match(adapter, new RegExp(RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC));
    assert.doesNotMatch(adapter, /\.(update|insert|delete|upsert)\(/);
  });

  it("widens Payment Link URLs in a forward migration without changing fulfillment", () => {
    const previous = readFileSync(join(ROOT, MIGRATION), "utf8");
    const next = readFileSync(
      join(ROOT, "supabase/migrations/20261012000003_accept_getoblic_stripe_payment_link_domain.sql"),
      "utf8",
    );
    const oldPredicate =
      "p_stripe_payment_link_url !~ '^https://buy\\.stripe\\.com/(test_)?[A-Za-z0-9]{8,80}$'";
    const newPredicate =
      "p_stripe_payment_link_url !~ '^https://(buy\\.stripe\\.com|pay\\.getoblic\\.com/b)/(test_)?[A-Za-z0-9]{8,80}$'";
    const constraint =
      "stripe_payment_link_url ~ '^https://(buy\\.stripe\\.com|pay\\.getoblic\\.com/b)/(test_)?[A-Za-z0-9]{8,80}$'";

    function fulfillmentSource(sql: string): string {
      const start = sql.indexOf(
        "create or replace function public.record_client_quote_payment_request_stripe_fulfillment(",
      );
      const end = sql.indexOf(
        "comment on function public.record_client_quote_payment_request_stripe_fulfillment",
      );
      assert.ok(start >= 0 && end > start);
      return sql.slice(start, end);
    }

    assert.equal(previous.includes("pay.getoblic.com"), false);
    assert.equal(
      fulfillmentSource(next).split(newPredicate).join("URL_PREDICATE"),
      fulfillmentSource(previous).split(oldPredicate).join("URL_PREDICATE"),
    );
    assert.equal(next.includes(constraint), true);
    assert.equal(next.includes(newPredicate), true);
    assert.match(next, /security definer/);
    assert.match(next, /set search_path = pg_catalog, public, pg_temp/);
    assert.match(
      next,
      /record_client_quote_payment_request_stripe_fulfillment\(\s*p_licensee_account_id uuid,\s*p_request_id uuid,\s*p_stripe_price_id text,\s*p_stripe_payment_link_id text,\s*p_stripe_payment_link_url text\s*\)/,
    );
    assert.match(
      next,
      /grant execute on function public\.record_client_quote_payment_request_stripe_fulfillment\(uuid, uuid, text, text, text\) to service_role/,
    );
    assert.match(next, /revoke all on function public\.record_client_quote_payment_request_stripe_fulfillment\(uuid, uuid, text, text, text\) from public/);
    assert.match(next, /revoke all on function public\.record_client_quote_payment_request_stripe_fulfillment\(uuid, uuid, text, text, text\) from anon/);
    assert.match(next, /revoke all on function public\.record_client_quote_payment_request_stripe_fulfillment\(uuid, uuid, text, text, text\) from authenticated/);
    assert.match(
      next,
      /Stripe Payment Link URL on buy\.stripe\.com or pay\.getoblic\.com\/b\. Live and test-mode tokens are accepted\./,
    );
    assert.match(next, /for update/);
    assert.doesNotMatch(next, /amount_minor/);
    assert.doesNotMatch(next, /client_quote_payment_expires_at/);
    assert.doesNotMatch(next, /alter table public\.athena_client_quotes/i);
    assert.doesNotMatch(next, /alter table public\.athena_client_invoices/i);
    assert.doesNotMatch(previous, /pay\.getoblic\.com/);
  });
});
