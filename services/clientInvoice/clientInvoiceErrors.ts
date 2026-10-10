/**
 * Stable client invoice service failures.
 * Routes map these to JSON. Messages stay free of storage keys and SQL.
 */

export class ClientInvoiceOperationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "ClientInvoiceOperationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function clientInvoiceNotFound(message: string): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError("NOT_FOUND", 404, message);
}

export function clientInvoiceSourceQuoteNotIssued(): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError(
    "SOURCE_QUOTE_NOT_ISSUED",
    409,
    "Only an issued quotation can be invoiced.",
  );
}

export function clientInvoiceInvalid(message: string): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError("INVALID_CLIENT_INVOICE", 400, message);
}

export function clientInvoiceIssuedImmutable(): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError(
    "ISSUED_INVOICE_IMMUTABLE",
    409,
    "Issued client invoices cannot be changed.",
  );
}

export function clientInvoiceInvalidTransition(
  message: string,
): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError(
    "INVALID_CLIENT_INVOICE_TRANSITION",
    409,
    message,
  );
}

export function clientInvoiceNumberExhausted(): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError(
    "INVOICE_NUMBER_EXHAUSTED",
    409,
    "Could not assign a unique invoice number.",
  );
}

export function clientInvoicePersistenceFailed(
  message = "Could not save the invoice.",
): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError("PERSISTENCE_FAILED", 500, message);
}

export function clientInvoicePdfNotIssued(): ClientInvoiceOperationError {
  return new ClientInvoiceOperationError(
    "INVOICE_NOT_ISSUED",
    409,
    "A PDF is available only for an issued invoice.",
  );
}
