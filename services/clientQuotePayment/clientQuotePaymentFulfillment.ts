/**
 * CQ-STRIPE-1 Gate 2A-R — write-once Stripe Price and Payment Link identifiers.
 * Pure transition. No Stripe SDK and no Supabase client.
 *
 * Commercial amount, currency, purpose, source quote, request parameters,
 * and idempotency keys are copied through unchanged. Null arguments leave
 * the stored identifier in place. An established identifier cannot be
 * replaced or cleared. Payment Link id and URL are one pair and require a
 * Price id. Quotation expiry is not consulted: this does not create an intent.
 */

import {
  clientQuotePaymentError,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,80}$/;
export const STRIPE_PAYMENT_LINK_ID_PATTERN = /^plink_[A-Za-z0-9]{8,80}$/;
export const STRIPE_PAYMENT_LINK_URL_PATTERN =
  /^https:\/\/buy\.stripe\.com\/(?:test_)?[A-Za-z0-9]{8,80}$/;

export type ClientQuotePaymentStripeFulfillmentInput = {
  licenseeAccountId: string;
  requestId: string;
  stripePriceId: string | null;
  stripePaymentLinkId: string | null;
  stripePaymentLinkUrl: string | null;
};

function reject(message: string): never {
  throw clientQuotePaymentError("FULFILLMENT_REJECTED", message);
}

function confirmOptional(
  current: string | null,
  incoming: string | null,
  pattern: RegExp,
  label: string,
): string | null {
  if (incoming == null) return current;
  if (!pattern.test(incoming)) reject(`The ${label} is not usable.`);
  if (current != null && current !== incoming) {
    reject(`An established ${label} cannot be replaced.`);
  }
  return incoming;
}

/**
 * Returns the row with Stripe identifiers filled. Does not mutate `current`.
 */
export function applyClientQuotePaymentStripeFulfillment(
  current: ClientQuotePaymentRequest,
  input: ClientQuotePaymentStripeFulfillmentInput,
): ClientQuotePaymentRequest {
  if (current.id !== input.requestId || current.licenseeAccountId !== input.licenseeAccountId) {
    throw clientQuotePaymentError(
      "NOT_FOUND",
      "Payment request was not found for this Licensee.",
    );
  }

  const priceArg = input.stripePriceId;
  const linkIdArg = input.stripePaymentLinkId;
  const linkUrlArg = input.stripePaymentLinkUrl;
  if (priceArg == null && linkIdArg == null && linkUrlArg == null) {
    reject("A Stripe Price or Payment Link identifier is required.");
  }
  if ((linkIdArg == null) !== (linkUrlArg == null)) {
    reject("Payment Link id and URL must be recorded together.");
  }

  const stripePriceId = confirmOptional(
    current.stripePriceId,
    priceArg,
    STRIPE_PRICE_ID_PATTERN,
    "Stripe Price id",
  );
  const stripePaymentLinkId = confirmOptional(
    current.stripePaymentLinkId,
    linkIdArg,
    STRIPE_PAYMENT_LINK_ID_PATTERN,
    "Stripe Payment Link id",
  );
  const stripePaymentLinkUrl = confirmOptional(
    current.stripePaymentLinkUrl,
    linkUrlArg,
    STRIPE_PAYMENT_LINK_URL_PATTERN,
    "Stripe Payment Link URL",
  );

  if ((stripePaymentLinkId == null) !== (stripePaymentLinkUrl == null)) {
    reject("Payment Link id and URL must be recorded together.");
  }
  if (stripePaymentLinkId != null && stripePriceId == null) {
    reject("A Payment Link requires a recorded Stripe Price id.");
  }

  return {
    ...current,
    requestParameters: structuredClone(current.requestParameters),
    stripePriceId,
    stripePaymentLinkId,
    stripePaymentLinkUrl,
  };
}
