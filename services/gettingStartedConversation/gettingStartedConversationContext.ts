/**
 * Read-only Getting Started conversation context assembler.
 * Loads only server-owned product context — no Identity business data,
 * Prospects, Executive Versions, or asset bodies.
 */

import { truncateText } from "@/services/athenaConversation/athenaConversationPromptShared";
import type { AthenaConversationContextSection } from "@/services/athenaConversation/athenaConversationTypes";
import {
  GETTING_STARTED_PRODUCT_CONTEXT_VERSION,
  formatGettingStartedProductContext,
} from "@/services/gettingStartedConversation/gettingStartedProductContext";
import {
  GETTING_STARTED_CONVERSATION_LIMITS,
  type GettingStartedConversationAssembledContext,
} from "@/services/gettingStartedConversation/gettingStartedConversationTypes";

export type AssembleGettingStartedConversationContextInput = {
  organizationId: string;
  userId: string;
};

/**
 * Assembles product-guidance context only.
 * organizationId/userId authenticate tenant scope but are not embedded in prompt content.
 */
export function assembleGettingStartedConversationContext(
  input: AssembleGettingStartedConversationContextInput,
): GettingStartedConversationAssembledContext {
  // Auth/tenant context is required by the route; identifiers are intentionally
  // not embedded in product-guidance prompt content.
  void input.organizationId;
  void input.userId;

  const sections: AthenaConversationContextSection[] = [];
  const missingNotes: string[] = [];

  const productContext = truncateText(
    formatGettingStartedProductContext(),
    GETTING_STARTED_CONVERSATION_LIMITS.maxProductContextChars,
  );

  if (productContext) {
    sections.push({
      type: "ATHENA_PRODUCT_CONTEXT",
      trust: "server_product_context",
      label: `Athena product context (${GETTING_STARTED_PRODUCT_CONTEXT_VERSION})`,
      content: productContext,
    });
  } else {
    missingNotes.push("Authoritative product context is unavailable.");
  }

  return { sections, missingNotes };
}
