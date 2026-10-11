/**
 * CQ-STRIPE-1 Gate 2B — Stripe operation failures.
 * Messages stay free of credentials, Price ids, and Payment Link ids.
 */

export const CLIENT_QUOTE_PAYMENT_STRIPE_ERROR_CODES = [
  "STRIPE_NOT_CONFIGURED",
  "STRIPE_REJECTED",
  "STRIPE_UNCERTAIN",
  "STRIPE_LINK_UNRECOVERABLE",
  "STRIPE_PRICE_UNRECOVERABLE",
  "STRIPE_PRICE_MISMATCH",
] as const;

export type ClientQuotePaymentStripeErrorCode =
  (typeof CLIENT_QUOTE_PAYMENT_STRIPE_ERROR_CODES)[number];

const HTTP_STATUS: Record<ClientQuotePaymentStripeErrorCode, number> = {
  STRIPE_NOT_CONFIGURED: 500,
  STRIPE_REJECTED: 502,
  STRIPE_UNCERTAIN: 503,
  STRIPE_LINK_UNRECOVERABLE: 409,
  STRIPE_PRICE_UNRECOVERABLE: 409,
  STRIPE_PRICE_MISMATCH: 409,
};

const MESSAGE: Record<ClientQuotePaymentStripeErrorCode, string> = {
  STRIPE_NOT_CONFIGURED: "Payment links are not configured.",
  STRIPE_REJECTED: "Stripe rejected the payment link request.",
  STRIPE_UNCERTAIN:
    "The Stripe result is not confirmed. Retry the same payment link request.",
  STRIPE_LINK_UNRECOVERABLE:
    "The payment link could not be recovered without creating a duplicate. Create a new issued quotation.",
  STRIPE_PRICE_UNRECOVERABLE:
    "The Stripe Price could not be recovered for this payment request.",
  STRIPE_PRICE_MISMATCH:
    "The recovered Stripe Price does not match this payment request.",
};

export class ClientQuotePaymentStripeError extends Error {
  readonly code: ClientQuotePaymentStripeErrorCode;
  readonly httpStatus: number;

  constructor(code: ClientQuotePaymentStripeErrorCode) {
    super(MESSAGE[code]);
    this.name = "ClientQuotePaymentStripeError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }
}

export function clientQuotePaymentStripeError(
  code: ClientQuotePaymentStripeErrorCode,
): ClientQuotePaymentStripeError {
  return new ClientQuotePaymentStripeError(code);
}
