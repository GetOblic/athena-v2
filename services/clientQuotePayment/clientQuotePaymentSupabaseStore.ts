/**
 * Service-role persistence for athena_client_quote_payment_requests.
 * Inserts go through create_client_quote_payment_request_intents.
 * Stripe identifiers go through record_client_quote_payment_request_stripe_fulfillment.
 * licensee_account_id is the authenticated Master argument.
 * Quotations are read only. This module does not apply migrations and does
 * not call Stripe.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ClientQuoteOperationError } from "@/services/clientQuote/clientQuoteErrors";
import { mapAthenaClientQuoteRow } from "@/services/clientQuote/clientQuotePersistence";
import { commitClientQuotePaymentRequestIntents } from "@/services/clientQuotePayment/clientQuotePaymentCommit";
import { applyClientQuotePaymentStripeFulfillment } from "@/services/clientQuotePayment/clientQuotePaymentFulfillment";
import { mapClientQuotePaymentRpcError } from "@/services/clientQuotePayment/clientQuotePaymentRpc";
import { mapClientQuotePaymentRequestRow } from "@/services/clientQuotePayment/clientQuotePaymentRow";
import type { ClientQuotePaymentRequestStore } from "@/services/clientQuotePayment/clientQuotePaymentStore";
import {
  CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC,
  RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC,
  clientQuotePaymentError,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const PURPOSE_ORDER = {
  one_time_full: 0,
  one_time_deposit: 1,
  one_time_balance: 2,
  monthly: 3,
  quarterly: 4,
  annually: 5,
} as const;

function sortRequests(rows: ClientQuotePaymentRequest[]): ClientQuotePaymentRequest[] {
  return [...rows].sort(
    (left, right) => PURPOSE_ORDER[left.purpose] - PURPOSE_ORDER[right.purpose],
  );
}

async function loadOwnedQuote(sourceQuoteId: string, licenseeAccountId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_client_quotes")
    .select("*")
    .eq("id", sourceQuoteId)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();
  if (error) {
    console.error("[CLIENT_QUOTE_PAYMENT] quote_read_failed", error);
    throw clientQuotePaymentError(
      "PERSISTENCE_FAILED",
      "Could not load the quotation.",
    );
  }
  if (!data) return null;
  try {
    return mapAthenaClientQuoteRow(data as Record<string, unknown>);
  } catch (caught) {
    if (caught instanceof ClientQuoteOperationError) {
      throw clientQuotePaymentError(
        "PERSISTENCE_FAILED",
        "Could not load the quotation.",
      );
    }
    throw caught;
  }
}

async function loadRequests(sourceQuoteId: string, licenseeAccountId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_client_quote_payment_requests")
    .select("*")
    .eq("source_quote_id", sourceQuoteId)
    .eq("licensee_account_id", licenseeAccountId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[CLIENT_QUOTE_PAYMENT] list_failed", error);
    throw clientQuotePaymentError(
      "PERSISTENCE_FAILED",
      "Could not load the payment request.",
    );
  }
  return sortRequests(
    (data ?? []).map((row) => mapClientQuotePaymentRequestRow(row as Record<string, unknown>)),
  );
}

export function createSupabaseClientQuotePaymentRequestStore(): ClientQuotePaymentRequestStore {
  return {
    getOwnedQuote(sourceQuoteId, licenseeAccountId) {
      return loadOwnedQuote(sourceQuoteId, licenseeAccountId);
    },
    async commitPaymentRequestIntents(input) {
      const quote = await loadOwnedQuote(input.sourceQuoteId, input.licenseeAccountId);
      const existing = quote
        ? await loadRequests(input.sourceQuoteId, input.licenseeAccountId)
        : [];
      const preview = commitClientQuotePaymentRequestIntents(
        { quote, requests: existing },
        input,
      );
      if (preview.length !== input.intents.length) {
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not record the payment request.",
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        CREATE_CLIENT_QUOTE_PAYMENT_REQUEST_INTENTS_RPC,
        {
          p_licensee_account_id: input.licenseeAccountId,
          p_source_quote_id: input.sourceQuoteId,
          p_requested_by: input.requestedBy,
          p_rows: input.intents.map((intent) => ({
            requestParameters: intent.requestParameters,
            stripePriceIdempotencyKey: intent.stripePriceIdempotencyKey,
            stripePaymentLinkIdempotencyKey: intent.stripePaymentLinkIdempotencyKey,
          })),
        },
      );
      if (error) {
        console.error("[CLIENT_QUOTE_PAYMENT] commit_failed", error);
        throw mapClientQuotePaymentRpcError(error);
      }
      if (!Array.isArray(data)) {
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not record the payment request.",
        );
      }
      const recorded = sortRequests(
        data.map((row) => mapClientQuotePaymentRequestRow(row as Record<string, unknown>)),
      );
      if (
        recorded.length !== input.intents.length ||
        recorded.some(
          (row) =>
            row.licenseeAccountId !== input.licenseeAccountId ||
            row.sourceQuoteId !== input.sourceQuoteId,
        )
      ) {
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not record the payment request.",
        );
      }
      return recorded;
    },
    listPaymentRequests(sourceQuoteId, licenseeAccountId) {
      return loadRequests(sourceQuoteId, licenseeAccountId);
    },
    async getPaymentRequest(id, licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_payment_requests")
        .select("*")
        .eq("id", id)
        .eq("licensee_account_id", licenseeAccountId)
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE_PAYMENT] get_failed", error);
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not load the payment request.",
        );
      }
      if (!data) return null;
      const request = mapClientQuotePaymentRequestRow(data as Record<string, unknown>);
      if (request.licenseeAccountId !== licenseeAccountId) return null;
      return request;
    },
    async recordStripeFulfillment(input) {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("athena_client_quote_payment_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("licensee_account_id", input.licenseeAccountId)
        .maybeSingle();
      if (readError) {
        console.error("[CLIENT_QUOTE_PAYMENT] fulfillment_read_failed", readError);
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not load the payment request.",
        );
      }
      if (!existing) {
        throw clientQuotePaymentError(
          "NOT_FOUND",
          "Payment request was not found for this Licensee.",
        );
      }
      const current = mapClientQuotePaymentRequestRow(existing as Record<string, unknown>);
      if (
        current.id !== input.requestId ||
        current.licenseeAccountId !== input.licenseeAccountId
      ) {
        throw clientQuotePaymentError(
          "NOT_FOUND",
          "Payment request was not found for this Licensee.",
        );
      }
      const preview = applyClientQuotePaymentStripeFulfillment(current, input);
      const { data, error } = await supabaseAdmin.rpc(
        RECORD_CLIENT_QUOTE_PAYMENT_REQUEST_STRIPE_FULFILLMENT_RPC,
        {
          p_licensee_account_id: input.licenseeAccountId,
          p_request_id: input.requestId,
          p_stripe_price_id: input.stripePriceId,
          p_stripe_payment_link_id: input.stripePaymentLinkId,
          p_stripe_payment_link_url: input.stripePaymentLinkUrl,
        },
      );
      if (error) {
        console.error("[CLIENT_QUOTE_PAYMENT] fulfillment_failed", error);
        throw mapClientQuotePaymentRpcError(error);
      }
      if (!Array.isArray(data) || data.length !== 1) {
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not record the Stripe fulfillment.",
        );
      }
      const recorded = mapClientQuotePaymentRequestRow(data[0] as Record<string, unknown>);
      if (
        recorded.id !== preview.id ||
        recorded.licenseeAccountId !== preview.licenseeAccountId ||
        recorded.sourceQuoteId !== preview.sourceQuoteId ||
        recorded.purpose !== preview.purpose ||
        recorded.amountMinor !== preview.amountMinor ||
        recorded.currencyCode !== preview.currencyCode ||
        recorded.stripePriceIdempotencyKey !== preview.stripePriceIdempotencyKey ||
        recorded.stripePaymentLinkIdempotencyKey !== preview.stripePaymentLinkIdempotencyKey ||
        recorded.stripePriceId !== preview.stripePriceId ||
        recorded.stripePaymentLinkId !== preview.stripePaymentLinkId ||
        recorded.stripePaymentLinkUrl !== preview.stripePaymentLinkUrl
      ) {
        throw clientQuotePaymentError(
          "PERSISTENCE_FAILED",
          "Could not record the Stripe fulfillment.",
        );
      }
      return recorded;
    },
  };
}
