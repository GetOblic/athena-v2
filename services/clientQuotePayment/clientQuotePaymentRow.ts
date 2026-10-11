/**
 * Maps athena_client_quote_payment_requests rows.
 * No Supabase client.
 */

import {
  STRIPE_PAYMENT_LINK_ID_PATTERN,
  STRIPE_PAYMENT_LINK_URL_PATTERN,
  STRIPE_PRICE_ID_PATTERN,
} from "@/services/clientQuotePayment/clientQuotePaymentFulfillment";
import {
  CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION,
  CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT,
  clientQuotePaymentError,
  isClientQuotePaymentPurpose,
  type ClientQuotePaymentAmountSource,
  type ClientQuotePaymentRequest,
  type ClientQuotePaymentRequestParameters,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_KEY_PATTERN = /^cqpr_price_v1_[0-9a-f]{64}$/;
const LINK_KEY_PATTERN = /^cqpr_link_v1_[0-9a-f]{64}$/;

function fail(): never {
  throw clientQuotePaymentError(
    "PERSISTENCE_FAILED",
    "Could not read the payment request.",
  );
}

function asUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) fail();
  return value.trim().toLowerCase();
}

function asOptionalUuid(value: unknown): string | null {
  if (value == null) return null;
  return asUuid(value);
}

function asTimestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string") fail();
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) fail();
  return new Date(parsed).toISOString();
}

function asMinor(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value.replace(/^0+(?=\d)/, "")) {
      return parsed;
    }
  }
  fail();
}

function asOptionalMinor(value: unknown): number | null {
  if (value == null) return null;
  return asMinor(value);
}

function asOptionalMatch(value: unknown, pattern: RegExp): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !pattern.test(value)) fail();
  return value;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      fail();
    }
    fail();
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  fail();
}

function readParameters(value: unknown): ClientQuotePaymentRequestParameters {
  const record = asJsonObject(value);
  if (record.schemaVersion !== CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION) fail();
  if (record.settlementAccount !== CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT) fail();
  if (!isClientQuotePaymentPurpose(record.purpose)) fail();
  const billingFrequency = record.billingFrequency;
  if (
    billingFrequency !== "one_time" &&
    billingFrequency !== "monthly" &&
    billingFrequency !== "quarterly" &&
    billingFrequency !== "annually"
  ) {
    fail();
  }
  if (record.currencyCode !== "USD" && record.currencyCode !== "EUR") fail();
  if (record.currencyScale !== 2) fail();
  const amountSource = record.amountSource;
  if (amountSource !== "frequency_totals" && amountSource !== "legacy_one_time_totals") {
    fail();
  }
  const mode = record.oneTimeCollectionMode;
  if (mode !== null && mode !== "full" && mode !== "split") fail();
  if (typeof record.quoteNumber !== "string" || record.quoteNumber.length < 1) fail();
  return {
    schemaVersion: CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION,
    settlementAccount: CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT,
    licenseeAccountId: asUuid(record.licenseeAccountId),
    organizationId: asUuid(record.organizationId),
    sourceQuoteId: asUuid(record.sourceQuoteId),
    quoteNumber: record.quoteNumber,
    quoteIssuedAt: asTimestamp(record.quoteIssuedAt),
    purpose: record.purpose,
    billingFrequency,
    currencyCode: record.currencyCode,
    currencyScale: 2,
    amountMinor: asMinor(record.amountMinor),
    amountSource,
    oneTimeCollectionMode: mode,
    oneTimeTotalMinor: asOptionalMinor(record.oneTimeTotalMinor),
    depositMinor: asOptionalMinor(record.depositMinor),
    balanceMinor: asOptionalMinor(record.balanceMinor),
  };
}

export function mapClientQuotePaymentRequestRow(
  row: Record<string, unknown>,
): ClientQuotePaymentRequest {
  const parameters = readParameters(row.request_parameters);
  const purpose = row.purpose;
  if (purpose !== parameters.purpose) fail();
  const priceKey = row.stripe_price_idempotency_key;
  const linkKey = row.stripe_payment_link_idempotency_key;
  if (typeof priceKey !== "string" || !PRICE_KEY_PATTERN.test(priceKey)) fail();
  if (typeof linkKey !== "string" || !LINK_KEY_PATTERN.test(linkKey)) fail();
  if (priceKey === linkKey) fail();
  const currencyCode = row.currency_code;
  if (currencyCode !== parameters.currencyCode) fail();
  const amountSource = row.amount_source;
  if (amountSource !== parameters.amountSource) fail();
  const amountSourceTyped = amountSource as ClientQuotePaymentAmountSource;
  if (asMinor(row.amount_minor) !== parameters.amountMinor) fail();
  if (asUuid(row.licensee_account_id) !== parameters.licenseeAccountId) fail();
  if (asUuid(row.organization_id) !== parameters.organizationId) fail();
  if (asUuid(row.source_quote_id) !== parameters.sourceQuoteId) fail();
  if (row.billing_frequency !== parameters.billingFrequency) fail();
  if (row.quote_number !== parameters.quoteNumber) fail();
  if (row.currency_scale !== 2 && row.currency_scale !== "2") fail();
  if (row.settlement_account !== CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT) fail();
  const stripePriceId = asOptionalMatch(row.stripe_price_id, STRIPE_PRICE_ID_PATTERN);
  const stripePaymentLinkId = asOptionalMatch(
    row.stripe_payment_link_id,
    STRIPE_PAYMENT_LINK_ID_PATTERN,
  );
  const stripePaymentLinkUrl = asOptionalMatch(
    row.stripe_payment_link_url,
    STRIPE_PAYMENT_LINK_URL_PATTERN,
  );
  if ((stripePaymentLinkId == null) !== (stripePaymentLinkUrl == null)) fail();
  if (stripePaymentLinkId != null && stripePriceId == null) fail();

  return {
    id: asUuid(row.id),
    licenseeAccountId: parameters.licenseeAccountId,
    organizationId: parameters.organizationId,
    requestedBy: asOptionalUuid(row.requested_by),
    sourceQuoteId: parameters.sourceQuoteId,
    purpose: parameters.purpose,
    billingFrequency: parameters.billingFrequency,
    currencyCode: parameters.currencyCode,
    currencyScale: 2,
    amountMinor: parameters.amountMinor,
    amountSource: amountSourceTyped,
    oneTimeCollectionMode: parameters.oneTimeCollectionMode,
    oneTimeTotalMinor: parameters.oneTimeTotalMinor,
    depositMinor: parameters.depositMinor,
    balanceMinor: parameters.balanceMinor,
    quoteNumber: parameters.quoteNumber,
    quoteIssuedAt: parameters.quoteIssuedAt,
    settlementAccount: CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT,
    requestParameters: parameters,
    stripePriceIdempotencyKey: priceKey,
    stripePaymentLinkIdempotencyKey: linkKey,
    stripePriceId,
    stripePaymentLinkId,
    stripePaymentLinkUrl,
    createdAt: asTimestamp(row.created_at),
  };
}
