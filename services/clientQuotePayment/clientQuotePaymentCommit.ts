/**
 * In-process commit predicate for one payment-request decision.
 *
 * This is the same exclusion the SQL function enforces under a quote-row
 * lock: one purpose per quotation, and either a full one-time request or a
 * deposit/balance pair. The function does not mutate its inputs and does not
 * update the quotation.
 */

import { randomUUID } from "node:crypto";
import { canonicalJson, planClientQuotePaymentRequestIntents, toClientQuotePaymentQuote } from "@/services/clientQuotePayment/clientQuotePaymentDomain";
import {
  clientQuotePaymentError,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentRequest,
  type ClientQuotePaymentRequestInsert,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";
import type { AthenaClientQuote } from "@/services/clientQuote/clientQuoteTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PURPOSE_ORDER = {
  one_time_full: 0,
  one_time_deposit: 1,
  one_time_balance: 2,
  monthly: 3,
  quarterly: 4,
  annually: 5,
} as const;

export type ClientQuotePaymentCommitInput = {
  licenseeAccountId: string;
  sourceQuoteId: string;
  requestedBy: string | null;
  now: string;
  decision: ClientQuotePaymentDecision;
  intents: readonly ClientQuotePaymentRequestInsert[];
};

export type ClientQuotePaymentCommitState = {
  quote: AthenaClientQuote | null;
  requests: readonly ClientQuotePaymentRequest[];
};

function expectedCardinality(decision: ClientQuotePaymentDecision): number {
  return decision.kind === "one_time_split" ? 2 : 1;
}

function assertPairShape(
  decision: ClientQuotePaymentDecision,
  intents: readonly ClientQuotePaymentRequestInsert[],
): void {
  if (intents.length !== expectedCardinality(decision)) {
    throw clientQuotePaymentError(
      "PAIR_INCOMPLETE",
      "A split collection must record the deposit and the balance together.",
    );
  }
  if (decision.kind === "one_time_split") {
    const purposes = intents.map((intent) => intent.requestParameters.purpose);
    if (
      !purposes.includes("one_time_deposit") ||
      !purposes.includes("one_time_balance") ||
      new Set(purposes).size !== 2
    ) {
      throw clientQuotePaymentError(
        "PAIR_INCOMPLETE",
        "A split collection must record the deposit and the balance together.",
      );
    }
  }
}

function assertNoConflict(
  existing: readonly ClientQuotePaymentRequest[],
  intents: readonly ClientQuotePaymentRequestInsert[],
): void {
  const existingPurposes = new Set(existing.map((row) => row.purpose));
  const incomingPurposes = intents.map((intent) => intent.requestParameters.purpose);
  const incomingFull = incomingPurposes.includes("one_time_full");
  const incomingSplit = incomingPurposes.some(
    (purpose) => purpose === "one_time_deposit" || purpose === "one_time_balance",
  );
  const existingFull = existingPurposes.has("one_time_full");
  const existingSplit =
    existingPurposes.has("one_time_deposit") || existingPurposes.has("one_time_balance");

  if ((incomingFull && existingSplit) || (incomingSplit && existingFull)) {
    throw clientQuotePaymentError(
      "COLLECTION_CONFLICT",
      "This quotation already has the other one-time collection mode.",
    );
  }
  if (incomingSplit && existingSplit) {
    throw clientQuotePaymentError(
      "DUPLICATE_PURPOSE",
      "A payment request for this quotation and purpose already exists.",
    );
  }
  for (const purpose of incomingPurposes) {
    if (existingPurposes.has(purpose)) {
      throw clientQuotePaymentError(
        "DUPLICATE_PURPOSE",
        "A payment request for this quotation and purpose already exists.",
      );
    }
  }

  const seenKeys = new Set<string>();
  for (const row of existing) {
    seenKeys.add(row.stripePriceIdempotencyKey);
    seenKeys.add(row.stripePaymentLinkIdempotencyKey);
  }
  for (const intent of intents) {
    const keys = [intent.stripePriceIdempotencyKey, intent.stripePaymentLinkIdempotencyKey];
    for (const key of keys) {
      if (seenKeys.has(key)) {
        throw clientQuotePaymentError(
          "DUPLICATE_PURPOSE",
          "A payment request for this quotation and purpose already exists.",
        );
      }
      seenKeys.add(key);
    }
  }
}

function toStoredRow(
  intent: ClientQuotePaymentRequestInsert,
  input: ClientQuotePaymentCommitInput,
): ClientQuotePaymentRequest {
  const parameters = structuredClone(intent.requestParameters);
  return {
    id: randomUUID(),
    licenseeAccountId: parameters.licenseeAccountId,
    organizationId: parameters.organizationId,
    requestedBy: input.requestedBy,
    sourceQuoteId: parameters.sourceQuoteId,
    purpose: parameters.purpose,
    billingFrequency: parameters.billingFrequency,
    currencyCode: parameters.currencyCode,
    currencyScale: 2,
    amountMinor: parameters.amountMinor,
    amountSource: parameters.amountSource,
    oneTimeCollectionMode: parameters.oneTimeCollectionMode,
    oneTimeTotalMinor: parameters.oneTimeTotalMinor,
    depositMinor: parameters.depositMinor,
    balanceMinor: parameters.balanceMinor,
    quoteNumber: parameters.quoteNumber,
    quoteIssuedAt: parameters.quoteIssuedAt,
    settlementAccount: parameters.settlementAccount,
    requestParameters: parameters,
    stripePriceIdempotencyKey: intent.stripePriceIdempotencyKey,
    stripePaymentLinkIdempotencyKey: intent.stripePaymentLinkIdempotencyKey,
    stripePriceId: null,
    stripePaymentLinkId: null,
    stripePaymentLinkUrl: null,
    createdAt: input.now,
  };
}

/**
 * Validates a decision against the current quote and existing requests.
 * Returns the rows to append. Does not mutate `state`.
 */
export function commitClientQuotePaymentRequestIntents(
  state: ClientQuotePaymentCommitState,
  input: ClientQuotePaymentCommitInput,
): ClientQuotePaymentRequest[] {
  const quote = state.quote;
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
  if (
    input.requestedBy != null &&
    (typeof input.requestedBy !== "string" || !UUID_PATTERN.test(input.requestedBy))
  ) {
    throw clientQuotePaymentError(
      "PERSISTENCE_FAILED",
      "Could not record the payment request.",
    );
  }

  const fresh = planClientQuotePaymentRequestIntents(toClientQuotePaymentQuote(quote), {
    now: input.now,
    decision: input.decision,
  });
  assertPairShape(input.decision, input.intents);
  if (canonicalJson(fresh) !== canonicalJson(input.intents)) {
    throw clientQuotePaymentError(
      "AMOUNT_REJECTED",
      "The payment amount does not match the frozen quotation snapshot.",
    );
  }

  const existing = state.requests.filter(
    (row) =>
      row.sourceQuoteId === input.sourceQuoteId &&
      row.licenseeAccountId === input.licenseeAccountId,
  );
  assertNoConflict(existing, fresh);

  return fresh
    .map((intent) => toStoredRow(intent, input))
    .sort((left, right) => PURPOSE_ORDER[left.purpose] - PURPOSE_ORDER[right.purpose]);
}
