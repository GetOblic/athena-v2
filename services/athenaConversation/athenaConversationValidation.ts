/**
 * Shared request validation and in-process concurrency for scoped conversations.
 * Pure module — no DB / provider imports.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  AthenaConversationError,
  type AthenaConversationHistoryMessage,
  type AthenaConversationRequest,
} from "@/services/athenaConversation/athenaConversationTypes";

/** Keys the browser must never supply for Identity / Getting Started. */
export const ATHENA_CONVERSATION_FORBIDDEN_KEYS = [
  "organizationId",
  "organization_id",
  "userId",
  "user_id",
  "prospectId",
  "prospect_id",
  "executiveVersionId",
  "assetReference",
  "model",
  "systemPrompt",
  "instructions",
  "context",
  "identity",
  "voice",
  "knowledge",
  "websiteContent",
  "deepScrape",
  "productContext",
  "provider",
  "temperature",
  "maxTokens",
  "prospect",
  "prospectContent",
  "organizationKnowledge",
  "websiteScrape",
  "blueprintBody",
  "deploymentAssetBody",
  "assetTitle",
  "assetContent",
] as const;

function normalizeHistory(
  history: unknown,
): AthenaConversationHistoryMessage[] {
  if (!Array.isArray(history)) {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      "history must be an array.",
      400,
    );
  }

  if (history.length > ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount) {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      `history may contain at most ${ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount} messages.`,
      400,
    );
  }

  let totalChars = 0;
  const normalized: AthenaConversationHistoryMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        "Each history item must be an object.",
        400,
      );
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        "history roles must be user or assistant.",
        400,
      );
    }
    if (typeof content !== "string") {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        "history content must be a string.",
        400,
      );
    }
    if (content.length > ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength) {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        `Each history message must be at most ${ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength} characters.`,
        400,
      );
    }
    totalChars += content.length;
    if (totalChars > ATHENA_CONVERSATION_LIMITS.maxHistoryTotalChars) {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        "Combined history exceeds the maximum character limit.",
        400,
      );
    }
    normalized.push({ role, content });
  }

  return normalized;
}

export function validateAthenaConversationRequest(
  body: unknown,
): AthenaConversationRequest {
  if (!body || typeof body !== "object") {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;

  for (const key of ATHENA_CONVERSATION_FORBIDDEN_KEYS) {
    if (key in record) {
      throw new AthenaConversationError(
        "VALIDATION_ERROR",
        `Client may not supply ${key}.`,
        400,
      );
    }
  }

  if (typeof record.message !== "string") {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      "message must be a string.",
      400,
    );
  }
  const message = record.message.trim();
  if (!message) {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      "message must not be empty.",
      400,
    );
  }
  if (message.length > ATHENA_CONVERSATION_LIMITS.maxUserMessageLength) {
    throw new AthenaConversationError(
      "VALIDATION_ERROR",
      `message must be at most ${ATHENA_CONVERSATION_LIMITS.maxUserMessageLength} characters.`,
      400,
    );
  }

  const history = normalizeHistory(record.history ?? []);

  return {
    message,
    history,
  };
}

const activeRequests = new Map<string, number>();

export function tryAcquireScopedConversationSlot(scopeKey: string): boolean {
  const current = activeRequests.get(scopeKey) ?? 0;
  if (current >= ATHENA_CONVERSATION_LIMITS.maxConcurrentPerUserScope) {
    return false;
  }
  activeRequests.set(scopeKey, current + 1);
  return true;
}

export function releaseScopedConversationSlot(scopeKey: string): void {
  const current = activeRequests.get(scopeKey) ?? 0;
  if (current <= 1) {
    activeRequests.delete(scopeKey);
    return;
  }
  activeRequests.set(scopeKey, current - 1);
}

export function resetScopedConversationConcurrencyForTests(): void {
  activeRequests.clear();
}
