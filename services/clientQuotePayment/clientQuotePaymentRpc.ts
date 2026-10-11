/**
 * Maps the Gate 2A RPC failures onto domain errors.
 * No Supabase client. The database function remains the atomic writer.
 */

import {
  CLIENT_QUOTE_PAYMENT_SQL_ERRORS,
  clientQuotePaymentError,
  type ClientQuotePaymentRequestError,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export type ClientQuotePaymentRpcFailure = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function failureText(error: ClientQuotePaymentRpcFailure): string {
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
}

export function mapClientQuotePaymentRpcError(
  error: ClientQuotePaymentRpcFailure,
): ClientQuotePaymentRequestError {
  const text = failureText(error);
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.expired)) {
    return clientQuotePaymentError(
      "QUOTE_EXPIRED",
      "This quotation has expired. A new payment request cannot be started.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.validity)) {
    return clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "Quotation validity cannot be read.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.notFound)) {
    return clientQuotePaymentError(
      "NOT_FOUND",
      "Payment request was not found for this Licensee.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.fulfillment)) {
    return clientQuotePaymentError(
      "FULFILLMENT_REJECTED",
      "The Stripe Price or Payment Link record was rejected.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.conflict)) {
    return clientQuotePaymentError(
      "COLLECTION_CONFLICT",
      "This quotation already has the other one-time collection mode.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.duplicate) || error.code === "23505") {
    return clientQuotePaymentError(
      "DUPLICATE_PURPOSE",
      "A payment request for this quotation and purpose already exists.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.pair)) {
    return clientQuotePaymentError(
      "PAIR_INCOMPLETE",
      "A split collection must record the deposit and the balance together.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.amount)) {
    return clientQuotePaymentError(
      "AMOUNT_REJECTED",
      "The payment amount does not match the frozen quotation snapshot.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.ineligible)) {
    return clientQuotePaymentError(
      "SNAPSHOT_UNUSABLE",
      "The issued quotation is not eligible for a new payment request.",
    );
  }
  if (text.includes(CLIENT_QUOTE_PAYMENT_SQL_ERRORS.immutable)) {
    return clientQuotePaymentError(
      "PERSISTENCE_FAILED",
      "A recorded payment request cannot be changed.",
    );
  }
  return clientQuotePaymentError(
    "PERSISTENCE_FAILED",
    "Could not record the payment request.",
  );
}
