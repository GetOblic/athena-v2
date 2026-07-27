/**
 * Browser sessionStorage helpers for scoped Athena conversations.
 * Pending responses are never persisted; malformed data is discarded.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  type AthenaConversationHistoryMessage,
} from "@/services/athenaConversation/athenaConversationTypes";

export const ATHENA_CONVERSATION_STORAGE_SCHEMA_VERSION = 1 as const;

export type AthenaConversationStoredState = {
  schemaVersion: typeof ATHENA_CONVERSATION_STORAGE_SCHEMA_VERSION;
  messages: AthenaConversationHistoryMessage[];
  updatedAt: string;
};

function isHistoryMessage(
  value: unknown,
): value is AthenaConversationHistoryMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const role = (value as { role?: unknown }).role;
  const content = (value as { content?: unknown }).content;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length <= ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength
  );
}

export function parseAthenaConversationStoredState(
  raw: string | null,
): AthenaConversationStoredState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== ATHENA_CONVERSATION_STORAGE_SCHEMA_VERSION) {
      return null;
    }
    if (!Array.isArray(record.messages)) {
      return null;
    }
    if (
      record.messages.length >
      ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount + 2
    ) {
      return null;
    }
    const messages = record.messages.filter(isHistoryMessage);
    if (messages.length !== record.messages.length) {
      return null;
    }

    const capped = messages.slice(
      -(ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount + 2),
    );

    return {
      schemaVersion: ATHENA_CONVERSATION_STORAGE_SCHEMA_VERSION,
      messages: capped,
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function readAthenaConversationSession(
  storage: Pick<Storage, "getItem" | "removeItem"> | null,
  storageKey: string,
): AthenaConversationStoredState | null {
  if (!storage || !storageKey) {
    return null;
  }
  const parsed = parseAthenaConversationStoredState(storage.getItem(storageKey));
  if (!parsed) {
    try {
      storage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return null;
  }
  return parsed;
}

export function writeAthenaConversationSession(
  storage: Pick<Storage, "setItem"> | null,
  storageKey: string,
  state: AthenaConversationStoredState,
): void {
  if (!storage || !storageKey) {
    return;
  }
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // QuotaExceededError / private-mode / disabled storage must not crash the panel.
  }
}

export function clearAthenaConversationSession(
  storage: Pick<Storage, "removeItem"> | null,
  storageKey: string,
): void {
  if (!storage || !storageKey) {
    return;
  }
  try {
    storage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
