/**
 * Contained Getting Started Conversation service.
 * Product-guidance only — no Identity business load, generation, or workers.
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
import { assembleGettingStartedConversationContext } from "@/services/gettingStartedConversation/gettingStartedConversationContext";
import { buildGettingStartedConversationPrompt } from "@/services/gettingStartedConversation/gettingStartedConversationPrompt";

export {
  releaseScopedConversationSlot as releaseGettingStartedConversationSlot,
  resetScopedConversationConcurrencyForTests as resetGettingStartedConversationConcurrencyForTests,
  tryAcquireScopedConversationSlot as tryAcquireGettingStartedConversationSlot,
  validateAthenaConversationRequest as validateGettingStartedConversationRequest,
} from "@/services/athenaConversation/athenaConversationValidation";

export async function runGettingStartedConversation(input: {
  organizationId: string;
  userId: string;
  body: unknown;
  requestId?: string;
}): Promise<{ result: AthenaConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateAthenaConversationRequest(input.body);
  const scopeKey = `getting-started:${input.userId}:${input.organizationId}`;

  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new AthenaConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for Getting Started.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const assembled = assembleGettingStartedConversationContext({
      organizationId: input.organizationId,
      userId: input.userId,
    });

    const built = buildGettingStartedConversationPrompt({
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
      scope: "getting-started",
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
