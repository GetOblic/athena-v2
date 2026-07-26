/**
 * Request validation and in-process concurrency for Prospect Conversation.
 * Pure module — no DB / provider imports.
 */

import {
  PROSPECT_CONVERSATION_LIMITS,
  ProspectConversationError,
  isProspectConversationAssetKind,
  type ProspectConversationAssetReference,
  type ProspectConversationHistoryMessage,
  type ProspectConversationRequest,
} from "@/services/prospectConversation/prospectConversationTypes";

function normalizeHistory(
  history: unknown,
): ProspectConversationHistoryMessage[] {
  if (!Array.isArray(history)) {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      "history must be an array.",
      400,
    );
  }

  if (history.length > PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageCount) {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      `history may contain at most ${PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageCount} messages.`,
      400,
    );
  }

  let totalChars = 0;
  const normalized: ProspectConversationHistoryMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "Each history item must be an object.",
        400,
      );
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "history roles must be user or assistant.",
        400,
      );
    }
    if (typeof content !== "string") {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "history content must be a string.",
        400,
      );
    }
    if (content.length > PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageLength) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        `Each history message must be at most ${PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageLength} characters.`,
        400,
      );
    }
    totalChars += content.length;
    if (totalChars > PROSPECT_CONVERSATION_LIMITS.maxHistoryTotalChars) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "Combined history exceeds the maximum character limit.",
        400,
      );
    }
    normalized.push({ role, content });
  }

  return normalized;
}

export function validateProspectConversationRequest(
  body: unknown,
): ProspectConversationRequest {
  if (!body || typeof body !== "object") {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;

  const forbiddenKeys = [
    "organizationId",
    "organization_id",
    "prospect",
    "prospectContent",
    "organizationKnowledge",
    "websiteContent",
    "websiteScrape",
    "blueprintBody",
    "deploymentAssetBody",
    "assetTitle",
    "assetContent",
    "model",
    "systemPrompt",
    "temperature",
  ];
  for (const key of forbiddenKeys) {
    if (key in record) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        `Client may not supply ${key}.`,
        400,
      );
    }
  }

  if (typeof record.message !== "string") {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      "message must be a string.",
      400,
    );
  }
  const message = record.message.trim();
  if (!message) {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      "message must not be empty.",
      400,
    );
  }
  if (message.length > PROSPECT_CONVERSATION_LIMITS.maxUserMessageLength) {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      `message must be at most ${PROSPECT_CONVERSATION_LIMITS.maxUserMessageLength} characters.`,
      400,
    );
  }

  const history = normalizeHistory(record.history ?? []);

  let executiveVersionId: string | null = null;
  if (record.executiveVersionId != null) {
    if (typeof record.executiveVersionId !== "string") {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "executiveVersionId must be a string or null.",
        400,
      );
    }
    const trimmed = record.executiveVersionId.trim();
    executiveVersionId = trimmed || null;
  }

  let assetReference: ProspectConversationAssetReference | undefined;
  if (record.assetReference != null) {
    if (
      typeof record.assetReference !== "object" ||
      Array.isArray(record.assetReference)
    ) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "assetReference must be an object.",
        400,
      );
    }
    const ref = record.assetReference as Record<string, unknown>;
    if ("content" in ref || "title" in ref || "body" in ref) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "assetReference may not include content or title.",
        400,
      );
    }
    if (!isProspectConversationAssetKind(ref.kind)) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "assetReference.kind must be deployment or blueprint.",
        400,
      );
    }
    if (typeof ref.key !== "string" || !ref.key.trim()) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "assetReference.key must be a non-empty string.",
        400,
      );
    }
    if (!executiveVersionId) {
      throw new ProspectConversationError(
        "VALIDATION_ERROR",
        "assetReference requires executiveVersionId.",
        400,
      );
    }
    assetReference = { kind: ref.kind, key: ref.key.trim() };
  }

  return {
    message,
    history,
    executiveVersionId,
    assetReference,
  };
}

const activeRequests = new Map<string, number>();

export function tryAcquireConversationSlot(
  userId: string,
  prospectId: string,
): boolean {
  const key = `${userId}:${prospectId}`;
  const current = activeRequests.get(key) ?? 0;
  if (current >= PROSPECT_CONVERSATION_LIMITS.maxConcurrentPerUserProspect) {
    return false;
  }
  activeRequests.set(key, current + 1);
  return true;
}

export function releaseConversationSlot(
  userId: string,
  prospectId: string,
): void {
  const key = `${userId}:${prospectId}`;
  const current = activeRequests.get(key) ?? 0;
  if (current <= 1) {
    activeRequests.delete(key);
    return;
  }
  activeRequests.set(key, current - 1);
}

export function resetConversationConcurrencyForTests(): void {
  activeRequests.clear();
}
