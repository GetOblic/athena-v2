/**
 * Contained Identity Conversation service.
 * Read-only OpenRouter invocation — no Identity mutation, generation, or workers.
 *
 * Free Identity Ask gate (FREE-8):
 *   validation
 *   → determine plan
 *   → Free: verify Brain trained
 *   → Free: reserve allowance
 *   → assemble context
 *   → build prompt
 *   → provider
 *   → consume on successful non-empty provider result
 *
 * Denied Free requests never reach callGeminiViaOpenRouter.
 * Full requests never reserve or consume Free allowance.
 */

import { randomUUID } from "node:crypto";
import {
  FREE_IDENTITY_ASK_LIMIT,
  isFreeIdentityAskMetered,
  isFreeIdentityAskTrained,
} from "@/lib/organization/freeIdentityAsk";
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
import {
  getAthenaIdentityByUserId,
  type AthenaIdentity,
} from "@/services/identity/identityService";
import {
  consumeFreeIdentityAsk,
  releaseFreeIdentityAsk,
  reserveFreeIdentityAsk,
  type ReserveFreeIdentityAskResult,
} from "@/services/organization/freeIdentityAskAuthority";
import { resolveAthenaPlan } from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export {
  releaseScopedConversationSlot as releaseIdentityConversationSlot,
  resetScopedConversationConcurrencyForTests as resetIdentityConversationConcurrencyForTests,
  tryAcquireScopedConversationSlot as tryAcquireIdentityConversationSlot,
  validateAthenaConversationRequest as validateIdentityConversationRequest,
} from "@/services/athenaConversation/athenaConversationValidation";

export type IdentityConversationServiceDeps = {
  resolvePlan?: (organizationId: string) => Promise<AthenaPlan>;
  loadIdentity?: (
    userId: string,
    organizationId: string,
  ) => Promise<AthenaIdentity | null>;
  reserveAsk?: (
    organizationId: string,
    limit?: number,
  ) => Promise<ReserveFreeIdentityAskResult>;
  consumeAsk?: (organizationId: string) => Promise<void>;
  releaseAsk?: (organizationId: string) => Promise<void>;
  assembleContext?: typeof assembleIdentityConversationContext;
  buildPrompt?: typeof buildIdentityConversationPrompt;
  callProvider?: typeof callGeminiViaOpenRouter;
};

export async function runIdentityConversation(input: {
  organizationId: string;
  userId: string;
  body: unknown;
  requestId?: string;
  deps?: IdentityConversationServiceDeps;
}): Promise<{ result: AthenaConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateAthenaConversationRequest(input.body);
  const scopeKey = `identity:${input.userId}:${input.organizationId}`;
  const resolvePlan = input.deps?.resolvePlan ?? resolveAthenaPlan;
  const loadIdentity = input.deps?.loadIdentity ?? getAthenaIdentityByUserId;
  const reserveAsk = input.deps?.reserveAsk ?? reserveFreeIdentityAsk;
  const consumeAsk = input.deps?.consumeAsk ?? consumeFreeIdentityAsk;
  const releaseAsk = input.deps?.releaseAsk ?? releaseFreeIdentityAsk;
  const assembleContext =
    input.deps?.assembleContext ?? assembleIdentityConversationContext;
  const buildPrompt = input.deps?.buildPrompt ?? buildIdentityConversationPrompt;
  const callProvider = input.deps?.callProvider ?? callGeminiViaOpenRouter;

  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new AthenaConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for Identity.",
      429,
      { requestId, retryable: false },
    );
  }

  let reserved = false;
  try {
    const athenaPlan = await resolvePlan(input.organizationId);
    if (isFreeIdentityAskMetered(athenaPlan)) {
      const identity = await loadIdentity(input.userId, input.organizationId);
      if (!isFreeIdentityAskTrained({ identity })) {
        throw new AthenaConversationError(
          "FREE_IDENTITY_ASK_UNTRAINED",
          "Teach Athena about your business first.",
          403,
          { requestId, retryable: false },
        );
      }

      const reservation = await reserveAsk(
        input.organizationId,
        FREE_IDENTITY_ASK_LIMIT,
      );
      if (!reservation.acquired) {
        if (reservation.reason === "exhausted") {
          throw new AthenaConversationError(
            "FREE_IDENTITY_ASK_EXHAUSTED",
            "Athena has shown you what it understands.",
            403,
            { requestId, retryable: false },
          );
        }
        throw new AthenaConversationError(
          "RATE_LIMITED",
          "A conversation request is already in progress for Identity.",
          429,
          { requestId, retryable: true },
        );
      }
      reserved = true;
    }

    const assembled = await assembleContext({
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
      scope: "identity",
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
