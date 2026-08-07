/**
 * Client-safe key lists for Master ↔ sub-account handoff storage clearing.
 * Do not import server-only modules here.
 */

/** Fixed keys (not org-scoped) that can leak conversation content. */
export const LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS = [
  "athena:getting-started-conversation:v1",
] as const;

/**
 * Prefixes that may contain intelligence/UI state.
 * Entity UUID isolation is insufficient when the same browser switches tenants.
 */
export const LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES = [
  "athena:identity-conversation:v1:",
  "athena:persona-conversation:v1:",
  "athena:prospect-conversation:v1:",
  "athena-regeneration:",
  "athena-regeneration-autoselect-current:",
  "athena:getoblic-links:v1:",
] as const;
