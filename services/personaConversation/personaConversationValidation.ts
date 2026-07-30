/**
 * Request validation and in-process concurrency for Persona Ask Athena.
 */

import {
  PERSONA_CONVERSATION_LIMITS,
  PersonaConversationError,
  type PersonaConversationHistoryMessage,
  type PersonaConversationRequest,
} from "@/services/personaConversation/personaConversationTypes";

const activeSlots = new Map<string, true>();

function slotKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

function normalizeHistory(
  history: unknown,
): PersonaConversationHistoryMessage[] {
  if (!Array.isArray(history)) {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      "history must be an array.",
      400,
    );
  }

  if (history.length > PERSONA_CONVERSATION_LIMITS.maxHistoryMessageCount) {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      `history may contain at most ${PERSONA_CONVERSATION_LIMITS.maxHistoryMessageCount} messages.`,
      400,
    );
  }

  let totalChars = 0;
  const normalized: PersonaConversationHistoryMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        "Each history item must be an object.",
        400,
      );
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        "history roles must be user or assistant.",
        400,
      );
    }
    if (typeof content !== "string") {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        "history content must be a string.",
        400,
      );
    }
    if (content.length > PERSONA_CONVERSATION_LIMITS.maxHistoryMessageLength) {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        `Each history message must be at most ${PERSONA_CONVERSATION_LIMITS.maxHistoryMessageLength} characters.`,
        400,
      );
    }
    totalChars += content.length;
    if (totalChars > PERSONA_CONVERSATION_LIMITS.maxHistoryTotalChars) {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        "Combined history exceeds the maximum character limit.",
        400,
      );
    }
    normalized.push({ role, content });
  }

  return normalized;
}

export function validatePersonaConversationRequest(
  body: unknown,
): PersonaConversationRequest {
  if (!body || typeof body !== "object") {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;

  const forbiddenKeys = [
    "organizationId",
    "organization_id",
    "persona",
    "personaContent",
    "personaId",
    "discussionId",
    "systemPrompt",
    "model",
    "temperature",
    "blueprintBody",
    "deploymentAssetBody",
  ];
  for (const key of forbiddenKeys) {
    if (key in record) {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        `Client may not supply ${key}.`,
        400,
      );
    }
  }

  if (typeof record.message !== "string") {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      "message must be a string.",
      400,
    );
  }
  const message = record.message.trim();
  if (!message) {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      "message must not be empty.",
      400,
    );
  }
  if (message.length > PERSONA_CONVERSATION_LIMITS.maxUserMessageLength) {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      `message must be at most ${PERSONA_CONVERSATION_LIMITS.maxUserMessageLength} characters.`,
      400,
    );
  }

  const history = normalizeHistory(record.history ?? []);

  let executiveVersionId: string | null = null;
  if (record.executiveVersionId != null) {
    if (typeof record.executiveVersionId !== "string") {
      throw new PersonaConversationError(
        "VALIDATION_ERROR",
        "executiveVersionId must be a string when provided.",
        400,
      );
    }
    executiveVersionId = record.executiveVersionId.trim() || null;
  }

  return { message, history, executiveVersionId };
}

export function tryAcquireConversationSlot(
  userId: string,
  personaId: string,
): boolean {
  const key = slotKey(userId, personaId);
  if (activeSlots.has(key)) return false;
  activeSlots.set(key, true);
  return true;
}

export function releaseConversationSlot(
  userId: string,
  personaId: string,
): void {
  activeSlots.delete(slotKey(userId, personaId));
}

export function resetConversationConcurrencyForTests(): void {
  activeSlots.clear();
}
