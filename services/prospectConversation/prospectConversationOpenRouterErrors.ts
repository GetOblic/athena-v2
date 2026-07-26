/**
 * Contained OpenRouter HTTP failure mapping for prospect conversation only.
 * Pure module — no DB / shared openrouter imports.
 */

import { ProspectConversationError } from "@/services/prospectConversation/prospectConversationTypes";

export function mapOpenRouterHttpFailure(
  status: number,
  requestId: string,
): ProspectConversationError {
  if (status === 429) {
    return new ProspectConversationError(
      "PROVIDER_RATE_LIMITED",
      "Athena could not complete the conversation response.",
      429,
      { requestId, retryable: true },
    );
  }

  if (status >= 500) {
    return new ProspectConversationError(
      "PROVIDER_ERROR",
      "Athena could not complete the conversation response.",
      status >= 600 ? 502 : status,
      { requestId, retryable: true },
    );
  }

  return new ProspectConversationError(
    "PROVIDER_ERROR",
    "Athena could not complete the conversation response.",
    500,
    { requestId, retryable: false },
  );
}
