/**
 * Browser sessionStorage helpers for Prospect Conversation.
 * Pure + window-guarded — safe to unit test without DOM when injecting storage.
 */

import {
  PROSPECT_CONVERSATION_LIMITS,
  isProspectConversationAssetKind,
  type ProspectConversationAssetReference,
  type ProspectConversationHistoryMessage,
} from "@/services/prospectConversation/prospectConversationTypes";

export const PROSPECT_CONVERSATION_STORAGE_SCHEMA_VERSION = 1 as const;

export type ProspectConversationStoredState = {
  schemaVersion: typeof PROSPECT_CONVERSATION_STORAGE_SCHEMA_VERSION;
  prospectId: string;
  executiveVersionId: string | null;
  messages: ProspectConversationHistoryMessage[];
  assetReference: ProspectConversationAssetReference | null;
  updatedAt: string;
};

export function buildProspectConversationStorageKey(input: {
  prospectId: string;
  executiveVersionId: string | null;
}): string {
  const versionPart = input.executiveVersionId?.trim() || "no-version";
  return `athena:prospect-conversation:v1:${input.prospectId}:${versionPart}`;
}

function isHistoryMessage(
  value: unknown,
): value is ProspectConversationHistoryMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const role = (value as { role?: unknown }).role;
  const content = (value as { content?: unknown }).content;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length <= PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageLength
  );
}

export function parseProspectConversationStoredState(
  raw: string | null,
  expected: { prospectId: string; executiveVersionId: string | null },
): ProspectConversationStoredState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== PROSPECT_CONVERSATION_STORAGE_SCHEMA_VERSION) {
      return null;
    }
    if (record.prospectId !== expected.prospectId) {
      return null;
    }
    const storedVersion =
      record.executiveVersionId == null
        ? null
        : typeof record.executiveVersionId === "string"
          ? record.executiveVersionId
          : null;
    if (storedVersion !== expected.executiveVersionId) {
      return null;
    }
    if (!Array.isArray(record.messages)) {
      return null;
    }
    if (
      record.messages.length >
      PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageCount + 2
    ) {
      return null;
    }
    const messages = record.messages.filter(isHistoryMessage);
    if (messages.length !== record.messages.length) {
      return null;
    }

    let assetReference: ProspectConversationAssetReference | null = null;
    if (record.assetReference != null) {
      if (
        typeof record.assetReference !== "object" ||
        Array.isArray(record.assetReference)
      ) {
        return null;
      }
      const ref = record.assetReference as Record<string, unknown>;
      if (
        !isProspectConversationAssetKind(ref.kind) ||
        typeof ref.key !== "string" ||
        !ref.key.trim()
      ) {
        return null;
      }
      assetReference = { kind: ref.kind, key: ref.key.trim() };
    }

    const capped = messages.slice(
      -(PROSPECT_CONVERSATION_LIMITS.maxHistoryMessageCount + 2),
    );

    return {
      schemaVersion: PROSPECT_CONVERSATION_STORAGE_SCHEMA_VERSION,
      prospectId: expected.prospectId,
      executiveVersionId: expected.executiveVersionId,
      messages: capped,
      assetReference,
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function readProspectConversationSession(
  storage: Pick<Storage, "getItem" | "removeItem"> | null,
  input: { prospectId: string; executiveVersionId: string | null },
): ProspectConversationStoredState | null {
  if (!storage) {
    return null;
  }
  const key = buildProspectConversationStorageKey(input);
  const parsed = parseProspectConversationStoredState(
    storage.getItem(key),
    input,
  );
  if (!parsed) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
  return parsed;
}

export function writeProspectConversationSession(
  storage: Pick<Storage, "setItem"> | null,
  state: ProspectConversationStoredState,
): void {
  if (!storage) {
    return;
  }
  const key = buildProspectConversationStorageKey({
    prospectId: state.prospectId,
    executiveVersionId: state.executiveVersionId,
  });
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // QuotaExceededError / private-mode / disabled storage must not crash the panel.
  }
}

export function clearProspectConversationSession(
  storage: Pick<Storage, "removeItem"> | null,
  input: { prospectId: string; executiveVersionId: string | null },
): void {
  if (!storage) {
    return;
  }
  storage.removeItem(buildProspectConversationStorageKey(input));
}
