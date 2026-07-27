/**
 * Client-safe storage key builders for scoped Athena conversations.
 * Do not import node:crypto here — these modules are used by client islands.
 */

/** Fixed browser session key for Getting Started (no tenant fingerprint). */
export const GETTING_STARTED_CONVERSATION_STORAGE_KEY =
  "athena:getting-started-conversation:v1" as const;

export function buildIdentityConversationStorageKey(opaqueScope: string): string {
  return `athena:identity-conversation:v1:${opaqueScope}`;
}

/**
 * Getting Started uses a fixed storage key — no organization/user fingerprint.
 */
export function buildGettingStartedConversationStorageKey(): string {
  return GETTING_STARTED_CONVERSATION_STORAGE_KEY;
}
