/**
 * CQ-STRIPE-1 Gate 2A — payment-link intent contracts.
 * Pure types only. No Stripe SDK, HTTP route, or Supabase client.
 *
 * A row is a request to collect a frozen quote amount through the central
 * GetOblic Stripe account. It is not a payment, a Stripe object, or an invoice.
 * Stripe status is not represented and is not payment status.
 */

export const CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION =
  "client_quote_payment_request_v1" as const;

/** Central GetOblic settlement. Licensee connected accounts are out of scope. */
export const CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT = "getoblic_central" as const;

/**
 * Minimum minor-unit amount for every chargeable V1 purpose:
 * full, deposit, balance, monthly, quarterly, and annually.
 * USD and EUR use scale 2, so this is 0.50 in major units.
 *
 * Settlement-currency activation caveat: this is the charge-currency floor
 * for USD or EUR when that currency is activated on the central GetOblic
 * Stripe account. This gate does not convert an unactivated presentment
 * currency into the account settlement currency, and it does not lower or
 * raise the floor to anticipate a post-conversion minimum.
 */
export const CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR = 50 as const;

export const CLIENT_QUOTE_PAYMENT_PURPOSES = [
  "one_time_full",
  "one_time_deposit",
  "one_time_balance",
  "monthly",
  "quarterly",
  "annually",
] as const;

export type ClientQuotePaymentPurpose =
  (typeof CLIENT_QUOTE_PAYMENT_PURPOSES)[number];

export const CLIENT_QUOTE_PAYMENT_RECURRING_PURPOSES = [
  "monthly",
  "quarterly",
  "annually",
] as const;

export type ClientQuotePaymentRecurringPurpose =
  (typeof CLIENT_QUOTE_PAYMENT_RECURRING_PURPOSES)[number];

export const CLIENT_QUOTE_PAYMENT_AMOUNT_SOURCES = [
  "frequency_totals",
  "legacy_one_time_totals",
] as const;

export type ClientQuotePaymentAmountSource =
  (typeof CLIENT_QUOTE_PAYMENT_AMOUNT_SOURCES)[number];

export const CLIENT_QUOTE_PAYMENT_SQL_ERRORS = {
  ineligible: "client_quote_payment_quote_ineligible",
  validity: "client_quote_payment_validity_unreadable",
  expired: "client_quote_payment_quote_expired",
  amount: "client_quote_payment_amount_rejected",
  conflict: "client_quote_payment_collection_conflict",
  duplicate: "client_quote_payment_request_duplicate",
  pair: "client_quote_payment_pair_incomplete",
  immutable: "client_quote_payment_request_immutable",
  notFound: "client_quote_payment_request_not_found",
  fulfillment: "client_quote_payment_stripe_fulfillment_rejected",
} as const;

export const CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC =
  "create_client_quote_payment_request_intents" as const;

export const RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC =
  "record_client_quote_payment_request_stripe_fulfillment" as const;

export const CLIENT_QUOTE_PAYMENT_ERROR_CODES = [
  "NOT_FOUND",
  "QUOTE_NOT_ISSUED",
  "QUOTE_MASKED",
  "SNAPSHOT_UNUSABLE",
  "CURRENCY_NOT_SUPPORTED",
  "VALIDITY_UNREADABLE",
  "QUOTE_EXPIRED",
  "FREQUENCY_NOT_CHARGEABLE",
  "DEPOSIT_BELOW_MINIMUM",
  "BALANCE_BELOW_MINIMUM",
  "COLLECTION_CONFLICT",
  "DUPLICATE_PURPOSE",
  "PAIR_INCOMPLETE",
  "AMOUNT_REJECTED",
  "FULFILLMENT_REJECTED",
  "PERSISTENCE_FAILED",
] as const;

export type ClientQuotePaymentErrorCode =
  (typeof CLIENT_QUOTE_PAYMENT_ERROR_CODES)[number];

const HTTP_STATUS: Record<ClientQuotePaymentErrorCode, number> = {
  NOT_FOUND: 404,
  QUOTE_NOT_ISSUED: 409,
  QUOTE_MASKED: 409,
  SNAPSHOT_UNUSABLE: 409,
  CURRENCY_NOT_SUPPORTED: 409,
  VALIDITY_UNREADABLE: 409,
  QUOTE_EXPIRED: 409,
  FREQUENCY_NOT_CHARGEABLE: 409,
  DEPOSIT_BELOW_MINIMUM: 400,
  BALANCE_BELOW_MINIMUM: 400,
  COLLECTION_CONFLICT: 409,
  DUPLICATE_PURPOSE: 409,
  PAIR_INCOMPLETE: 409,
  AMOUNT_REJECTED: 409,
  FULFILLMENT_REJECTED: 409,
  PERSISTENCE_FAILED: 500,
};

export class ClientQuotePaymentRequestError extends Error {
  readonly code: ClientQuotePaymentErrorCode;
  readonly httpStatus: number;

  constructor(code: ClientQuotePaymentErrorCode, message: string) {
    super(message);
    this.name = "ClientQuotePaymentRequestError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }
}

export function clientQuotePaymentError(
  code: ClientQuotePaymentErrorCode,
  message: string,
): ClientQuotePaymentRequestError {
  return new ClientQuotePaymentRequestError(code, message);
}

/**
 * Quote fields the payment domain is allowed to read.
 * draft_json is intentionally absent: issued_snapshot is the amount authority.
 */
export type ClientQuotePaymentQuote = {
  id: string;
  licenseeAccountId: string;
  organizationId: string;
  status: string;
  deletedAt: string | null;
  currencyCode: string;
  quoteNumber: string | null;
  issuedAt: string | null;
  issuedSnapshot: unknown;
};

export type ClientQuotePaymentDecision =
  | { kind: "one_time_full" }
  | { kind: "one_time_split"; depositMinor: number }
  | { kind: "recurring"; billingFrequency: ClientQuotePaymentRecurringPurpose };

export type OneTimeCollectionConfiguration =
  | {
      mode: "full";
      oneTimeTotalMinor: number;
      amountMinor: number;
    }
  | {
      mode: "split";
      oneTimeTotalMinor: number;
      depositMinor: number;
      balanceMinor: number;
    };

export type ChargeableFrequencyGroup = {
  billingFrequency: "one_time" | "monthly" | "quarterly" | "annually";
  amountMinor: number;
  amountSource: ClientQuotePaymentAmountSource;
};

/**
 * Immutable commercial parameters. Stripe Price and Payment Link idempotency
 * keys are derived from this object and stored beside it, not inside it.
 */
export type ClientQuotePaymentRequestParameters = {
  schemaVersion: typeof CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION;
  settlementAccount: typeof CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT;
  licenseeAccountId: string;
  organizationId: string;
  sourceQuoteId: string;
  quoteNumber: string;
  quoteIssuedAt: string;
  purpose: ClientQuotePaymentPurpose;
  billingFrequency: "one_time" | "monthly" | "quarterly" | "annually";
  currencyCode: "USD" | "EUR";
  currencyScale: 2;
  amountMinor: number;
  amountSource: ClientQuotePaymentAmountSource;
  oneTimeCollectionMode: "full" | "split" | null;
  oneTimeTotalMinor: number | null;
  depositMinor: number | null;
  balanceMinor: number | null;
};

export type ClientQuotePaymentRequestInsert = {
  requestParameters: ClientQuotePaymentRequestParameters;
  stripePriceIdempotencyKey: string;
  stripePaymentLinkIdempotencyKey: string;
};

export type ClientQuotePaymentRequest = {
  id: string;
  licenseeAccountId: string;
  organizationId: string;
  requestedBy: string | null;
  sourceQuoteId: string;
  purpose: ClientQuotePaymentPurpose;
  billingFrequency: ClientQuotePaymentRequestParameters["billingFrequency"];
  currencyCode: "USD" | "EUR";
  currencyScale: 2;
  amountMinor: number;
  amountSource: ClientQuotePaymentAmountSource;
  oneTimeCollectionMode: "full" | "split" | null;
  oneTimeTotalMinor: number | null;
  depositMinor: number | null;
  balanceMinor: number | null;
  quoteNumber: string;
  quoteIssuedAt: string;
  settlementAccount: typeof CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT;
  requestParameters: ClientQuotePaymentRequestParameters;
  stripePriceIdempotencyKey: string;
  stripePaymentLinkIdempotencyKey: string;
  /** Null until the Price is recorded. Write-once after that. */
  stripePriceId: string | null;
  /** Null until the Payment Link is recorded. Write-once, with the URL. */
  stripePaymentLinkId: string | null;
  stripePaymentLinkUrl: string | null;
  createdAt: string;
};

export function isClientQuotePaymentPurpose(
  value: unknown,
): value is ClientQuotePaymentPurpose {
  return (
    typeof value === "string" &&
    (CLIENT_QUOTE_PAYMENT_PURPOSES as readonly string[]).includes(value)
  );
}
