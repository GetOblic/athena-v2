/**
 * Contained Getting Started Conversation service.
 * Product-guidance only — no Identity business load, generation, or workers.
 *
 * Free Help Ask gate (FREE-12):
 *   validation
 *   → acquire existing request/rate slot
 *   → determine plan
 *   → Free: reserve allowance
 *   → assemble context
 *   → build prompt
 *   → provider
 *   → consume on successful non-empty provider result
 *
 * Denied Free requests never reach callGeminiViaOpenRouter.
 * Full requests never reserve or consume Free Help allowance.
 * Separate from FREE-8 Identity Ask counters.
 */

import { randomUUID } from "node:crypto";
import {
  FREE_HELP_ASK_LIMIT,
  isFreeHelpAskMetered,
} from "@/lib/organization/freeHelpAsk";
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
import {
  consumeFreeHelpAsk,
  releaseFreeHelpAsk,
  reserveFreeHelpAsk,
  type ReserveFreeHelpAskResult,
} from "@/services/organization/freeHelpAskAuthority";
import { resolveAthenaPlan } from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export {
  releaseScopedConversationSlot as releaseGettingStartedConversationSlot,
  resetScopedConversationConcurrencyForTests as resetGettingStartedConversationConcurrencyForTests,
  tryAcquireScopedConversationSlot as tryAcquireGettingStartedConversationSlot,
  validateAthenaConversationRequest as validateGettingStartedConversationRequest,
} from "@/services/athenaConversation/athenaConversationValidation";

export type GettingStartedConversationServiceDeps = {
  resolvePlan?: (organizationId: string) => Promise<AthenaPlan>;
  reserveAsk?: (
    organizationId: string,
    limit?: number,
  ) => Promise<ReserveFreeHelpAskResult>;
  consumeAsk?: (organizationId: string) => Promise<void>;
  releaseAsk?: (organizationId: string) => Promise<void>;
  assembleContext?: typeof assembleGettingStartedConversationContext;
  buildPrompt?: typeof buildGettingStartedConversationPrompt;
  callProvider?: typeof callGeminiViaOpenRouter;
};

export async function runGettingStartedConversation(input: {
  organizationId: string;
  userId: string;
  body: unknown;
  requestId?: string;
  deps?: GettingStartedConversationServiceDeps;
}): Promise<{ result: AthenaConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateAthenaConversationRequest(input.body);
  const scopeKey = `getting-started:${input.userId}:${input.organizationId}`;
  const resolvePlan = input.deps?.resolvePlan ?? resolveAthenaPlan;
  const reserveAsk = input.deps?.reserveAsk ?? reserveFreeHelpAsk;
  const consumeAsk = input.deps?.consumeAsk ?? consumeFreeHelpAsk;
  const releaseAsk = input.deps?.releaseAsk ?? releaseFreeHelpAsk;
  const assembleContext =
    input.deps?.assembleContext ?? assembleGettingStartedConversationContext;
  const buildPrompt =
    input.deps?.buildPrompt ?? buildGettingStartedConversationPrompt;
  const callProvider = input.deps?.callProvider ?? callGeminiViaOpenRouter;

  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new AthenaConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for Getting Started.",
      429,
      { requestId, retryable: false },
    );
  }

  let reserved = false;
  try {
    const athenaPlan = await resolvePlan(input.organizationId);
    if (isFreeHelpAskMetered(athenaPlan)) {
      const reservation = await reserveAsk(
        input.organizationId,
        FREE_HELP_ASK_LIMIT,
      );
      if (!reservation.acquired) {
        if (reservation.reason === "exhausted") {
          throw new AthenaConversationError(
            "FREE_HELP_ASK_EXHAUSTED",
            "Athena has answered your question.",
            403,
            { requestId, retryable: false },
          );
        }
        throw new AthenaConversationError(
          "RATE_LIMITED",
          "A conversation request is already in progress for Getting Started.",
          429,
          { requestId, retryable: true },
        );
      }
      reserved = true;
    }

    const assembled = assembleContext({
      organizationId: input.organizationId,
      userId: input.userId,
    });

    const built = buildPrompt({
      assembled,
      history: request.history,
      userMessage: request.message,
    });

    const promptHash = hashStable(
      built.messages.map((m) => `${m.role}:${m.content.length}`).join("|"),
    );
    const contextHash = hashStable(String(built.contextCharCount));

    const assistantContent = await callProvider({
      messages: built.messages,
      requestId,
      organizationId: input.organizationId,
      scope: "getting-started",
      promptHash,
      contextHash,
      promptCharCount: built.promptCharCount,
      contextCharCount: built.contextCharCount,
    });

    if (!assistantContent.trim()) {
      throw new AthenaConversationError(
        "PROVIDER_ERROR",
        "Athena returned an empty response.",
        500,
        { requestId, retryable: false },
      );
    }

    if (reserved) {
      await consumeAsk(input.organizationId);
      reserved = false;
    }

    const result: AthenaConversationSuccessResult = {
      ok: true,
      message: {
        role: "assistant",
        content: assistantContent,
      },
    };

    return { result, requestId };
  } catch (error) {
    if (reserved) {
      await releaseAsk(input.organizationId);
    }
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
