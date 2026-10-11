/**
 * CQ-STRIPE-1 Gate 2C — payment-link error copy.
 * Licensee catalog text only. Server messages are not shown.
 */

import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import type { ClientQuotePaymentLinkPurpose } from "@/lib/licensee/clientQuotePaymentLinksModel";

const PAYMENT_ERROR_KEYS = {
  UNAUTHORIZED: "unauthorized",
  LICENSEE_ACCESS_DENIED: "forbidden",
  NOT_FOUND: "notFound",
  INVALID_JSON: "validation",
  INVALID_BODY: "validation",
  QUOTE_NOT_ISSUED: "notIssued",
  QUOTE_MASKED: "masked",
  SNAPSHOT_UNUSABLE: "snapshot",
  CURRENCY_NOT_SUPPORTED: "currency",
  VALIDITY_UNREADABLE: "validity",
  QUOTE_EXPIRED: "expired",
  FREQUENCY_NOT_CHARGEABLE: "frequency",
  DEPOSIT_BELOW_MINIMUM: "depositMinimum",
  BALANCE_BELOW_MINIMUM: "balanceMinimum",
  COLLECTION_CONFLICT: "conflict",
  DUPLICATE_PURPOSE: "duplicate",
  PAIR_INCOMPLETE: "pair",
  AMOUNT_REJECTED: "amount",
  FULFILLMENT_REJECTED: "fulfillment",
  PERSISTENCE_FAILED: "persistence",
  STRIPE_NOT_CONFIGURED: "notConfigured",
  STRIPE_REJECTED: "rejected",
  STRIPE_UNCERTAIN: "uncertain",
  STRIPE_LINK_UNRECOVERABLE: "linkUnrecoverable",
  STRIPE_PRICE_UNRECOVERABLE: "priceUnrecoverable",
  STRIPE_PRICE_MISMATCH: "priceMismatch",
  PAYMENT_LINK_FAILED: "generic",
} as const satisfies Record<
  string,
  keyof LicenseeMessages["clientQuotes"]["payments"]["errors"]
>;

export function clientQuotePaymentLinkErrorMessage(
  messages: LicenseeMessages,
  code: string | null | undefined,
): string {
  const errors = messages.clientQuotes.payments.errors;
  if (code && code in PAYMENT_ERROR_KEYS) {
    return errors[PAYMENT_ERROR_KEYS[code as keyof typeof PAYMENT_ERROR_KEYS]];
  }
  return errors.generic;
}

export function clientQuotePaymentPurposeLabel(
  messages: LicenseeMessages,
  purpose: ClientQuotePaymentLinkPurpose,
): string {
  const copy = messages.clientQuotes.payments;
  switch (purpose) {
    case "one_time_full":
      return copy.purposeFull;
    case "one_time_deposit":
      return copy.purposeDeposit;
    case "one_time_balance":
      return copy.purposeBalance;
    case "monthly":
      return copy.purposeMonthly;
    case "quarterly":
      return copy.purposeQuarterly;
    case "annually":
      return copy.purposeAnnually;
  }
}
