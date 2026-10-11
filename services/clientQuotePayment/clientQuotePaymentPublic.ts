/**
 * CQ-STRIPE-1 Gate 2B — licensee payment-link response.
 * Omits idempotency keys, Stripe Price ids, and the central account secret.
 */

import type {
  ClientQuotePaymentPurpose,
  ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const PURPOSE_ORDER: Record<ClientQuotePaymentPurpose, number> = {
  one_time_full: 0,
  one_time_deposit: 1,
  one_time_balance: 2,
  monthly: 3,
  quarterly: 4,
  annually: 5,
};

export type PublicClientQuotePaymentRequest = {
  id: string;
  purpose: ClientQuotePaymentRequest["purpose"];
  billingFrequency: ClientQuotePaymentRequest["billingFrequency"];
  currencyCode: ClientQuotePaymentRequest["currencyCode"];
  currencyScale: 2;
  amountMinor: number;
  amountSource: ClientQuotePaymentRequest["amountSource"];
  oneTimeCollectionMode: ClientQuotePaymentRequest["oneTimeCollectionMode"];
  oneTimeTotalMinor: number | null;
  depositMinor: number | null;
  balanceMinor: number | null;
  quoteNumber: string;
  paymentLinkUrl: string | null;
};

export function sortClientQuotePaymentRequests(
  rows: readonly ClientQuotePaymentRequest[],
): ClientQuotePaymentRequest[] {
  return [...rows].sort(
    (left, right) => PURPOSE_ORDER[left.purpose] - PURPOSE_ORDER[right.purpose],
  );
}

export function toPublicClientQuotePaymentRequest(
  request: ClientQuotePaymentRequest,
): PublicClientQuotePaymentRequest {
  return {
    id: request.id,
    purpose: request.purpose,
    billingFrequency: request.billingFrequency,
    currencyCode: request.currencyCode,
    currencyScale: 2,
    amountMinor: request.amountMinor,
    amountSource: request.amountSource,
    oneTimeCollectionMode: request.oneTimeCollectionMode,
    oneTimeTotalMinor: request.oneTimeTotalMinor,
    depositMinor: request.depositMinor,
    balanceMinor: request.balanceMinor,
    quoteNumber: request.quoteNumber,
    paymentLinkUrl: request.stripePaymentLinkUrl,
  };
}
