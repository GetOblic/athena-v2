/**
 * JSON body parsing and error mapping for Licensee quotation routes.
 * Does not authenticate and does not touch persistence.
 */

import {
  ClientQuoteCalculationError,
  ClientQuoteLifecycleError,
  ClientQuoteValidationError,
  IssuedClientQuoteImmutableError,
} from "@/services/clientQuote/clientQuoteTypes";
import { ClientQuoteOperationError } from "@/services/clientQuote/clientQuoteErrors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClientQuoteRecipientInput =
  | { kind: "prospect"; prospectId: string }
  | { kind: "removedProspect" }
  | { kind: "client" };

export type ParsedCreateClientQuoteBody = {
  estimateId: string;
  recipient: ClientQuoteRecipientInput;
  contentLanguage?: unknown;
};

export type ParsedUpdateClientQuoteBody = {
  draft: unknown;
  contentLanguage?: unknown;
};

export type ClientQuoteHttpFailure = {
  status: number;
  code: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseCreateClientQuoteBody(
  body: unknown,
): ParsedCreateClientQuoteBody | ClientQuoteHttpFailure {
  if (!isRecord(body)) {
    return { status: 400, code: "INVALID_BODY", message: "Request body must be an object." };
  }
  const estimateId = body.estimateId ?? body.estimate_id;
  if (typeof estimateId !== "string" || !UUID_PATTERN.test(estimateId.trim())) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "estimateId must be a UUID.",
    };
  }
  const recipient = body.recipient;
  if (
    !isRecord(recipient) ||
    (recipient.kind !== "prospect" &&
      recipient.kind !== "removedProspect" &&
      recipient.kind !== "client")
  ) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "recipient.kind must be prospect, removedProspect, or client.",
    };
  }
  const contentLanguage = body.contentLanguage ?? body.content_language;
  if (recipient.kind === "prospect") {
    const prospectId = recipient.prospectId ?? recipient.prospect_id;
    if (typeof prospectId !== "string" || !UUID_PATTERN.test(prospectId.trim())) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "recipient.prospectId must be a UUID.",
      };
    }
    return {
      estimateId: estimateId.trim(),
      recipient: { kind: "prospect", prospectId: prospectId.trim() },
      contentLanguage,
    };
  }
  if (recipient.kind === "removedProspect") {
    return {
      estimateId: estimateId.trim(),
      recipient: { kind: "removedProspect" },
      contentLanguage,
    };
  }
  return {
    estimateId: estimateId.trim(),
    recipient: { kind: "client" },
    contentLanguage,
  };
}

export function parseUpdateClientQuoteBody(
  body: unknown,
): ParsedUpdateClientQuoteBody | ClientQuoteHttpFailure {
  if (!isRecord(body) || !("draft" in body)) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "draft is required.",
    };
  }
  return {
    draft: body.draft,
    contentLanguage: body.contentLanguage ?? body.content_language,
  };
}

export function isClientQuoteHttpFailure(
  value: ParsedCreateClientQuoteBody | ParsedUpdateClientQuoteBody | ClientQuoteHttpFailure,
): value is ClientQuoteHttpFailure {
  return "status" in value && "code" in value;
}

export function clientQuoteFailure(error: unknown): ClientQuoteHttpFailure {
  if (error instanceof ClientQuoteOperationError) {
    return { status: error.httpStatus, code: error.code, message: error.message };
  }
  if (error instanceof Error && error.name === "LicenseeAccessError") {
    return { status: 403, code: "LICENSEE_ACCESS_DENIED", message: error.message };
  }
  if (error instanceof IssuedClientQuoteImmutableError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ClientQuoteLifecycleError) {
    return {
      status: 409,
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof ClientQuoteValidationError) {
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
    code: "CLIENT_QUOTE_FAILED",
    message: "Could not complete the quotation request.",
  };
}
