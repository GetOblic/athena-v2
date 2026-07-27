/**
 * Contained Identity Conversation service.
 * Read-only OpenRouter invocation — no Identity mutation, generation, or workers.
 */

import { randomUUID } from "node:crypto";
import {
  callGeminiViaOpenRouter,
  hashStable,
} from "@/services/athenaConversation/athenaConversationProvider";
import {
  AthenaConversationError,
  type AthenaConversationResult,
  type AthenaConversationSuccessResult,
} from "@/services/athenaConversation/athenaConversationTypes";
import {
  releaseScopedConversationSlot,
  tryAcquireScopedConversationSlot,
  validateAthenaConversationRequest,
} from "@/services/athenaConversation/athenaConversationValidation";
import { assembleIdentityConversationContext } from "@/services/identityConversation/identityConversationContext";
import { buildIdentityConversationPrompt } from "@/services/identityConversation/identityConversationPrompt";

export {
  releaseScopedConversationSlot as releaseIdentityConversationSlot,
  resetScopedConversationConcurrencyForTests as resetIdentityConversationConcurrencyForTests,
  tryAcquireScopedConversationSlot as tryAcquireIdentityConversationSlot,
  validateAthenaConversationRequest as validateIdentityConversationRequest,
} from "@/services/athenaConversation/athenaConversationValidation";

export async function runIdentityConversation(input: {
  organizationId: string;
  userId: string;
  body: unknown;
  requestId?: string;
}): Promise<{ result: AthenaConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateAthenaConversationRequest(input.body);
  const scopeKey = `identity:${input.userId}:${input.organizationId}`;

  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new AthenaConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for Identity.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const assembled = await assembleIdentityConversationContext({
      organizationId: input.organizationId,
      userId: input.userId,
    });

    const built = buildIdentityConversationPrompt({
      assembled,
      history: request.history,
      userMessage: request.message,
    });

    const promptHash = hashStable(
      built.messages.map((m) => `${m.role}:${m.content.length}`).join("|"),
    );
    const contextHash = hashStable(String(built.contextCharCount));

    const assistantContent = await callGeminiViaOpenRouter({
      messages: built.messages,
      requestId,
      organizationId: input.organizationId,
      scope: "identity",
      promptHash,
      contextHash,
      promptCharCount: built.promptCharCount,
      contextCharCount: built.contextCharCount,
    });

    const result: AthenaConversationSuccessResult = {
      ok: true,
      message: {
        role: "assistant",
        content: assistantContent,
      },
    };

    return { result, requestId };
  } catch (error) {
    if (error instanceof AthenaConversationError && !error.requestId) {
      throw new AthenaConversationError(
        error.code,
        error.message,
        error.httpStatus,
        { retryable: error.retryable, requestId },
      );
    }
    throw error;
  } finally {
    releaseScopedConversationSlot(scopeKey);
  }
}
