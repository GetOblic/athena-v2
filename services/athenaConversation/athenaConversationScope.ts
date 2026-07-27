/**
 * Opaque browser-storage scope fingerprints (server-only).
 * Never expose raw organization or user identifiers in sessionStorage keys.
 */

import { createHash } from "node:crypto";
import {
  buildGettingStartedConversationStorageKey,
  buildIdentityConversationStorageKey,
} from "@/services/athenaConversation/athenaConversationStorageKeys";

export type AthenaConversationScopeKind = "identity" | "getting-started";

export {
  buildGettingStartedConversationStorageKey,
  buildIdentityConversationStorageKey,
};

/**
 * Deterministic opaque fingerprint derived from authenticated tenant context.
 * Truncated deterministic hash used only for browser-session namespacing.
 * Server-only — pass the result to client components as an opaque prop.
 */
export function buildConversationScopeFingerprint(input: {
  scope: AthenaConversationScopeKind;
  organizationId: string;
  userId: string;
}): string {
  return createHash("sha256")
    .update(
      `athena:conversation-scope:v1:${input.scope}:${input.organizationId}:${input.userId}`,
    )
    .digest("hex")
    .slice(0, 16);
}
