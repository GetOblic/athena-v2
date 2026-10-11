/**
 * CQ-STRIPE-1 Gate 2B — authenticated payment-link reads and creates.
 * Amounts come from the issued snapshot. The browser decision selects
 * full, split, or one recurring frequency. It does not set the charge.
 */

import type { AthenaClientQuote } from "@/services/clientQuote/clientQuoteTypes";
import {
  canonicalJson,
  planClientQuotePaymentRequestIntents,
  toClientQuotePaymentQuote,
} from "@/services/clientQuotePayment/clientQuotePaymentDomain";
import {
  clientQuotePaymentQuoteExpired,
  readClientQuotePaymentEligibility,
  type ClientQuotePaymentEligibility,
} from "@/services/clientQuotePayment/clientQuotePaymentEligibility";
import type { ClientQuotePaymentHttpFailure } from "@/services/clientQuotePayment/clientQuotePaymentHttp";
import {
  sortClientQuotePaymentRequests,
  toPublicClientQuotePaymentRequest,
  type PublicClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentPublic";
import {
  createClientQuotePaymentRequestIntents,
  listClientQuotePaymentRequests,
} from "@/services/clientQuotePayment/clientQuotePaymentService";
import type { ClientQuotePaymentRequestStore } from "@/services/clientQuotePayment/clientQuotePaymentStore";
import type { ClientQuotePaymentStripeClient } from "@/services/clientQuotePayment/clientQuotePaymentStripeAdapter";
import type { ClientQuotePaymentStripeDispatchLedger } from "@/services/clientQuotePayment/clientQuotePaymentStripeDispatch";
import { ClientQuotePaymentStripeError } from "@/services/clientQuotePayment/clientQuotePaymentStripeErrors";
import { fulfillClientQuotePaymentRequest } from "@/services/clientQuotePayment/clientQuotePaymentStripeOperations";
import {
  ClientQuotePaymentRequestError,
  clientQuotePaymentError,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentPurpose,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClientQuotePaymentMaster = { id: string };

export type ClientQuotePaymentLinkDeps = {
  requireMaster: (userId: string) => Promise<ClientQuotePaymentMaster>;
  store: ClientQuotePaymentRequestStore;
  ledger: ClientQuotePaymentStripeDispatchLedger;
  stripe: ClientQuotePaymentStripeClient;
  now: () => string;
};

export type ClientQuotePaymentLinkPayload = {
  ok: true;
  paymentRequests: PublicClientQuotePaymentRequest[];
  eligibility: ClientQuotePaymentEligibility;
};

export type ClientQuotePaymentLinkResult = {
  status: number;
  payload: ClientQuotePaymentLinkPayload | { ok: false; error: { code: string; message: string } };
};

function failure(status: number, code: string, message: string): ClientQuotePaymentLinkResult {
  return { status, payload: { ok: false, error: { code, message } } };
}

export function clientQuotePaymentLinkFailure(error: unknown): ClientQuotePaymentHttpFailure {
  if (error instanceof ClientQuotePaymentRequestError || error instanceof ClientQuotePaymentStripeError) {
    return { status: error.httpStatus, code: error.code, message: error.message };
  }
  if (error instanceof Error && error.name === "LicenseeAccessError") {
    return { status: 403, code: "LICENSEE_ACCESS_DENIED", message: error.message };
  }
  console.error("[CLIENT_QUOTE_PAYMENT] request_failed");
  return {
    status: 500,
    code: "PAYMENT_LINK_FAILED",
    message: "Could not complete the payment link request.",
  };
}

function purposesFor(decision: ClientQuotePaymentDecision): ClientQuotePaymentPurpose[] {
  if (decision.kind === "one_time_full") return ["one_time_full"];
  if (decision.kind === "one_time_split") return ["one_time_deposit", "one_time_balance"];
  return [decision.billingFrequency];
}

function sameIntent(row: ClientQuotePaymentRequest, planned: {
  requestParameters: ClientQuotePaymentRequest["requestParameters"];
  stripePriceIdempotencyKey: string;
  stripePaymentLinkIdempotencyKey: string;
}): boolean {
  return (
    canonicalJson(row.requestParameters) === canonicalJson(planned.requestParameters) &&
    row.stripePriceIdempotencyKey === planned.stripePriceIdempotencyKey &&
    row.stripePaymentLinkIdempotencyKey === planned.stripePaymentLinkIdempotencyKey
  );
}

async function ownedQuote(
  deps: ClientQuotePaymentLinkDeps,
  masterUserId: string,
  quoteId: string,
): Promise<{ master: ClientQuotePaymentMaster; quote: AthenaClientQuote }> {
  const master = await deps.requireMaster(masterUserId);
  if (!master?.id) {
    throw clientQuotePaymentError("NOT_FOUND", "Client quote was not found for this Licensee.");
  }
  const quote = await deps.store.getOwnedQuote(quoteId, master.id);
  if (!quote || quote.id !== quoteId || quote.licensee_account_id !== master.id) {
    throw clientQuotePaymentError("NOT_FOUND", "Client quote was not found for this Licensee.");
  }
  return { master, quote };
}

async function publicPayload(
  deps: ClientQuotePaymentLinkDeps,
  quote: AthenaClientQuote,
  licenseeAccountId: string,
  now: string,
): Promise<ClientQuotePaymentLinkPayload> {
  const requests = (
    await listClientQuotePaymentRequests(deps.store, licenseeAccountId, quote.id)
  ).filter(
    (row) => row.licenseeAccountId === licenseeAccountId && row.sourceQuoteId === quote.id,
  );
  const view = toClientQuotePaymentQuote(quote);
  return {
    ok: true,
    paymentRequests: sortClientQuotePaymentRequests(requests).map(toPublicClientQuotePaymentRequest),
    eligibility: readClientQuotePaymentEligibility(view, requests, now),
  };
}

export async function getClientQuotePaymentLinksForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuotePaymentLinkDeps;
}): Promise<ClientQuotePaymentLinkPayload> {
  const now = input.deps.now();
  const { quote, master } = await ownedQuote(input.deps, input.masterUserId, input.quoteId);
  return publicPayload(input.deps, quote, master.id, now);
}

async function resolveIntents(input: {
  deps: ClientQuotePaymentLinkDeps;
  licenseeAccountId: string;
  masterUserId: string;
  quoteId: string;
  quote: AthenaClientQuote;
  decision: ClientQuotePaymentDecision;
  now: string;
  expired: boolean;
}): Promise<ClientQuotePaymentRequest[]> {
  const purposes = purposesFor(input.decision);
  const existing = (
    await listClientQuotePaymentRequests(input.deps.store, input.licenseeAccountId, input.quoteId)
  ).filter((row) => purposes.includes(row.purpose));
  if (input.expired) {
    if (existing.length !== purposes.length) {
      throw clientQuotePaymentError(
        "QUOTE_EXPIRED",
        "This quotation has expired. A new payment request cannot be started.",
      );
    }
    if (input.decision.kind === "one_time_split") {
      const deposit = existing.find((row) => row.purpose === "one_time_deposit");
      if (!deposit || deposit.depositMinor !== input.decision.depositMinor) {
        throw clientQuotePaymentError(
          "AMOUNT_REJECTED",
          "The payment amount does not match the frozen quotation snapshot.",
        );
      }
    }
    return sortClientQuotePaymentRequests(existing);
  }
  const planned = planClientQuotePaymentRequestIntents(toClientQuotePaymentQuote(input.quote), {
    now: input.now,
    decision: input.decision,
  });
  if (
    existing.length === planned.length &&
    planned.every((intent) => existing.some((row) => sameIntent(row, intent)))
  ) {
    return sortClientQuotePaymentRequests(existing);
  }
  return createClientQuotePaymentRequestIntents(input.deps.store, {
    licenseeAccountId: input.licenseeAccountId,
    sourceQuoteId: input.quoteId,
    requestedBy: input.masterUserId,
    now: input.now,
    decision: input.decision,
  });
}

export async function createClientQuotePaymentLinksForMaster(input: {
  masterUserId: string;
  quoteId: string;
  decision: ClientQuotePaymentDecision;
  deps: ClientQuotePaymentLinkDeps;
}): Promise<ClientQuotePaymentLinkPayload> {
  const now = input.deps.now();
  const { quote, master } = await ownedQuote(input.deps, input.masterUserId, input.quoteId);
  const view = toClientQuotePaymentQuote(quote);
  const expired = clientQuotePaymentQuoteExpired(view, now);
  const intents = await resolveIntents({
    deps: input.deps,
    licenseeAccountId: master.id,
    masterUserId: input.masterUserId,
    quoteId: quote.id,
    quote,
    decision: input.decision,
    now,
    expired,
  });
  for (const intent of intents) {
    if (intent.licenseeAccountId !== master.id || intent.sourceQuoteId !== quote.id) {
      throw clientQuotePaymentError("NOT_FOUND", "Payment request was not found for this Licensee.");
    }
    await fulfillClientQuotePaymentRequest(
      {
        store: input.deps.store,
        ledger: input.deps.ledger,
        stripe: input.deps.stripe,
        quoteExpired: expired,
        now: input.deps.now,
      },
      intent,
    );
  }
  return publicPayload(input.deps, quote, master.id, input.deps.now());
}

export async function handleClientQuotePaymentLinks(input: {
  method: "GET" | "POST";
  quoteId: string;
  userId: string | null;
  body?: unknown;
  parseBody: (
    body: unknown,
  ) => { decision: ClientQuotePaymentDecision } | ClientQuotePaymentHttpFailure;
  deps: ClientQuotePaymentLinkDeps;
}): Promise<ClientQuotePaymentLinkResult> {
  if (!UUID_RE.test(input.quoteId.trim())) {
    return failure(404, "NOT_FOUND", "Quotation not found.");
  }
  if (!input.userId) return failure(401, "UNAUTHORIZED", "Authentication required.");
  try {
    if (input.method === "GET") {
      const payload = await getClientQuotePaymentLinksForMaster({
        masterUserId: input.userId,
        quoteId: input.quoteId.trim(),
        deps: input.deps,
      });
      return { status: 200, payload };
    }
    const parsed = input.parseBody(input.body);
    if ("status" in parsed) return failure(parsed.status, parsed.code, parsed.message);
    const payload = await createClientQuotePaymentLinksForMaster({
      masterUserId: input.userId,
      quoteId: input.quoteId.trim(),
      decision: parsed.decision,
      deps: input.deps,
    });
    return { status: 200, payload };
  } catch (error) {
    const mapped = clientQuotePaymentLinkFailure(error);
    return failure(mapped.status, mapped.code, mapped.message);
  }
}
