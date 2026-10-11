/**
 * Service-role proof of a Stripe Price or Payment Link dispatch.
 * Reads are selects. Inserts go through record_client_quote_payment_stripe_dispatch.
 * This module does not call Stripe and does not apply migrations.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  ClientQuotePaymentStripeDispatch,
  ClientQuotePaymentStripeDispatchLedger,
} from "@/services/clientQuotePayment/clientQuotePaymentStripeDispatch";
import { clientQuotePaymentStripeError } from "@/services/clientQuotePayment/clientQuotePaymentStripeErrors";
import { clientQuotePaymentError } from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export const RECORD_CLIENT_QUOTE_PAYMENT_STRIPE_DISPATCH_RPC =
  "record_client_quote_payment_stripe_dispatch" as const;

const PRICE_KEY_PATTERN = /^cqpr_price_v1_[0-9a-f]{64}$/;
const LINK_KEY_PATTERN = /^cqpr_link_v1_[0-9a-f]{64}$/;

function mapDispatch(row: Record<string, unknown>): ClientQuotePaymentStripeDispatch {
  const kind = row.kind;
  const idempotencyKey = row.idempotency_key;
  const requestBody = row.request_body;
  const dispatchedAt = row.dispatched_at;
  const licenseeAccountId = row.licensee_account_id;
  const paymentRequestId = row.payment_request_id;
  if (kind !== "price" && kind !== "payment_link") {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  if (typeof idempotencyKey !== "string") {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  if (kind === "price" && !PRICE_KEY_PATTERN.test(idempotencyKey)) {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  if (kind === "payment_link" && !LINK_KEY_PATTERN.test(idempotencyKey)) {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  if (typeof requestBody !== "string" || requestBody.length < 1 || requestBody.length > 4_000) {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  const stamp = dispatchedAt instanceof Date ? dispatchedAt.toISOString() : dispatchedAt;
  if (typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))) {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  if (typeof licenseeAccountId !== "string" || typeof paymentRequestId !== "string") {
    throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
  }
  return {
    licenseeAccountId,
    paymentRequestId,
    kind,
    idempotencyKey,
    requestBody,
    dispatchedAt: new Date(stamp).toISOString(),
  };
}

function mapRpcFailure(error: { code?: string; message?: string; details?: string; hint?: string }): never {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  console.error("[CLIENT_QUOTE_PAYMENT] stripe_dispatch_failed");
  if (text.includes("client_quote_payment_request_not_found")) {
    throw clientQuotePaymentError("NOT_FOUND", "Payment request was not found for this Licensee.");
  }
  if (text.includes("client_quote_payment_stripe_dispatch_rejected")) {
    throw clientQuotePaymentStripeError("STRIPE_REJECTED");
  }
  throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not record the Stripe dispatch.");
}

export function createSupabaseClientQuotePaymentStripeDispatchLedger(): ClientQuotePaymentStripeDispatchLedger {
  return {
    async get(input) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_payment_stripe_dispatches")
        .select(
          "licensee_account_id, payment_request_id, kind, idempotency_key, request_body, dispatched_at",
        )
        .eq("payment_request_id", input.paymentRequestId)
        .eq("licensee_account_id", input.licenseeAccountId)
        .eq("kind", input.kind)
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE_PAYMENT] stripe_dispatch_read_failed");
        throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not read the Stripe dispatch.");
      }
      if (!data) return null;
      const mapped = mapDispatch(data as Record<string, unknown>);
      if (
        mapped.licenseeAccountId !== input.licenseeAccountId ||
        mapped.paymentRequestId !== input.paymentRequestId ||
        mapped.kind !== input.kind
      ) {
        return null;
      }
      return mapped;
    },
    async record(input) {
      const { data, error } = await supabaseAdmin.rpc(
        RECORD_CLIENT_QUOTE_PAYMENT_STRIPE_DISPATCH_RPC,
        {
          p_licensee_account_id: input.licenseeAccountId,
          p_payment_request_id: input.paymentRequestId,
          p_kind: input.kind,
          p_idempotency_key: input.idempotencyKey,
          p_request_body: input.requestBody,
          p_dispatched_at: input.dispatchedAt,
        },
      );
      if (error) mapRpcFailure(error);
      if (!Array.isArray(data) || data.length !== 1) {
        throw clientQuotePaymentError("PERSISTENCE_FAILED", "Could not record the Stripe dispatch.");
      }
      const mapped = mapDispatch(data[0] as Record<string, unknown>);
      if (
        mapped.paymentRequestId !== input.paymentRequestId ||
        mapped.licenseeAccountId !== input.licenseeAccountId ||
        mapped.kind !== input.kind ||
        mapped.idempotencyKey !== input.idempotencyKey
      ) {
        throw clientQuotePaymentStripeError("STRIPE_REJECTED");
      }
      return mapped;
    },
  };
}
