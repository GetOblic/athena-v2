/**
 * Browser sessionStorage helpers for Persona Ask Athena.
 * Persistence decision: session-only (no Persona chat DB table).
 */

import {
  PERSONA_CONVERSATION_LIMITS,
  type PersonaConversationHistoryMessage,
} from "@/services/personaConversation/personaConversationTypes";

export const PERSONA_CONVERSATION_STORAGE_SCHEMA_VERSION = 1 as const;

export type PersonaConversationStoredState = {
  schemaVersion: typeof PERSONA_CONVERSATION_STORAGE_SCHEMA_VERSION;
  personaId: string;
  executiveVersionId: string | null;
  messages: PersonaConversationHistoryMessage[];
  updatedAt: string;
};

export function buildPersonaConversationStorageKey(input: {
  personaId: string;
  executiveVersionId: string | null;
}): string {
  const versionPart = input.executiveVersionId?.trim() || "no-version";
  return `athena:persona-conversation:v1:${input.personaId}:${versionPart}`;
}

export function readPersonaConversationSession(
  storage: Storage | null,
  expected: { personaId: string; executiveVersionId: string | null },
): PersonaConversationStoredState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(buildPersonaConversationStorageKey(expected));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== PERSONA_CONVERSATION_STORAGE_SCHEMA_VERSION) {
      return null;
    }
    if (record.personaId !== expected.personaId) return null;
    const storedVersion =
      record.executiveVersionId == null
        ? null
        : typeof record.executiveVersionId === "string"
          ? record.executiveVersionId
          : null;
    if (storedVersion !== expected.executiveVersionId) return null;
    if (!Array.isArray(record.messages)) return null;
    const messages = record.messages.filter((item): item is PersonaConversationHistoryMessage => {
      if (!item || typeof item !== "object") return false;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.length <= PERSONA_CONVERSATION_LIMITS.maxHistoryMessageLength
      );
    });
    return {
      schemaVersion: PERSONA_CONVERSATION_STORAGE_SCHEMA_VERSION,
      personaId: expected.personaId,
      executiveVersionId: expected.executiveVersionId,
      messages: messages.slice(
        -PERSONA_CONVERSATION_LIMITS.maxHistoryMessageCount,
      ),
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writePersonaConversationSession(
  storage: Storage | null,
  state: Omit<PersonaConversationStoredState, "schemaVersion" | "updatedAt">,
): void {
  if (!storage) return;
  const payload: PersonaConversationStoredState = {
    schemaVersion: PERSONA_CONVERSATION_STORAGE_SCHEMA_VERSION,
    personaId: state.personaId,
    executiveVersionId: state.executiveVersionId,
    messages: state.messages.slice(
      -PERSONA_CONVERSATION_LIMITS.maxHistoryMessageCount,
    ),
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(
    buildPersonaConversationStorageKey(state),
    JSON.stringify(payload),
  );
}

export function clearPersonaConversationSession(
  storage: Storage | null,
  input: { personaId: string; executiveVersionId: string | null },
): void {
  if (!storage) return;
  storage.removeItem(buildPersonaConversationStorageKey(input));
}
