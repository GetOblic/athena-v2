/**
 * Stable client-invoice API codes to Licensee catalog messages.
 */

import type { ClientInvoiceDraftBlocker } from "@/lib/licensee/clientInvoiceEditorModel";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";

const CLIENT_INVOICE_ERROR_KEYS = {
  UNAUTHORIZED: "unauthorized",
  LICENSEE_ACCESS_DENIED: "forbidden",
  NOT_FOUND: "notFound",
  INVALID_JSON: "validation",
  INVALID_BODY: "validation",
  INVALID_CLIENT_INVOICE: "invalidInvoice",
  INVALID_CLIENT_QUOTE_CALCULATION: "invalidInvoice",
  ISSUED_INVOICE_IMMUTABLE: "issuedImmutable",
  INVALID_CLIENT_INVOICE_TRANSITION: "invalidTransition",
  SOURCE_QUOTE_NOT_ISSUED: "sourceQuoteNotIssued",
  SOURCE_QUOTE_HAS_ACTIVE_INVOICE: "sourceOccupied",
  INVOICE_NUMBER_EXHAUSTED: "numberExhausted",
  PERSISTENCE_FAILED: "persistenceFailed",
  INVOICE_NOT_ISSUED: "notIssued",
  CLIENT_INVOICE_PDF_FAILED: "pdfFailed",
  CLIENT_INVOICE_FAILED: "generic",
} as const satisfies Record<
  string,
  keyof LicenseeMessages["clientInvoices"]["errors"]
>;

export const CLIENT_INVOICE_STABLE_ERROR_CODES = Object.keys(
  CLIENT_INVOICE_ERROR_KEYS,
) as Array<keyof typeof CLIENT_INVOICE_ERROR_KEYS>;

export function clientInvoiceErrorMessage(
  messages: LicenseeMessages,
  code: string | undefined,
): string {
  if (code && code in CLIENT_INVOICE_ERROR_KEYS) {
    const key =
      CLIENT_INVOICE_ERROR_KEYS[code as keyof typeof CLIENT_INVOICE_ERROR_KEYS];
    return messages.clientInvoices.errors[key];
  }
  return messages.clientInvoices.errors.generic;
}

export function clientInvoiceBlockerMessage(
  messages: LicenseeMessages,
  blocker: ClientInvoiceDraftBlocker,
): string {
  const quotes = messages.clientQuotes;
  const invoices = messages.clientInvoices;
  switch (blocker) {
    case "customerName":
    case "projectTitle":
    case "scopeSummary":
    case "lineItem":
      return quotes.draftIncomplete;
    case "discount":
    case "tax":
    case "calculation":
      return quotes.calculationFailed;
    case "fixedDiscountMixed":
      return quotes.fixedDiscountMixed;
    case "contact":
      return quotes.contactInvalid;
    case "paymentDueDate":
      return invoices.paymentDueDateInvalid;
    case "paymentDueDateBeforeIssue":
      return invoices.paymentDueDateBeforeIssue;
    case "paymentInstructions":
      return invoices.errors.validation;
    default:
      return invoices.errors.validation;
  }
}
