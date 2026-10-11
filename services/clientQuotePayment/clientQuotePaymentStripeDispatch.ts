/**
 * CQ-STRIPE-1 Gate 2B — proof that a Stripe request was dispatched.
 *
 * The payment-request row is the durable Athena intent. It is not proof
 * that Stripe was called. A dispatch row is written only on the Stripe
 * call path, before the HTTP request, and its timestamp starts the
 * 24-hour idempotency window. The first body and timestamp win.
 */

import { clientQuotePaymentStripeError } from "@/services/clientQuotePayment/clientQuotePaymentStripeErrors";

export type ClientQuotePaymentStripeDispatchKind = "price" | "payment_link";

export type ClientQuotePaymentStripeDispatch = {
  licenseeAccountId: string;
  paymentRequestId: string;
  kind: ClientQuotePaymentStripeDispatchKind;
  idempotencyKey: string;
  requestBody: string;
  /** Clock captured when this Stripe call was initiated. Not the intent createdAt. */
  dispatchedAt: string;
};

export type ClientQuotePaymentStripeDispatchQuery = {
  licenseeAccountId: string;
  paymentRequestId: string;
  kind: ClientQuotePaymentStripeDispatchKind;
};

export type ClientQuotePaymentStripeDispatchLedger = {
  get(
    input: ClientQuotePaymentStripeDispatchQuery,
  ): Promise<ClientQuotePaymentStripeDispatch | null>;
  /**
   * Insert the first dispatch. A repeat with the same idempotency key
   * returns the original body and timestamp. A different key is rejected.
   */
  record(
    input: ClientQuotePaymentStripeDispatch,
  ): Promise<ClientQuotePaymentStripeDispatch>;
};

function sameDispatch(
  row: ClientQuotePaymentStripeDispatch,
  input: ClientQuotePaymentStripeDispatchQuery,
): boolean {
  return (
    row.licenseeAccountId === input.licenseeAccountId &&
    row.paymentRequestId === input.paymentRequestId &&
    row.kind === input.kind
  );
}

export function createMemoryStripeDispatchLedger(): ClientQuotePaymentStripeDispatchLedger & {
  all(): readonly ClientQuotePaymentStripeDispatch[];
} {
  const rows: ClientQuotePaymentStripeDispatch[] = [];
  return {
    async get(input) {
      const found = rows.find((row) => sameDispatch(row, input));
      return found ? structuredClone(found) : null;
    },
    async record(input) {
      if (input.requestBody.length < 1 || input.requestBody.length > 4_000) {
        throw clientQuotePaymentStripeError("STRIPE_REJECTED");
      }
      const current = rows.find((row) => sameDispatch(row, input));
      if (current) {
        if (current.idempotencyKey !== input.idempotencyKey) {
          throw clientQuotePaymentStripeError("STRIPE_REJECTED");
        }
        return structuredClone(current);
      }
      const stored = structuredClone(input);
      rows.push(stored);
      return structuredClone(stored);
    },
    all() {
      return rows.map((row) => structuredClone(row));
    },
  };
}
