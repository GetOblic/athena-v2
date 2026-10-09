/**
 * Stable client-quotation API codes to Licensee catalog messages.
 */

import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import type { ClientQuoteDraftBlocker } from "@/lib/licensee/clientQuoteEditorModel";
import type { ClientQuoteBillingFrequency } from "@/services/clientQuote/clientQuoteTypes";

const CLIENT_QUOTE_ERROR_KEYS = {
  UNAUTHORIZED: "unauthorized",
  LICENSEE_ACCESS_DENIED: "forbidden",
  NOT_FOUND: "notFound",
  INVALID_JSON: "validation",
  INVALID_BODY: "validation",
  INVALID_CLIENT_QUOTE: "invalidQuote",
  INVALID_CLIENT_QUOTE_CALCULATION: "invalidQuote",
  ISSUED_IMMUTABLE: "issuedImmutable",
  INVALID_CLIENT_QUOTE_TRANSITION: "invalidTransition",
  QUOTE_NOT_ISSUABLE: "notIssuable",
  ISSUER_INCOMPLETE: "issuerIncomplete",
  ESTIMATE_NOT_READY: "estimateNotReady",
  ESTIMATE_PACKAGE_INVALID: "packageInvalid",
  RECIPIENT_UNAVAILABLE: "recipientUnavailable",
  LOGO_COPY_FAILED: "logoFailed",
  QUOTE_NUMBER_EXHAUSTED: "numberExhausted",
  PERSISTENCE_FAILED: "persistenceFailed",
  QUOTE_NOT_ISSUED: "quoteNotIssued",
  CLIENT_QUOTE_PDF_FAILED: "pdfFailed",
  CLIENT_QUOTE_FAILED: "generic",
} as const satisfies Record<string, keyof LicenseeMessages["clientQuotes"]["errors"]>;

export const CLIENT_QUOTE_STABLE_ERROR_CODES = Object.keys(
  CLIENT_QUOTE_ERROR_KEYS,
) as Array<keyof typeof CLIENT_QUOTE_ERROR_KEYS>;

export function clientQuoteErrorMessage(
  messages: LicenseeMessages,
  code: string | undefined,
): string {
  if (code && code in CLIENT_QUOTE_ERROR_KEYS) {
    const key = CLIENT_QUOTE_ERROR_KEYS[code as keyof typeof CLIENT_QUOTE_ERROR_KEYS];
    return messages.clientQuotes.errors[key];
  }
  return messages.clientQuotes.errors.generic;
}

export function clientQuoteBlockerMessage(
  messages: LicenseeMessages,
  blocker: ClientQuoteDraftBlocker,
): string {
  const copy = messages.clientQuotes;
  switch (blocker) {
    case "customerName":
    case "projectTitle":
    case "scopeSummary":
    case "lineItem":
      return copy.draftIncomplete;
    case "discount":
    case "tax":
    case "calculation":
      return copy.calculationFailed;
    case "fixedDiscountMixed":
      return copy.fixedDiscountMixed;
    case "appendix":
      return copy.appendixIncomplete;
    case "validity":
      return copy.validityInvalid;
    case "contact":
      return copy.contactInvalid;
    default:
      return copy.errors.validation;
  }
}

export function clientQuoteBillingFrequencyLabel(
  messages: LicenseeMessages,
  frequency: ClientQuoteBillingFrequency,
): string {
  const copy = messages.clientQuotes;
  switch (frequency) {
    case "one_time":
      return copy.frequencyOneTime;
    case "monthly":
      return copy.frequencyMonthly;
    case "quarterly":
      return copy.frequencyQuarterly;
    case "annually":
      return copy.frequencyAnnually;
  }
}
