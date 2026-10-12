/**
 * CQ-STRIPE-1 Gate 2B — Stripe adapter and authenticated payment-link API.
 * Uses injected Stripe and database fakes. Does not call Stripe or apply SQL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import type {
  AthenaClientQuote,
  ClientQuoteBillingFrequency,
  ClientQuoteTotals,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  handleClientQuotePaymentLinks,
  createClientQuotePaymentLinksForMaster,
  getClientQuotePaymentLinksForMaster,
  type ClientQuotePaymentLinkDeps,
} from "../../services/clientQuotePayment/clientQuotePaymentApi";
import { commitClientQuotePaymentRequestIntents } from "../../services/clientQuotePayment/clientQuotePaymentCommit";
import { applyClientQuotePaymentStripeFulfillment } from "../../services/clientQuotePayment/clientQuotePaymentFulfillment";
import { parseClientQuotePaymentLinkBody } from "../../services/clientQuotePayment/clientQuotePaymentHttp";
import { createClientQuotePaymentRequestIntents } from "../../services/clientQuotePayment/clientQuotePaymentService";
import type { ClientQuotePaymentRequestStore } from "../../services/clientQuotePayment/clientQuotePaymentStore";
import {
  createStripePaymentClient,
  createStripeV1Http,
  readStripeSecretFromEnv,
  type StripeV1Http,
  type StripeV1HttpRequest,
} from "../../services/clientQuotePayment/clientQuotePaymentStripeAdapter";
import {
  STRIPE_API_VERSION,
  STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS,
  buildStripePaymentLinkCreateBody,
  buildStripePriceCreateBody,
  isOfficialStripePaymentLinkUrl,
  readStripePaymentLinkSnapshot,
  rejectedStripePaymentLinkUrlShape,
  stripeIdempotencyRetryAllowed,
} from "../../services/clientQuotePayment/clientQuotePaymentStripeContract";
import {
  createMemoryStripeDispatchLedger,
  type ClientQuotePaymentStripeDispatch,
} from "../../services/clientQuotePayment/clientQuotePaymentStripeDispatch";
import {
  ClientQuotePaymentStripeError,
} from "../../services/clientQuotePayment/clientQuotePaymentStripeErrors";
import {
  clientQuotePaymentError,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentRequest,
} from "../../services/clientQuotePayment/clientQuotePaymentTypes";

const ROOT = process.cwd();
const SECRET = "sk_test_gate2b_example";
const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_LICENSEE = "abababab-abab-4aba-8aba-abababababab";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ISSUED_AT = "2026-01-15T08:30:00.000Z";
const NOW = "2026-10-12T00:00:00.000Z";
const DOCUMENTED_TEST_URL = "https://buy.stripe.com/test_cN25nr0iZ7bUa7meUY";
const DOCUMENTED_LIVE_URL = "https://buy.stripe.com/cN25nr0iZ7bUa7meUY";
const CONFIRMED_CUSTOM_URL = "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08";
const CUSTOM_TEST_URL = "https://pay.getoblic.com/b/test_14AdRb6Mt0NF4Fv1hmdIA08";
const CONFIRMED_CUSTOM_TOKEN = "14AdRb6Mt0NF4Fv1hmdIA08";

const originalError = console.error;
const logged: string[] = [];
console.error = (...args: unknown[]) => {
  logged.push(args.map((entry) => JSON.stringify(entry)).join(" "));
};
after(() => {
  console.error = originalError;
});

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

function issuedQuote(options: {
  id?: string;
  currencyCode?: string;
  lines?: LineInput[];
  discount?: Record<string, unknown>;
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
      tax: { kind: "none" },
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

function createMemoryStore(seed: AthenaClientQuote[]) {
  const quotes = new Map<string, AthenaClientQuote>();
  for (const quote of seed) quotes.set(quote.id, structuredClone(quote));
  const requests: ClientQuotePaymentRequest[] = [];
  const store: ClientQuotePaymentRequestStore = {
    async getOwnedQuote(id, licenseeAccountId) {
      const quote = quotes.get(id);
      if (!quote || quote.licensee_account_id !== licenseeAccountId) return null;
      return structuredClone(quote);
    },
    async commitPaymentRequestIntents(input) {
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
    },
    async listPaymentRequests(sourceQuoteId, licenseeAccountId) {
      return requests
        .filter(
          (row) =>
            row.sourceQuoteId === sourceQuoteId && row.licenseeAccountId === licenseeAccountId,
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
      const current = requests.find(
        (entry) => entry.id === input.requestId && entry.licenseeAccountId === input.licenseeAccountId,
      );
      if (!current) {
        throw clientQuotePaymentError("NOT_FOUND", "Payment request was not found for this Licensee.");
      }
      const next = applyClientQuotePaymentStripeFulfillment(current, input);
      const index = requests.findIndex((entry) => entry.id === current.id);
      requests[index] = next;
      return structuredClone(next);
    },
  };
  return { store, quotes, requests };
}

type RecordedCall = {
  method: "GET" | "POST";
  path: string;
  body?: string;
  idempotencyKey?: string;
  query?: ReadonlyArray<readonly [string, string]>;
  secret: string;
};

function priceJson(body: string, id: string): Record<string, unknown> {
  const params = new URLSearchParams(body);
  const interval = params.get("recurring[interval]");
  return {
    id,
    object: "price",
    active: true,
    currency: params.get("currency"),
    unit_amount: Number(params.get("unit_amount")),
    lookup_key: params.get("lookup_key"),
    billing_scheme: "per_unit",
    custom_unit_amount: null,
    transform_quantity: null,
    type: interval ? "recurring" : "one_time",
    recurring: interval
      ? {
          interval,
          interval_count: Number(params.get("recurring[interval_count]")),
          trial_period_days: null,
          usage_type: "licensed",
        }
      : null,
  };
}

class StripeDouble {
  readonly calls: RecordedCall[] = [];
  readonly stored = new Map<string, { body: string; status: number; json: unknown }>();
  readonly lookup = new Map<string, unknown>();
  failPriceCreates = 0;
  dropPriceResponse = false;
  cache500 = false;
  failBalanceRemaining = 0;
  badLinkUrl = false;
  linkUrlOverride: ((index: number) => string) | null = null;
  lookupPrices: unknown[] | null = null;
  hasMore = false;
  priceSeq = 0;
  linkSeq = 0;

  constructor(private readonly clock: { value: string }, private readonly requests: ClientQuotePaymentRequest[]) {}

  readonly http: StripeV1Http = async (input) => {
    assert.equal(input.secret, SECRET);
    assert.equal(input.body?.includes(SECRET) ?? false, false);
    this.calls.push({
      method: input.method,
      path: input.path,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      query: input.query,
      secret: input.secret,
    });
    if (input.method === "GET" && input.path !== "/v1/prices") {
      throw new Error("Payment Link inventory was scanned.");
    }
    if (input.method === "GET") {
      assert.equal(input.idempotencyKey, undefined);
      const key = input.query?.find((entry) => entry[0] === "lookup_keys[]")?.[1] ?? "";
      const data = this.lookupPrices ?? (this.lookup.has(key) ? [this.lookup.get(key)] : []);
      return {
        status: 200,
        json: { object: "list", has_more: this.hasMore, data },
      };
    }
    const key = input.idempotencyKey ?? "";
    const previous = this.stored.get(key);
    if (previous) {
      if (previous.body !== input.body) {
        return {
          status: 400,
          json: {
            error: {
              type: "idempotency_error",
              message: "Keys for idempotent requests can only be used with the same parameters",
            },
          },
        };
      }
      return { status: previous.status, json: previous.json };
    }
    if (input.path === "/v1/prices") {
      const json = priceJson(input.body ?? "", `price_Gate2bPrice${String(++this.priceSeq).padStart(2, "0")}`);
      const params = new URLSearchParams(input.body ?? "");
      if (this.failPriceCreates > 0) {
        this.failPriceCreates -= 1;
        throw new Error("socket hang up");
      }
      if (this.dropPriceResponse) {
        this.dropPriceResponse = false;
        this.stored.set(key, { body: input.body ?? "", status: 200, json });
        this.lookup.set(String(json.lookup_key), json);
        throw new Error("socket hang up");
      }
      if (this.cache500) {
        this.cache500 = false;
        this.lookup.set(String(json.lookup_key), json);
        const failure = { error: { type: "api_error", message: "temporary" } };
        this.stored.set(key, { body: input.body ?? "", status: 500, json: failure });
        this.clock.value = new Date(
          Date.parse(this.clock.value) + STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS,
        ).toISOString();
        return { status: 500, json: failure };
      }
      if (this.failBalanceRemaining > 0 && params.get("unit_amount") === "7500") {
        this.failBalanceRemaining -= 1;
        return { status: 400, json: { error: { type: "invalid_request_error", message: "no" } } };
      }
      this.stored.set(key, { body: input.body ?? "", status: 200, json });
      this.lookup.set(String(json.lookup_key), json);
      return { status: 200, json };
    }
    const params = new URLSearchParams(input.body ?? "");
    const priceId = params.get("line_items[0][price]");
    assert.ok(this.requests.some((row) => row.stripePriceId === priceId));
    let url: string;
    if (this.linkUrlOverride) {
      url = this.linkUrlOverride(this.linkSeq);
      this.linkSeq += 1;
    } else if (this.badLinkUrl) {
      url = "https://donate.stripe.com/test_cN25nr0iZ7bUa7meUY";
    } else if (this.linkSeq === 0) {
      url = DOCUMENTED_TEST_URL;
      this.linkSeq = 1;
    } else {
      this.linkSeq += 1;
      url = `https://buy.stripe.com/test_Abcd1234Link${this.linkSeq}Xx`;
    }
    const json = {
      id: `plink_Gate2bLink${String(this.linkSeq).padStart(2, "0")}`,
      object: "payment_link",
      url,
    };
    this.stored.set(key, { body: input.body ?? "", status: 200, json });
    return { status: 200, json };
  };
}

function harness(quote = issuedQuote()) {
  const memory = createMemoryStore([quote]);
  const ledger = createMemoryStripeDispatchLedger();
  const clock = { value: NOW };
  const stripeDouble = new StripeDouble(clock, memory.requests);
  let secretReads = 0;
  let masterReads = 0;
  const deps: ClientQuotePaymentLinkDeps = {
    async requireMaster(userId) {
      masterReads += 1;
      assert.equal(userId, USER);
      return { id: LICENSEE };
    },
    store: memory.store,
    ledger,
    stripe: createStripePaymentClient({
      http: stripeDouble.http,
      secret: () => {
        secretReads += 1;
        return SECRET;
      },
    }),
    now: () => clock.value,
  };
  return { memory, ledger, clock, stripeDouble, deps, secretReads: () => secretReads, masterReads: () => masterReads };
}

async function post(
  deps: ClientQuotePaymentLinkDeps,
  decision: ClientQuotePaymentDecision,
  quoteId = QUOTE,
) {
  return createClientQuotePaymentLinksForMaster({
    masterUserId: USER,
    quoteId,
    decision,
    deps,
  });
}

/**
 * Resolves `record` only when the test acknowledges it. While the promise is
 * pending, fulfillment is suspended on the same await that production uses
 * after the dispatch RPC returns.
 */
function holdDispatchAcknowledgment(base: ReturnType<typeof harness>) {
  type Held = {
    input: ClientQuotePaymentStripeDispatch;
    acknowledge: () => void;
    reject: (error: unknown) => void;
  };
  const queued: Held[] = [];
  const waiting: Array<(row: Held) => void> = [];
  function deliver(row: Held) {
    const waiter = waiting.shift();
    if (waiter) waiter(row);
    else queued.push(row);
  }
  base.deps.ledger = {
    async get() {
      return null;
    },
    record(input) {
      return new Promise((resolve, reject) => {
        deliver({
          input,
          acknowledge() {
            resolve(structuredClone(input));
          },
          reject,
        });
      });
    },
  };
  return {
    deps: base.deps,
    stripeDouble: base.stripeDouble,
    nextAcknowledgment() {
      const existing = queued.shift();
      if (existing) return Promise.resolve(existing);
      return new Promise<Held>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Stripe dispatch was not requested."));
        }, 1_000);
        waiting.push((row) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(row);
        });
      });
    },
  };
}

describe("Stripe payment-link contract", () => {
  it("accepts documented test and live Payment Link URLs only", () => {
    const accepted = [
      DOCUMENTED_TEST_URL,
      DOCUMENTED_LIVE_URL,
      "https://buy.stripe.com/test_aE1234567890abcd",
      "https://buy.stripe.com/aE1234567890month",
      `https://buy.stripe.com/${"a".repeat(8)}`,
      `https://buy.stripe.com/test_${"a".repeat(8)}`,
      `https://buy.stripe.com/${"a".repeat(80)}`,
      CONFIRMED_CUSTOM_URL,
      CUSTOM_TEST_URL,
      `https://pay.getoblic.com/b/${"a".repeat(80)}`,
    ];
    for (const url of accepted) {
      assert.equal(isOfficialStripePaymentLinkUrl(url), true, url);
    }
    assert.deepEqual(
      readStripePaymentLinkSnapshot({
        id: "plink_1N0aTestLink1234567",
        object: "payment_link",
        url: CONFIRMED_CUSTOM_URL,
      }),
      { id: "plink_1N0aTestLink1234567", url: CONFIRMED_CUSTOM_URL },
    );
    const rejected = [
      "https://donate.stripe.com/test_cN25nr0iZ7bUa7meUY",
      "https://book.stripe.com/test_cN25nr0iZ7bUa7meUY",
      "http://buy.stripe.com/test_cN25nr0iZ7bUa7meUY",
      "http://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
      `${DOCUMENTED_TEST_URL}?prefilled_email=a`,
      `${CONFIRMED_CUSTOM_URL}?prefilled_email=a`,
      `${CONFIRMED_CUSTOM_URL}#fragment`,
      "https://user:secret@pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com:443/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08/extra",
      "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08/",
      "https://buy.stripe.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/c/pay/cs_live_abcdefghij",
      "https://www.pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com.evil.example/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://evil.example/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/b/short",
      "https://pay.getoblic.com/b/test_short",
      "https://buy.stripe.com/short",
      `https://buy.stripe.com/${"a".repeat(81)}`,
      `https://pay.getoblic.com/b/test_${"a".repeat(81)}`,
      "https://PAY.GETOBLIC.COM/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/B/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://notpay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
    ];
    for (const url of rejected) {
      assert.equal(isOfficialStripePaymentLinkUrl(url), false, url);
      assert.equal(
        readStripePaymentLinkSnapshot({
          id: "plink_1N0aTestLink1234567",
          object: "payment_link",
          url,
        }),
        null,
      );
    }
    const shape = rejectedStripePaymentLinkUrlShape(
      `https://secret-user:secret-pass@evil.test:8443/b/${CONFIRMED_CUSTOM_TOKEN}?prefilled_email=leaked-buyer#${CONFIRMED_CUSTOM_TOKEN}`,
    );
    assert.deepEqual(shape, {
      hostname: "evil.test",
      pathShape: "userinfo:8443/b/<token>?<query>#<fragment>",
    });
    assert.equal(JSON.stringify(shape).includes(CONFIRMED_CUSTOM_TOKEN), false);
    assert.equal(JSON.stringify(shape).includes("leaked-buyer"), false);
    assert.equal(JSON.stringify(shape).includes("secret"), false);
    assert.deepEqual(rejectedStripePaymentLinkUrlShape(CONFIRMED_CUSTOM_TOKEN), {
      hostname: "invalid",
      pathShape: "invalid",
    });
    assert.equal(
      stripeIdempotencyRetryAllowed(NOW, new Date(Date.parse(NOW) + STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS - 1).toISOString()),
      true,
    );
    assert.equal(
      stripeIdempotencyRetryAllowed(NOW, new Date(Date.parse(NOW) + STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS).toISOString()),
      false,
    );
  });

  it("sends the secret only as a Bearer token to api.stripe.com", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const http = createStripeV1Http(async (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ object: "list", has_more: false, data: [] }), { status: 200 });
    });
    const key = "cqpr_price_v1_" + "ab".repeat(32);
    await http({
      method: "GET",
      path: "/v1/prices",
      query: [
        ["lookup_keys[]", key],
        ["limit", "2"],
      ],
      secret: SECRET,
    });
    const headers = new Headers(seen[0]?.init.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${SECRET}`);
    assert.equal(headers.get("Stripe-Version"), STRIPE_API_VERSION);
    assert.equal(headers.get("Idempotency-Key"), null);
    assert.equal(headers.has("Stripe-Account"), false);
    assert.equal(seen[0]?.init.redirect, "manual");
    assert.ok(seen[0]?.url.startsWith("https://api.stripe.com/v1/prices?"));
    assert.equal(seen[0]?.url.includes("/v1/payment_links"), false);
    await assert.rejects(() =>
      http({
        method: "GET",
        path: "/v1/payment_links" as "/v1/prices",
        secret: SECRET,
      } as StripeV1HttpRequest),
    );
    assert.throws(
      () => readStripeSecretFromEnv({}),
      (error: unknown) => {
        assert.ok(error instanceof ClientQuotePaymentStripeError);
        assert.equal(error.message.includes(SECRET), false);
        assert.equal(error.message.includes("STRIPE_SECRET_KEY"), false);
        return true;
      },
    );
    assert.equal(readStripeSecretFromEnv({ STRIPE_SECRET_KEY: SECRET }), SECRET);
  });
});

describe("authenticated payment links", () => {
  it("rejects missing auth, the wrong Licensee, and browser charge authority", async () => {
    const { deps, stripeDouble, memory, secretReads } = harness();
    const missing = await handleClientQuotePaymentLinks({
      method: "POST",
      quoteId: QUOTE,
      userId: null,
      body: { decision: { kind: "one_time_full" } },
      parseBody: parseClientQuotePaymentLinkBody,
      deps,
    });
    assert.equal(missing.status, 401);
    assert.equal(stripeDouble.calls.length, 0);

    const denied = await handleClientQuotePaymentLinks({
      method: "GET",
      quoteId: QUOTE,
      userId: USER,
      parseBody: parseClientQuotePaymentLinkBody,
      deps: {
        ...deps,
        async requireMaster() {
          const error = new Error("Authenticated user is not a Business Licensee Master.");
          error.name = "LicenseeAccessError";
          throw error;
        },
      },
    });
    assert.equal(denied.status, 403);
    if (denied.payload.ok) throw new Error("expected access denial");
    assert.equal(denied.payload.error.code, "LICENSEE_ACCESS_DENIED");
    assert.equal(stripeDouble.calls.length, 0);

    const foreign = await getClientQuotePaymentLinksForMaster({
      masterUserId: USER,
      quoteId: QUOTE,
      deps: { ...deps, async requireMaster() { return { id: OTHER_LICENSEE }; } },
    }).then(
      () => { throw new Error("expected not found"); },
      (error: unknown) => error,
    );
    assert.ok(foreign instanceof Error);
    assert.equal((foreign as { code?: string }).code, "NOT_FOUND");
    assert.equal(secretReads(), 0);

    const amount = parseClientQuotePaymentLinkBody({
      decision: { kind: "one_time_full" },
      amountMinor: 1,
      currencyCode: "USD",
      stripePriceId: "price_FromBrowser123",
    });
    assert.equal("status" in amount && amount.status, 400);
    const splitAmount = parseClientQuotePaymentLinkBody({
      decision: { kind: "one_time_split", depositMinor: 2_500, amountMinor: 1 },
    });
    assert.equal("status" in splitAmount && splitAmount.status, 400);
    assert.equal(memory.requests.length, 0);
    assert.equal(stripeDouble.calls.length, 0);
  });

  it("creates one-time, split, and independent recurring links from the frozen snapshot", async () => {
    const quote = issuedQuote({
      currencyCode: "EUR",
      lines: [
        { id: "once", unitPriceMinor: 10_000, billingFrequency: "one_time" },
        { id: "month", unitPriceMinor: 2_000, billingFrequency: "monthly" },
        { id: "quarter", unitPriceMinor: 3_000, billingFrequency: "quarterly" },
        { id: "year", unitPriceMinor: 4_000, billingFrequency: "annually" },
      ],
    });
    const { deps, stripeDouble, memory, ledger } = harness(quote);
    const snapshot = JSON.stringify(memory.quotes.get(QUOTE)?.issued_snapshot_json);
    const draft = memory.quotes.get(QUOTE);
    if (draft?.draft_json) draft.draft_json.lineItems[0]!.unitPriceMinor = 1;

    const full = await post(deps, { kind: "one_time_full" });
    assert.equal(full.paymentRequests[0]?.amountMinor, 10_000);
    assert.equal(full.paymentRequests[0]?.currencyCode, "EUR");
    assert.equal(full.paymentRequests[0]?.paymentLinkUrl, DOCUMENTED_TEST_URL);
    const priceCall = stripeDouble.calls.find((call) => call.path === "/v1/prices");
    const priceBody = new URLSearchParams(priceCall?.body ?? "");
    assert.equal(priceBody.get("currency"), "eur");
    assert.equal(priceBody.get("unit_amount"), "10000");
    assert.equal(priceBody.get("product_data[name]"), "Quote Q-2026-0007 full payment");
    assert.equal(priceBody.get("lookup_key"), memory.requests[0]?.stripePriceIdempotencyKey);
    assert.equal(priceBody.get("recurring[interval]"), null);
    assert.equal(priceBody.has("transfer_lookup_key"), false);
    assert.equal(priceCall?.idempotencyKey, memory.requests[0]?.stripePriceIdempotencyKey);
    const linkCall = stripeDouble.calls.find((call) => call.path === "/v1/payment_links");
    const linkBody = new URLSearchParams(linkCall?.body ?? "");
    assert.equal(linkBody.get("line_items[0][quantity]"), "1");
    assert.equal(linkBody.get("line_items[0][price]"), memory.requests[0]?.stripePriceId);
    assert.equal(linkBody.get("restrictions[completed_sessions][limit]"), "1");
    assert.equal(linkBody.get("after_completion[type]"), "hosted_confirmation");
    assert.equal(linkBody.get("automatic_tax[enabled]"), "false");
    assert.equal(linkBody.get("allow_promotion_codes"), "false");
    assert.equal(linkBody.has("optional_items[0][price]"), false);
    assert.equal(linkBody.has("line_items[0][adjustable_quantity][enabled]"), false);
    assert.equal(linkBody.has("subscription_data[trial_period_days]"), false);
    assert.equal(linkBody.has("application_fee_amount"), false);
    assert.equal(linkBody.has("transfer_data[destination]"), false);
    assert.equal(linkBody.has("on_behalf_of"), false);
    assert.equal(linkBody.has("line_items[0][price_data][currency]"), false);
    assert.equal(linkCall?.idempotencyKey, memory.requests[0]?.stripePaymentLinkIdempotencyKey);
    assert.notEqual(priceCall?.idempotencyKey, linkCall?.idempotencyKey);
    assert.equal(JSON.stringify(full).includes(SECRET), false);
    assert.equal(JSON.stringify(full).includes("cqpr_"), false);
    assert.equal(JSON.stringify(full).includes("price_"), false);
    assert.equal("stripePriceId" in (full.paymentRequests[0] ?? {}), false);
    assert.equal(JSON.stringify(memory.quotes.get(QUOTE)?.issued_snapshot_json), snapshot);

    const beforeRetry = stripeDouble.calls.length;
    await post(deps, { kind: "one_time_full" });
    assert.equal(stripeDouble.calls.length, beforeRetry);
    assert.equal(memory.requests.length, 1);

    const split = harness(issuedQuote());
    const splitResult = await post(split.deps, { kind: "one_time_split", depositMinor: 2_500 });
    assert.deepEqual(
      splitResult.paymentRequests.map((row) => [row.purpose, row.amountMinor]),
      [
        ["one_time_deposit", 2_500],
        ["one_time_balance", 7_500],
      ],
    );
    const splitPrices = split.stripeDouble.calls.filter((call) => call.path === "/v1/prices");
    assert.deepEqual(splitPrices.map((call) => new URLSearchParams(call.body ?? "").get("unit_amount")), [
      "2500",
      "7500",
    ]);
    assert.equal(new URLSearchParams(splitPrices[0]?.body ?? "").get("recurring[interval]"), null);
    assert.equal(split.stripeDouble.calls.filter((call) => call.method === "GET").length, 0);

    const recurring = harness(quote);
    for (const [frequency, amount, interval, count] of [
      ["monthly", "2000", "month", "1"],
      ["quarterly", "3000", "month", "3"],
      ["annually", "4000", "year", "1"],
    ] as const) {
      await post(recurring.deps, { kind: "recurring", billingFrequency: frequency });
      const body = new URLSearchParams(
        [...recurring.stripeDouble.calls].reverse().find((call) => call.path === "/v1/prices")?.body ?? "",
      );
      assert.equal(body.get("unit_amount"), amount);
      assert.equal(body.get("recurring[interval]"), interval);
      assert.equal(body.get("recurring[interval_count]"), count);
    }
    assert.equal(ledger.all().every((row) => row.requestBody.includes(SECRET) === false), true);
  });

  it("keeps the original idempotency key when a Price create response is lost", async () => {
    const { deps, stripeDouble, memory, ledger } = harness();
    stripeDouble.dropPriceResponse = true;
    const created = await post(deps, { kind: "one_time_full" });
    const priceCalls = stripeDouble.calls.filter((call) => call.path === "/v1/prices");
    assert.equal(priceCalls.length, 2);
    assert.equal(priceCalls[0]?.idempotencyKey, priceCalls[1]?.idempotencyKey);
    assert.equal(priceCalls[0]?.body, priceCalls[1]?.body);
    assert.equal(priceCalls[0]?.idempotencyKey, memory.requests[0]?.stripePriceIdempotencyKey);
    assert.equal(ledger.all().filter((row) => row.kind === "price").length, 1);
    assert.equal(created.paymentRequests[0]?.paymentLinkUrl, DOCUMENTED_TEST_URL);
    assert.equal([...stripeDouble.stored.keys()].filter((key) => key.startsWith("cqpr_price")).length, 1);
  });

  it("recovers a Price by lookup_key after the idempotency window and fails closed for a Payment Link", async () => {
    const lost = harness();
    lost.stripeDouble.cache500 = true;
    const recovered = await post(lost.deps, { kind: "one_time_full" });
    const posts = lost.stripeDouble.calls.filter((call) => call.method === "POST" && call.path === "/v1/prices");
    const lookups = lost.stripeDouble.calls.filter((call) => call.method === "GET");
    assert.equal(posts.length, 1);
    assert.equal(lookups.length, 1);
    assert.deepEqual(lookups[0]?.query, [
      ["lookup_keys[]", lost.memory.requests[0]?.stripePriceIdempotencyKey],
      ["limit", "2"],
    ]);
    assert.equal(recovered.paymentRequests[0]?.paymentLinkUrl, DOCUMENTED_TEST_URL);
    assert.equal(lost.stripeDouble.calls.some((call) => call.path === "/v1/payment_links" && call.method === "GET"), false);

    const mismatch = harness();
    const intent = await createClientQuotePaymentRequestIntents(mismatch.memory.store, {
      licenseeAccountId: LICENSEE,
      sourceQuoteId: QUOTE,
      requestedBy: USER,
      now: NOW,
      decision: { kind: "one_time_full" },
    });
    const row = intent[0];
    if (!row) throw new Error("missing intent");
    await mismatch.ledger.record({
      licenseeAccountId: LICENSEE,
      paymentRequestId: row.id,
      kind: "price",
      idempotencyKey: row.stripePriceIdempotencyKey,
      requestBody: buildStripePriceCreateBody(row),
      dispatchedAt: "2026-09-01T00:00:00.000Z",
    });
    mismatch.stripeDouble.lookupPrices = [
      {
        ...(priceJson(buildStripePriceCreateBody(row), "price_MismatchPrice1")),
        unit_amount: 1,
      },
    ];
    await assert.rejects(
      () => post(mismatch.deps, { kind: "one_time_full" }),
      (error: unknown) => error instanceof ClientQuotePaymentStripeError && error.code === "STRIPE_PRICE_MISMATCH",
    );
    assert.equal(mismatch.stripeDouble.calls.some((call) => call.method === "POST"), false);
    assert.equal(mismatch.memory.requests[0]?.stripePriceId, null);

    const link = harness();
    const seeded = await createClientQuotePaymentRequestIntents(link.memory.store, {
      licenseeAccountId: LICENSEE,
      sourceQuoteId: QUOTE,
      requestedBy: USER,
      now: NOW,
      decision: { kind: "one_time_full" },
    });
    const seededRow = seeded[0];
    if (!seededRow) throw new Error("missing seeded intent");
    await link.memory.store.recordStripeFulfillment({
      licenseeAccountId: LICENSEE,
      requestId: seededRow.id,
      stripePriceId: "price_Preseeded01",
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
    });
    const priced = link.memory.requests[0];
    if (!priced?.stripePriceId) throw new Error("missing price");
    await link.ledger.record({
      licenseeAccountId: LICENSEE,
      paymentRequestId: priced.id,
      kind: "payment_link",
      idempotencyKey: priced.stripePaymentLinkIdempotencyKey,
      requestBody: buildStripePaymentLinkCreateBody(priced),
      dispatchedAt: "2026-09-01T00:00:00.000Z",
    });
    await assert.rejects(
      () => post(link.deps, { kind: "one_time_full" }),
      (error: unknown) =>
        error instanceof ClientQuotePaymentStripeError && error.code === "STRIPE_LINK_UNRECOVERABLE",
    );
    assert.equal(link.stripeDouble.calls.length, 0);
    assert.equal(link.memory.requests[0]?.stripePaymentLinkUrl, null);
  });

  it("does not treat the intent timestamp as Stripe initiation, and blocks new Stripe work after expiry", async () => {
    const early = harness();
    early.clock.value = "2026-01-20T00:00:00.000Z";
    await createClientQuotePaymentRequestIntents(early.memory.store, {
      licenseeAccountId: LICENSEE,
      sourceQuoteId: QUOTE,
      requestedBy: USER,
      now: early.clock.value,
      decision: { kind: "one_time_full" },
    });
    assert.equal(early.memory.requests[0]?.createdAt, early.clock.value);
    early.clock.value = "2026-03-01T00:00:00.000Z";
    await post(early.deps, { kind: "one_time_full" });
    assert.equal(early.stripeDouble.calls[0]?.method, "POST");
    assert.equal(early.stripeDouble.calls[0]?.path, "/v1/prices");
    assert.equal(early.ledger.all()[0]?.dispatchedAt, "2026-03-01T00:00:00.000Z");

    const expired = harness();
    await createClientQuotePaymentRequestIntents(expired.memory.store, {
      licenseeAccountId: LICENSEE,
      sourceQuoteId: QUOTE,
      requestedBy: USER,
      now: NOW,
      decision: { kind: "one_time_full" },
    });
    const stored = expired.memory.quotes.get(QUOTE);
    if (!stored?.issued_snapshot_json) throw new Error("missing quote");
    stored.issued_snapshot_json.validity = { validForDays: null, validUntil: "2026-01-01", note: null };
    await assert.rejects(
      () => post(expired.deps, { kind: "one_time_full" }),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "QUOTE_EXPIRED",
    );
    assert.equal(expired.stripeDouble.calls.length, 0);
    assert.equal(expired.ledger.all().length, 0);
    const listed = await getClientQuotePaymentLinksForMaster({
      masterUserId: USER,
      quoteId: QUOTE,
      deps: expired.deps,
    });
    assert.equal(listed.eligibility.expired, true);
    assert.equal(listed.eligibility.canCreatePaymentRequest, false);
    assert.equal(listed.eligibility.canInitiateStripe, false);
    assert.equal(listed.paymentRequests.length, 1);
    assert.equal(listed.paymentRequests[0]?.amountMinor, 10_000);
    assert.equal(expired.secretReads(), 0);

    const recoverable = harness(
      issuedQuote({
        lines: [
          { id: "once", unitPriceMinor: 10_000, billingFrequency: "one_time" },
          { id: "month", unitPriceMinor: 2_000, billingFrequency: "monthly" },
        ],
      }),
    );
    await createClientQuotePaymentRequestIntents(recoverable.memory.store, {
      licenseeAccountId: LICENSEE,
      sourceQuoteId: QUOTE,
      requestedBy: USER,
      now: NOW,
      decision: { kind: "recurring", billingFrequency: "monthly" },
    });
    await recoverable.memory.store.recordStripeFulfillment({
      licenseeAccountId: LICENSEE,
      requestId: recoverable.memory.requests[0]!.id,
      stripePriceId: "price_Preseeded01",
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
    });
    const priced = recoverable.memory.requests[0];
    if (!priced) throw new Error("missing priced intent");
    const body = buildStripePaymentLinkCreateBody(priced);
    await recoverable.ledger.record({
      licenseeAccountId: LICENSEE,
      paymentRequestId: priced.id,
      kind: "payment_link",
      idempotencyKey: priced.stripePaymentLinkIdempotencyKey,
      requestBody: body,
      dispatchedAt: NOW,
    });
    const quote = recoverable.memory.quotes.get(QUOTE);
    if (!quote?.issued_snapshot_json) throw new Error("missing quote");
    quote.issued_snapshot_json.validity = { validForDays: null, validUntil: "2026-01-01", note: null };
    const finished = await post(recoverable.deps, { kind: "recurring", billingFrequency: "monthly" });
    assert.equal(recoverable.stripeDouble.calls.length, 1);
    assert.equal(recoverable.stripeDouble.calls[0]?.body, body);
    assert.equal(recoverable.stripeDouble.calls[0]?.idempotencyKey, priced.stripePaymentLinkIdempotencyKey);
    assert.equal(finished.paymentRequests[0]?.paymentLinkUrl, DOCUMENTED_TEST_URL);
    assert.equal(finished.eligibility.expired, true);
    assert.equal(recoverable.memory.requests.length, 1);
  });

  it("does not call Stripe before the dispatch acknowledgment succeeds", async () => {
    const held = holdDispatchAcknowledgment(harness());
    const work = post(held.deps, { kind: "one_time_full" });
    const price = await held.nextAcknowledgment();
    assert.equal(price.input.kind, "price");
    assert.equal(held.stripeDouble.calls.length, 0);
    price.acknowledge();

    const link = await held.nextAcknowledgment();
    assert.equal(link.input.kind, "payment_link");
    assert.equal(held.stripeDouble.calls.filter((call) => call.method === "GET").length, 0);
    assert.equal(
      held.stripeDouble.calls.filter((call) => call.path === "/v1/payment_links").length,
      0,
    );
    const priceCall = held.stripeDouble.calls.find((call) => call.path === "/v1/prices");
    assert.equal(priceCall?.method, "POST");
    assert.equal(priceCall?.idempotencyKey, price.input.idempotencyKey);
    assert.equal(priceCall?.body, price.input.requestBody);
    link.acknowledge();

    const created = await work;
    const linkCalls = held.stripeDouble.calls.filter((call) => call.path === "/v1/payment_links");
    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0]?.method, "POST");
    assert.equal(linkCalls[0]?.idempotencyKey, link.input.idempotencyKey);
    assert.equal(linkCalls[0]?.body, link.input.requestBody);
    assert.equal(created.paymentRequests[0]?.paymentLinkUrl, DOCUMENTED_TEST_URL);

    const failed = holdDispatchAcknowledgment(harness());
    const failedWork = post(failed.deps, { kind: "one_time_full" });
    const failedAssertion = assert.rejects(
      failedWork,
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "PERSISTENCE_FAILED",
    );
    const failedPrice = await failed.nextAcknowledgment();
    assert.equal(failed.stripeDouble.calls.length, 0);
    failedPrice.reject(
      clientQuotePaymentError("PERSISTENCE_FAILED", "Could not record the Stripe dispatch."),
    );
    await failedAssertion;
    assert.equal(failed.stripeDouble.calls.length, 0);

    const lostLink = holdDispatchAcknowledgment(harness());
    const lostWork = post(lostLink.deps, { kind: "one_time_full" });
    const lostAssertion = assert.rejects(
      lostWork,
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "PERSISTENCE_FAILED",
    );
    const lostPrice = await lostLink.nextAcknowledgment();
    lostPrice.acknowledge();
    const lostPaymentLink = await lostLink.nextAcknowledgment();
    assert.equal(
      lostLink.stripeDouble.calls.filter((call) => call.path === "/v1/payment_links").length,
      0,
    );
    lostPaymentLink.reject(
      clientQuotePaymentError("PERSISTENCE_FAILED", "Could not record the Stripe dispatch."),
    );
    await lostAssertion;
    assert.equal(
      lostLink.stripeDouble.calls.filter((call) => call.path === "/v1/payment_links").length,
      0,
    );
  });

  it("does not initiate Stripe when the secret is missing, and isolates it from the public DTO", async () => {
    const { deps, memory, ledger, stripeDouble } = harness();
    deps.stripe = createStripePaymentClient({
      http: stripeDouble.http,
      secret: () => {
        throw new Error("missing");
      },
    });
    await assert.rejects(
      () => post(deps, { kind: "one_time_full" }),
      (error: unknown) =>
        error instanceof ClientQuotePaymentStripeError && error.code === "STRIPE_NOT_CONFIGURED",
    );
    assert.equal(memory.requests.length, 1);
    assert.equal(ledger.all().length, 0);
    assert.equal(stripeDouble.calls.length, 0);
    assert.equal(logged.some((line) => line.includes(SECRET)), false);
  });

  it("persists a pay.getoblic.com Payment Link returned with HTTP 200", async () => {
    const full = harness();
    full.stripeDouble.linkUrlOverride = () => CONFIRMED_CUSTOM_URL;
    const created = await post(full.deps, { kind: "one_time_full" });
    const stored = full.memory.requests[0];
    if (!stored) throw new Error("missing intent");
    const linkCall = full.stripeDouble.calls.find((call) => call.path === "/v1/payment_links");
    assert.equal(linkCall?.method, "POST");
    assert.equal(linkCall?.idempotencyKey, stored.stripePaymentLinkIdempotencyKey);
    assert.equal(linkCall?.body, buildStripePaymentLinkCreateBody(stored));
    assert.equal(linkCall?.body?.includes("pay.getoblic.com"), false);
    assert.equal(linkCall?.body?.includes("custom_domain"), false);
    assert.equal(created.paymentRequests[0]?.paymentLinkUrl, CONFIRMED_CUSTOM_URL);
    assert.equal(stored.stripePaymentLinkUrl, CONFIRMED_CUSTOM_URL);
    assert.equal(stored.amountMinor, 10_000);
    assert.equal(stored.licenseeAccountId, LICENSEE);
    assert.equal(stored.purpose, "one_time_full");
    const beforeRetry = full.stripeDouble.calls.length;
    const repeated = await post(full.deps, { kind: "one_time_full" });
    assert.equal(full.stripeDouble.calls.length, beforeRetry);
    assert.equal(repeated.paymentRequests[0]?.paymentLinkUrl, CONFIRMED_CUSTOM_URL);
    assert.equal(full.memory.requests.length, 1);
    assert.equal(
      full.memory.requests[0]?.stripePaymentLinkIdempotencyKey,
      stored.stripePaymentLinkIdempotencyKey,
    );

    const split = harness();
    split.stripeDouble.linkUrlOverride = (index) =>
      index === 0 ? CONFIRMED_CUSTOM_URL : CUSTOM_TEST_URL;
    const splitResult = await post(split.deps, { kind: "one_time_split", depositMinor: 2_500 });
    assert.deepEqual(
      splitResult.paymentRequests.map((row) => [row.purpose, row.amountMinor, row.paymentLinkUrl]),
      [
        ["one_time_deposit", 2_500, CONFIRMED_CUSTOM_URL],
        ["one_time_balance", 7_500, CUSTOM_TEST_URL],
      ],
    );
    assert.notEqual(
      split.memory.requests[0]?.stripePaymentLinkIdempotencyKey,
      split.memory.requests[1]?.stripePaymentLinkIdempotencyKey,
    );
    assert.equal(split.memory.requests[0]?.licenseeAccountId, LICENSEE);
    const splitCalls = split.stripeDouble.calls.length;
    await post(split.deps, { kind: "one_time_split", depositMinor: 2_500 });
    assert.equal(split.stripeDouble.calls.length, splitCalls);
    assert.equal(split.memory.requests.length, 2);
  });

  it("logs hostname and path shape when Stripe HTTP 200 returns a rejected URL", async () => {
    const rejectedUrl = `https://rejected-host.example/b/${CONFIRMED_CUSTOM_TOKEN}?prefilled_email=leaked-buyer`;
    const { deps, stripeDouble, memory } = harness();
    stripeDouble.linkUrlOverride = () => rejectedUrl;
    const start = logged.length;
    await assert.rejects(
      () => post(deps, { kind: "one_time_full" }),
      (error: unknown) =>
        error instanceof ClientQuotePaymentStripeError && error.code === "STRIPE_REJECTED",
    );
    assert.equal(memory.requests[0]?.stripePaymentLinkUrl, null);
    assert.equal(memory.requests[0]?.stripePriceId == null, false);
    const fresh = logged.slice(start).filter((line) => line.includes("stripe_payment_link_url_rejected"));
    assert.equal(fresh.length, 1);
    assert.match(fresh[0] ?? "", /"hostname":"rejected-host.example"/);
    assert.match(fresh[0] ?? "", /"pathShape":"\/b\/<token>\?<query>"/);
    assert.equal(fresh[0]?.includes(CONFIRMED_CUSTOM_TOKEN), false);
    assert.equal(fresh[0]?.includes(rejectedUrl), false);
    assert.equal(fresh[0]?.includes("leaked-buyer"), false);
    assert.equal(stripeDouble.calls.filter((call) => call.path === "/v1/payment_links").length, 1);
  });
});

describe("payment-link source boundaries", () => {
  it("keeps the route authenticated and the secret on the server", () => {
    const route = readFileSync(
      join(ROOT, "app/api/licensee/client-quotes/[id]/payment-links/route.ts"),
      "utf8",
    );
    const server = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentServer.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentStripeAdapter.ts"),
      "utf8",
    );
    const dispatch = readFileSync(
      join(ROOT, "services/clientQuotePayment/clientQuotePaymentStripeDispatchStore.ts"),
      "utf8",
    );
    const migration = readFileSync(
      join(ROOT, "supabase/migrations/20261012000002_record_client_quote_payment_stripe_dispatch.sql"),
      "utf8",
    );
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /auth\.getUser\(\)/);
    assert.doesNotMatch(route, /STRIPE_SECRET_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_STRIPE/);
    assert.match(server, /requireLicenseeMasterAccount/);
    assert.match(server, /readStripeSecretFromEnv/);
    assert.doesNotMatch(server, /NEXT_PUBLIC_STRIPE/);
    assert.match(adapter, /Authorization", `Bearer \$\{input\.secret\}`/);
    assert.doesNotMatch(adapter, /Stripe-Account/);
    assert.match(adapter, /Stripe Payment Link inventory is not queried/);
    assert.doesNotMatch(dispatch, /\.(update|insert|delete|upsert)\(/);
    assert.match(dispatch, /record_client_quote_payment_stripe_dispatch/);
    assert.match(migration, /dispatched_at timestamptz not null/);
    assert.match(migration, /for share/);
    assert.match(migration, /stripe_price_idempotency_key/);
    assert.match(migration, /stripe_payment_link_idempotency_key/);
    assert.doesNotMatch(migration, /alter table public\.athena_client_quotes/i);
    assert.doesNotMatch(migration, /alter table public\.athena_client_invoices/i);
    assert.doesNotMatch(migration, /grant\s+insert/i);
    assert.match(
      migration,
      /grant execute on function public\.record_client_quote_payment_stripe_dispatch\(uuid, uuid, text, text, text, timestamptz\) to service_role/,
    );
  });
});
