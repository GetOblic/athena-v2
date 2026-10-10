/**
 * JSON body parsing and error mapping for Licensee invoice routes.
 * Does not authenticate and does not touch persistence.
 */

import { ClientQuoteCalculationError } from "@/services/clientQuote/clientQuoteTypes";
import { ClientInvoiceOperationError } from "@/services/clientInvoice/clientInvoiceErrors";
import {
  ClientInvoiceLifecycleError,
  ClientInvoiceSourceOccupiedError,
  ClientInvoiceValidationError,
  IssuedClientInvoiceImmutableError,
} from "@/services/clientInvoice/clientInvoiceTypes";

export type ParsedUpdateClientInvoiceBody = {
  draft: unknown;
  contentLanguage?: unknown;
  /** Present only when the caller sent a currency field. It cannot change the invoice. */
  currencyCode?: unknown;
};

export type ClientInvoiceHttpFailure = {
  status: number;
  code: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseUpdateClientInvoiceBody(
  body: unknown,
): ParsedUpdateClientInvoiceBody | ClientInvoiceHttpFailure {
  if (!isRecord(body) || !("draft" in body)) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "draft is required.",
    };
  }
  const contentLanguage = body.contentLanguage ?? body.content_language;
  const hasCurrency =
    Object.hasOwn(body, "currencyCode") || Object.hasOwn(body, "currency_code");
  if (!hasCurrency) {
    return {
      draft: body.draft,
      contentLanguage,
    };
  }
  return {
    draft: body.draft,
    contentLanguage,
    currencyCode: body.currencyCode ?? body.currency_code,
  };
}

export function isClientInvoiceHttpFailure(
  value: ParsedUpdateClientInvoiceBody | ClientInvoiceHttpFailure,
): value is ClientInvoiceHttpFailure {
  return "status" in value && "code" in value;
}

export function clientInvoiceFailure(error: unknown): ClientInvoiceHttpFailure {
  if (error instanceof ClientInvoiceOperationError) {
    return { status: error.httpStatus, code: error.code, message: error.message };
  }
  if (error instanceof Error && error.name === "LicenseeAccessError") {
    return { status: 403, code: "LICENSEE_ACCESS_DENIED", message: error.message };
  }
  if (error instanceof IssuedClientInvoiceImmutableError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ClientInvoiceLifecycleError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ClientInvoiceSourceOccupiedError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ClientInvoiceValidationError) {
    return {
      status: 400,
      code: error.code,
      message: error.details[0] ?? error.message,
    };
  }
  if (error instanceof ClientQuoteCalculationError) {
    return { status: 400, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "CLIENT_INVOICE_FAILED",
    message: "Could not complete the invoice request.",
  };
}
