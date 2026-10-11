/**
 * CQ-STRIPE-1 Gate 2B — Stripe API v1 request bodies.
 *
 * Checked against the documented v1 Price and Payment Link create calls
 * (Stripe-Version 2026-04-22.dahlia):
 * - POST /v1/prices
 * - POST /v1/payment_links
 * - GET /v1/prices?lookup_keys[]=...
 *
 * Price product_data.name is the customer-displayable product text. The
 * Price create product_data object does not document a separate description
 * field. Payment Links are created from the persisted Price, not inline
 * price_data.
 *
 * Official Payment Link url examples use https://buy.stripe.com/test_… in
 * test mode and https://buy.stripe.com/… in live mode. submit_type is left
 * at its default so the host stays buy.stripe.com. donate.stripe.com and
 * book.stripe.com are not accepted. Validation stays on the Gate 2A pattern.
 */

import {
  STRIPE_PAYMENT_LINK_ID_PATTERN,
  STRIPE_PAYMENT_LINK_URL_PATTERN,
  STRIPE_PRICE_ID_PATTERN,
} from "@/services/clientQuotePayment/clientQuotePaymentFulfillment";
import type {
  ClientQuotePaymentPurpose,
  ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

/** Documented Stripe API v1 version for these create calls. */
export const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

export const STRIPE_API_ORIGIN = "https://api.stripe.com" as const;

/**
 * Stripe retains an API v1 idempotency result for at least 24 hours.
 * After that, reusing the key can execute a new request. Retries are
 * allowed only while the elapsed time is strictly under this window,
 * measured from Stripe dispatch, not from the Athena intent row.
 */
export const STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STRIPE_PRICE_CREATE_PATH = "/v1/prices" as const;
export const STRIPE_PAYMENT_LINK_CREATE_PATH = "/v1/payment_links" as const;

const PURPOSE_LABEL: Record<ClientQuotePaymentPurpose, string> = {
  one_time_full: "full payment",
  one_time_deposit: "deposit",
  one_time_balance: "balance",
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annual",
};

export type StripeRecurringInterval = {
  interval: "month" | "year";
  intervalCount: 1 | 3;
};

export type StripePriceSnapshot = {
  id: string;
  lookupKey: string;
  currency: string;
  unitAmount: number;
  active: boolean;
  billingScheme: string | null;
  customUnitAmount: unknown;
  transformQuantity: unknown;
  recurring: {
    interval: string;
    intervalCount: number;
    trialPeriodDays: number | null;
    usageType: string | null;
  } | null;
};

export type StripePaymentLinkSnapshot = {
  id: string;
  url: string;
};

export function stripeIdempotencyRetryAllowed(
  dispatchedAt: string,
  now: string,
): boolean {
  const start = Date.parse(dispatchedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return false;
  if (current < start) return false;
  return current - start < STRIPE_V1_IDEMPOTENCY_SAFE_WINDOW_MS;
}

export function clientQuotePaymentRecurringInterval(
  billingFrequency: ClientQuotePaymentRequest["billingFrequency"],
): StripeRecurringInterval | null {
  if (billingFrequency === "one_time") return null;
  if (billingFrequency === "monthly") return { interval: "month", intervalCount: 1 };
  if (billingFrequency === "quarterly") return { interval: "month", intervalCount: 3 };
  return { interval: "year", intervalCount: 1 };
}

/** Customer-displayable product text. Derived only from the sealed row. */
export function clientQuotePaymentProductDescription(
  request: ClientQuotePaymentRequest,
): string {
  return `Quote ${request.quoteNumber} ${PURPOSE_LABEL[request.purpose]}`;
}

export function formBody(entries: ReadonlyArray<readonly [string, string]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) params.append(key, value);
  return params.toString();
}

/**
 * One Price for the frozen amount, currency, product text, and interval.
 * lookup_key is the persisted Price idempotency key. transfer_lookup_key
 * is omitted so an existing key is never moved onto a new Price.
 */
export function buildStripePriceCreateBody(request: ClientQuotePaymentRequest): string {
  const entries: Array<[string, string]> = [
    ["currency", request.currencyCode.toLowerCase()],
    ["lookup_key", request.stripePriceIdempotencyKey],
    ["product_data[name]", clientQuotePaymentProductDescription(request)],
    ["unit_amount", String(request.amountMinor)],
  ];
  const recurring = clientQuotePaymentRecurringInterval(request.billingFrequency);
  if (recurring) {
    entries.push(
      ["recurring[interval]", recurring.interval],
      ["recurring[interval_count]", String(recurring.intervalCount)],
    );
  }
  return formBody(entries);
}

/**
 * One Payment Link for the persisted Price. Quantity is fixed at 1.
 * Completed Checkout Sessions are limited to 1. Hosted confirmation,
 * automatic tax off, promotion codes off. No optional items, trials,
 * Connect fields, inline price_data, or adjustable quantity.
 */
export function buildStripePaymentLinkCreateBody(
  request: ClientQuotePaymentRequest,
): string {
  if (!request.stripePriceId) {
    throw new Error("A Payment Link requires a persisted Stripe Price id.");
  }
  return formBody([
    ["after_completion[type]", "hosted_confirmation"],
    ["allow_promotion_codes", "false"],
    ["automatic_tax[enabled]", "false"],
    ["line_items[0][price]", request.stripePriceId],
    ["line_items[0][quantity]", "1"],
    ["restrictions[completed_sessions][limit]", "1"],
  ]);
}

export function isOfficialStripePaymentLinkUrl(value: string): boolean {
  return STRIPE_PAYMENT_LINK_URL_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value;
}

export function readStripePriceSnapshot(value: unknown): StripePriceSnapshot | null {
  if (!isRecord(value) || value.object !== "price") return null;
  if (typeof value.id !== "string" || !STRIPE_PRICE_ID_PATTERN.test(value.id)) return null;
  if (typeof value.lookup_key !== "string" || value.lookup_key.length < 1) return null;
  if (typeof value.currency !== "string" || !/^[a-z]{3}$/.test(value.currency)) return null;
  const unitAmount = readInteger(value.unit_amount);
  if (unitAmount == null || unitAmount < 0) return null;
  if (typeof value.active !== "boolean") return null;
  const billingScheme =
    value.billing_scheme == null
      ? null
      : typeof value.billing_scheme === "string"
        ? value.billing_scheme
        : null;
  if (value.billing_scheme != null && billingScheme == null) return null;

  let recurring: StripePriceSnapshot["recurring"] = null;
  if (value.recurring != null) {
    if (!isRecord(value.recurring)) return null;
    if (typeof value.recurring.interval !== "string") return null;
    const intervalCount = readInteger(value.recurring.interval_count);
    if (intervalCount == null || intervalCount < 1) return null;
    const trial = value.recurring.trial_period_days;
    if (trial != null && readInteger(trial) == null) return null;
    const usage = value.recurring.usage_type;
    if (usage != null && typeof usage !== "string") return null;
    recurring = {
      interval: value.recurring.interval,
      intervalCount,
      trialPeriodDays: trial == null ? null : readInteger(trial),
      usageType: usage == null ? null : usage,
    };
  }

  return {
    id: value.id,
    lookupKey: value.lookup_key,
    currency: value.currency,
    unitAmount,
    active: value.active,
    billingScheme,
    customUnitAmount: value.custom_unit_amount ?? null,
    transformQuantity: value.transform_quantity ?? null,
    recurring,
  };
}

export function priceMatchesFrozenRequest(
  price: StripePriceSnapshot,
  request: ClientQuotePaymentRequest,
): boolean {
  if (price.lookupKey !== request.stripePriceIdempotencyKey) return false;
  if (!price.active) return false;
  if (price.currency !== request.currencyCode.toLowerCase()) return false;
  if (price.unitAmount !== request.amountMinor) return false;
  if (price.billingScheme != null && price.billingScheme !== "per_unit") return false;
  if (price.customUnitAmount != null) return false;
  if (price.transformQuantity != null) return false;
  const expected = clientQuotePaymentRecurringInterval(request.billingFrequency);
  if (!expected) return price.recurring == null;
  if (!price.recurring) return false;
  if (price.recurring.interval !== expected.interval) return false;
  if (price.recurring.intervalCount !== expected.intervalCount) return false;
  if (price.recurring.trialPeriodDays != null && price.recurring.trialPeriodDays !== 0) {
    return false;
  }
  if (price.recurring.usageType != null && price.recurring.usageType !== "licensed") {
    return false;
  }
  return true;
}

export function readStripePaymentLinkSnapshot(
  value: unknown,
): StripePaymentLinkSnapshot | null {
  if (!isRecord(value) || value.object !== "payment_link") return null;
  if (typeof value.id !== "string" || !STRIPE_PAYMENT_LINK_ID_PATTERN.test(value.id)) {
    return null;
  }
  if (typeof value.url !== "string" || !isOfficialStripePaymentLinkUrl(value.url)) {
    return null;
  }
  return { id: value.id, url: value.url };
}

export function readStripePriceList(
  value: unknown,
): { kind: "prices"; prices: StripePriceSnapshot[] } | { kind: "invalid" } | { kind: "truncated" } {
  if (!isRecord(value) || value.object !== "list" || !Array.isArray(value.data)) {
    return { kind: "invalid" };
  }
  if (value.has_more === true) return { kind: "truncated" };
  const prices: StripePriceSnapshot[] = [];
  for (const entry of value.data) {
    const price = readStripePriceSnapshot(entry);
    if (!price) return { kind: "invalid" };
    prices.push(price);
  }
  if (prices.length > 1) return { kind: "truncated" };
  return { kind: "prices", prices };
}
