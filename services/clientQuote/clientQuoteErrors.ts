/**
 * Stable quotation service failures.
 * Routes map these to JSON. Messages stay free of storage keys and SQL.
 */

export class ClientQuoteOperationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "ClientQuoteOperationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function clientQuoteNotFound(message: string): ClientQuoteOperationError {
  return new ClientQuoteOperationError("NOT_FOUND", 404, message);
}

export function clientQuoteEstimateNotReady(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "ESTIMATE_NOT_READY",
    409,
    "Only a Ready Estimate can seed a quotation.",
  );
}

export function clientQuoteEstimatePackageInvalid(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "ESTIMATE_PACKAGE_INVALID",
    400,
    "The Estimate package cannot seed a quotation.",
  );
}

export function clientQuoteRecipientUnavailable(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "RECIPIENT_UNAVAILABLE",
    404,
    "Recipient is unavailable.",
  );
}

export function clientQuoteIssuerIncomplete(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "ISSUER_INCOMPLETE",
    409,
    "Issuer legal details are required before this quotation can be issued.",
  );
}

export function clientQuoteNotIssuable(message: string): ClientQuoteOperationError {
  return new ClientQuoteOperationError("QUOTE_NOT_ISSUABLE", 409, message);
}

export function clientQuoteInvalid(message: string): ClientQuoteOperationError {
  return new ClientQuoteOperationError("INVALID_CLIENT_QUOTE", 400, message);
}

export function clientQuoteIssuedImmutable(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "ISSUED_IMMUTABLE",
    409,
    "Issued client quotes cannot be changed. Revise them as a new draft.",
  );
}

export function clientQuoteInvalidTransition(message: string): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "INVALID_CLIENT_QUOTE_TRANSITION",
    409,
    message,
  );
}

export function clientQuoteLogoCopyFailed(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "LOGO_COPY_FAILED",
    409,
    "Could not copy the quotation logo.",
  );
}

export function clientQuoteNumberExhausted(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "QUOTE_NUMBER_EXHAUSTED",
    409,
    "Could not assign a unique quote number.",
  );
}

export function clientQuotePersistenceFailed(
  message = "Could not save the quotation.",
): ClientQuoteOperationError {
  return new ClientQuoteOperationError("PERSISTENCE_FAILED", 500, message);
}

export function clientQuotePdfNotIssued(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "QUOTE_NOT_ISSUED",
    409,
    "A PDF is available only for an issued quotation.",
  );
}

export function clientQuotePdfFailed(): ClientQuoteOperationError {
  return new ClientQuoteOperationError(
    "CLIENT_QUOTE_PDF_FAILED",
    500,
    "Could not prepare the quotation PDF.",
  );
}
