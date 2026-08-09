/**
 * Request validation for Estimate Ask Athena.
 * Client may supply message only — history/org/methodology are server-owned.
 */

import {
  ESTIMATE_CONVERSATION_LIMITS,
  EstimateConversationError,
  type EstimateConversationRequest,
} from "@/services/estimateConversation/estimateConversationTypes";

/** Keys the browser must never supply as authority for Estimate conversation. */
export const ESTIMATE_CONVERSATION_FORBIDDEN_KEYS = [
  "organizationId",
  "organization_id",
  "licenseeAccountId",
  "licensee_account_id",
  "estimateId",
  "estimate_id",
  "history",
  "messages",
  "role",
  "methodology",
  "instruction",
  "instructionText",
  "package",
  "package_json",
  "request_json",
  "model",
  "systemPrompt",
  "instructions",
  "context",
  "provider",
  "temperature",
  "maxTokens",
  "provenance",
  "status",
] as const;

export function validateEstimateConversationRequest(
  body: unknown,
): EstimateConversationRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new EstimateConversationError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;

  for (const key of ESTIMATE_CONVERSATION_FORBIDDEN_KEYS) {
    if (key in record) {
      throw new EstimateConversationError(
        "VALIDATION_ERROR",
        `Client may not supply ${key}.`,
        400,
      );
    }
  }

  if (typeof record.message !== "string") {
    throw new EstimateConversationError(
      "VALIDATION_ERROR",
      "message must be a string.",
      400,
    );
  }

  const message = record.message.trim();
  if (!message) {
    throw new EstimateConversationError(
      "VALIDATION_ERROR",
      "message must not be empty.",
      400,
    );
  }

  if (message.length > ESTIMATE_CONVERSATION_LIMITS.maxUserMessageLength) {
    throw new EstimateConversationError(
      "VALIDATION_ERROR",
      `message must be at most ${ESTIMATE_CONVERSATION_LIMITS.maxUserMessageLength} characters.`,
      400,
    );
  }

  return { message };
}
