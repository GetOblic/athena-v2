/**
 * CQ-STRIPE-1 Gate 2B — create one Price, persist it, then one Payment Link.
 *
 * A new Stripe call is refused after quotation expiry unless a dispatch
 * proof already exists. Price recovery outside the idempotency window uses
 * lookup_key and a strict amount, currency, and interval comparison.
 * Payment Link recovery outside that window fails closed and does not list
 * Payment Links. Idempotency keys always come from the persisted intent.
 */

import type { ClientQuotePaymentRequestStore } from "@/services/clientQuotePayment/clientQuotePaymentStore";
import {
  buildStripePaymentLinkCreateBody,
  buildStripePriceCreateBody,
  priceMatchesFrozenRequest,
  stripeIdempotencyRetryAllowed,
} from "@/services/clientQuotePayment/clientQuotePaymentStripeContract";
import type { ClientQuotePaymentStripeDispatchLedger } from "@/services/clientQuotePayment/clientQuotePaymentStripeDispatch";
import { clientQuotePaymentStripeError } from "@/services/clientQuotePayment/clientQuotePaymentStripeErrors";
import type { ClientQuotePaymentStripeClient } from "@/services/clientQuotePayment/clientQuotePaymentStripeAdapter";
import {
  clientQuotePaymentError,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const MAX_ATTEMPTS = 3;

export type ClientQuotePaymentStripeOperationDeps = {
  store: ClientQuotePaymentRequestStore;
  ledger: ClientQuotePaymentStripeDispatchLedger;
  stripe: ClientQuotePaymentStripeClient;
  quoteExpired: boolean;
  now: () => string;
};

async function persistPrice(
  store: ClientQuotePaymentRequestStore,
  request: ClientQuotePaymentRequest,
  stripePriceId: string,
): Promise<ClientQuotePaymentRequest> {
  return store.recordStripeFulfillment({
    licenseeAccountId: request.licenseeAccountId,
    requestId: request.id,
    stripePriceId,
    stripePaymentLinkId: null,
    stripePaymentLinkUrl: null,
  });
}

async function persistPaymentLink(
  store: ClientQuotePaymentRequestStore,
  request: ClientQuotePaymentRequest,
  link: { id: string; url: string },
): Promise<ClientQuotePaymentRequest> {
  if (!request.stripePriceId) {
    throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  return store.recordStripeFulfillment({
    licenseeAccountId: request.licenseeAccountId,
    requestId: request.id,
    stripePriceId: request.stripePriceId,
    stripePaymentLinkId: link.id,
    stripePaymentLinkUrl: link.url,
  });
}

async function recoverPrice(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
): Promise<ClientQuotePaymentRequest> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const found = await deps.stripe.findPriceByLookupKey(request.stripePriceIdempotencyKey);
    if (found.outcome === "uncertain") continue;
    if (found.outcome === "success") {
      if (!priceMatchesFrozenRequest(found.value, request)) {
        throw clientQuotePaymentStripeError("STRIPE_PRICE_MISMATCH");
      }
      return persistPrice(deps.store, request, found.value.id);
    }
    if (found.outcome === "rejected") throw clientQuotePaymentStripeError("STRIPE_REJECTED");
    throw clientQuotePaymentStripeError("STRIPE_PRICE_UNRECOVERABLE");
  }
  throw clientQuotePaymentStripeError("STRIPE_UNCERTAIN");
}

async function executePrice(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
  proof: { idempotencyKey: string; requestBody: string; dispatchedAt: string },
): Promise<ClientQuotePaymentRequest> {
  if (proof.idempotencyKey !== request.stripePriceIdempotencyKey) {
    throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!stripeIdempotencyRetryAllowed(proof.dispatchedAt, deps.now())) {
      return recoverPrice(deps, request);
    }
    const result = await deps.stripe.createPrice({
      idempotencyKey: proof.idempotencyKey,
      body: proof.requestBody,
    });
    if (result.outcome === "success") {
      if (!priceMatchesFrozenRequest(result.value, request)) {
        throw clientQuotePaymentStripeError("STRIPE_PRICE_MISMATCH");
      }
      if (result.value.lookupKey !== proof.idempotencyKey) {
        throw clientQuotePaymentStripeError("STRIPE_PRICE_MISMATCH");
      }
      return persistPrice(deps.store, request, result.value.id);
    }
    if (result.outcome === "lookup_conflict" || result.outcome === "ambiguous") {
      return recoverPrice(deps, request);
    }
    if (result.outcome === "rejected") throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  if (!stripeIdempotencyRetryAllowed(proof.dispatchedAt, deps.now())) {
    return recoverPrice(deps, request);
  }
  throw clientQuotePaymentStripeError("STRIPE_UNCERTAIN");
}

async function executePaymentLink(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
  proof: { idempotencyKey: string; requestBody: string; dispatchedAt: string },
): Promise<ClientQuotePaymentRequest> {
  if (!request.stripePriceId || proof.idempotencyKey !== request.stripePaymentLinkIdempotencyKey) {
    throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  if (!proof.requestBody.includes(request.stripePriceId)) {
    throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!stripeIdempotencyRetryAllowed(proof.dispatchedAt, deps.now())) {
      throw clientQuotePaymentStripeError("STRIPE_LINK_UNRECOVERABLE");
    }
    const result = await deps.stripe.createPaymentLink({
      idempotencyKey: proof.idempotencyKey,
      body: proof.requestBody,
    });
    if (result.outcome === "success") return persistPaymentLink(deps.store, request, result.value);
    if (result.outcome === "rejected") throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  if (!stripeIdempotencyRetryAllowed(proof.dispatchedAt, deps.now())) {
    throw clientQuotePaymentStripeError("STRIPE_LINK_UNRECOVERABLE");
  }
  throw clientQuotePaymentStripeError("STRIPE_UNCERTAIN");
}

async function ensurePrice(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
): Promise<ClientQuotePaymentRequest> {
  if (request.stripePriceId) return request;
  const existing = await deps.ledger.get({
    licenseeAccountId: request.licenseeAccountId,
    paymentRequestId: request.id,
    kind: "price",
  });
  if (!existing) {
    if (deps.quoteExpired) {
      throw clientQuotePaymentError(
        "QUOTE_EXPIRED",
        "This quotation has expired. A new payment request cannot be started.",
      );
    }
    deps.stripe.assertConfigured();
    const proof = await deps.ledger.record({
      licenseeAccountId: request.licenseeAccountId,
      paymentRequestId: request.id,
      kind: "price",
      idempotencyKey: request.stripePriceIdempotencyKey,
      requestBody: buildStripePriceCreateBody(request),
      dispatchedAt: deps.now(),
    });
    return executePrice(deps, request, proof);
  }
  deps.stripe.assertConfigured();
  return executePrice(deps, request, existing);
}

async function ensurePaymentLink(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
): Promise<ClientQuotePaymentRequest> {
  if (request.stripePaymentLinkId && request.stripePaymentLinkUrl) return request;
  if (!request.stripePriceId) throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  const existing = await deps.ledger.get({
    licenseeAccountId: request.licenseeAccountId,
    paymentRequestId: request.id,
    kind: "payment_link",
  });
  if (!existing) {
    if (deps.quoteExpired) {
      throw clientQuotePaymentError(
        "QUOTE_EXPIRED",
        "This quotation has expired. A new payment request cannot be started.",
      );
    }
    deps.stripe.assertConfigured();
    const proof = await deps.ledger.record({
      licenseeAccountId: request.licenseeAccountId,
      paymentRequestId: request.id,
      kind: "payment_link",
      idempotencyKey: request.stripePaymentLinkIdempotencyKey,
      requestBody: buildStripePaymentLinkCreateBody(request),
      dispatchedAt: deps.now(),
    });
    return executePaymentLink(deps, request, proof);
  }
  deps.stripe.assertConfigured();
  return executePaymentLink(deps, request, existing);
}

export async function fulfillClientQuotePaymentRequest(
  deps: ClientQuotePaymentStripeOperationDeps,
  request: ClientQuotePaymentRequest,
): Promise<ClientQuotePaymentRequest> {
  const priced = await ensurePrice(deps, request);
  return ensurePaymentLink(deps, priced);
}
