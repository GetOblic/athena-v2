/**
 * CQ-STRIPE-1 Gate 2A — create and read payment-request intents.
 * Amounts are planned from the issued snapshot before the store commits.
 * This module does not call Stripe and does not open a Supabase client.
 */

import { planClientQuotePaymentRequestIntents, toClientQuotePaymentQuote } from "@/services/clientQuotePayment/clientQuotePaymentDomain";
import {
  clientQuotePaymentError,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";
import type { ClientQuotePaymentRequestStore } from "@/services/clientQuotePayment/clientQuotePaymentStore";

export async function createClientQuotePaymentRequestIntents(
  store: ClientQuotePaymentRequestStore,
  input: {
    licenseeAccountId: string;
    sourceQuoteId: string;
    requestedBy: string | null;
    now: string;
    decision: ClientQuotePaymentDecision;
  },
): Promise<ClientQuotePaymentRequest[]> {
  const quote = await store.getOwnedQuote(input.sourceQuoteId, input.licenseeAccountId);
  if (
    !quote ||
    quote.id !== input.sourceQuoteId ||
    quote.licensee_account_id !== input.licenseeAccountId
  ) {
    throw clientQuotePaymentError(
      "NOT_FOUND",
      "Client quote was not found for this Licensee.",
    );
  }
  const intents = planClientQuotePaymentRequestIntents(toClientQuotePaymentQuote(quote), {
    now: input.now,
    decision: input.decision,
  });
  return store.commitPaymentRequestIntents({
    licenseeAccountId: input.licenseeAccountId,
    sourceQuoteId: input.sourceQuoteId,
    requestedBy: input.requestedBy,
    now: input.now,
    decision: input.decision,
    intents,
  });
}

export function listClientQuotePaymentRequests(
  store: ClientQuotePaymentRequestStore,
  licenseeAccountId: string,
  sourceQuoteId: string,
): Promise<ClientQuotePaymentRequest[]> {
  return store.listPaymentRequests(sourceQuoteId, licenseeAccountId);
}

export function getClientQuotePaymentRequest(
  store: ClientQuotePaymentRequestStore,
  licenseeAccountId: string,
  id: string,
): Promise<ClientQuotePaymentRequest | null> {
  return store.getPaymentRequest(id, licenseeAccountId);
}

export function recordClientQuotePaymentStripeFulfillment(
  store: ClientQuotePaymentRequestStore,
  input: {
    licenseeAccountId: string;
    requestId: string;
    stripePriceId: string | null;
    stripePaymentLinkId: string | null;
    stripePaymentLinkUrl: string | null;
  },
): Promise<ClientQuotePaymentRequest> {
  return store.recordStripeFulfillment(input);
}
