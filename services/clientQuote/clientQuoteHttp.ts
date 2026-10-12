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

export type ParsedEstimateCreateClientQuoteBody = {
  source: "estimate";
  estimateId: string;
  recipient: ClientQuoteRecipientInput;
  contentLanguage?: unknown;
};

export type ParsedDirectCreateClientQuoteBody = {
  source: "direct";
  organizationId: string;
  recipient:
    | { kind: "prospect"; prospectId: string }
    | { kind: "client" };
  contentLanguage?: unknown;
};

export type ParsedCreateClientQuoteBody =
  | ParsedEstimateCreateClientQuoteBody
  | ParsedDirectCreateClientQuoteBody;

export type ParsedUpdateClientQuoteBody = {
  draft: unknown;
  contentLanguage?: unknown;
  /** Present only when the caller explicitly requests USD or EUR. */
  currencyCode?: "USD" | "EUR";
};

export type ClientQuoteHttpFailure = {
  status: number;
  code: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldPresent(body: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => Object.hasOwn(body, key) && body[key] != null);
}

function readUuid(
  value: unknown,
  message: string,
): string | ClientQuoteHttpFailure {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    return { status: 400, code: "INVALID_BODY", message };
  }
  return value.trim();
}

export function parseCreateClientQuoteBody(
  body: unknown,
): ParsedCreateClientQuoteBody | ClientQuoteHttpFailure {
  if (!isRecord(body)) {
    return { status: 400, code: "INVALID_BODY", message: "Request body must be an object." };
  }
  const hasEstimate = fieldPresent(body, ["estimateId", "estimate_id"]);
  const hasOrganization = fieldPresent(body, ["organizationId", "organization_id"]);
  if (hasEstimate && hasOrganization) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "Request must include either estimateId or organizationId, not both.",
    };
  }
  if (!hasEstimate && !hasOrganization) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "Request must include estimateId or organizationId.",
    };
  }

  const contentLanguage = body.contentLanguage ?? body.content_language;
  const recipient = body.recipient;
  if (hasOrganization) {
    const organizationId = readUuid(
      body.organizationId ?? body.organization_id,
      "organizationId must be a UUID.",
    );
    if (typeof organizationId !== "string") return organizationId;
    if (
      !isRecord(recipient) ||
      (recipient.kind !== "prospect" && recipient.kind !== "client")
    ) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "recipient.kind must be client or prospect.",
      };
    }
    if (recipient.kind === "prospect") {
      const prospectId = readUuid(
        recipient.prospectId ?? recipient.prospect_id,
        "recipient.prospectId must be a UUID.",
      );
      if (typeof prospectId !== "string") return prospectId;
      return {
        source: "direct",
        organizationId,
        recipient: { kind: "prospect", prospectId },
        contentLanguage,
      };
    }
    return {
      source: "direct",
      organizationId,
      recipient: { kind: "client" },
      contentLanguage,
    };
  }

  const estimateId = readUuid(
    body.estimateId ?? body.estimate_id,
    "estimateId must be a UUID.",
  );
  if (typeof estimateId !== "string") return estimateId;
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
  if (recipient.kind === "prospect") {
    const prospectId = readUuid(
      recipient.prospectId ?? recipient.prospect_id,
      "recipient.prospectId must be a UUID.",
    );
    if (typeof prospectId !== "string") return prospectId;
    return {
      source: "estimate",
      estimateId,
      recipient: { kind: "prospect", prospectId },
      contentLanguage,
    };
  }
  if (recipient.kind === "removedProspect") {
    return {
      source: "estimate",
      estimateId,
      recipient: { kind: "removedProspect" },
      contentLanguage,
    };
  }
  return {
    source: "estimate",
    estimateId,
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
  const contentLanguage = body.contentLanguage ?? body.content_language;
  const hasCurrency =
    Object.hasOwn(body, "currencyCode") || Object.hasOwn(body, "currency_code");
  if (!hasCurrency) {
    return {
      draft: body.draft,
      contentLanguage,
    };
  }
  const raw = body.currencyCode ?? body.currency_code;
  if (typeof raw !== "string") {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "currencyCode must be USD or EUR.",
    };
  }
  const currencyCode = raw.trim().toUpperCase();
  if (currencyCode !== "USD" && currencyCode !== "EUR") {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "currencyCode must be USD or EUR.",
    };
  }
  return {
    draft: body.draft,
    contentLanguage,
    currencyCode,
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
