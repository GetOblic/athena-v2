/**
 * Athena Estimate Ask Athena — synchronous conversation service.
 * Durable messages; Ready Estimate remains immutable. No generation jobs/workers.
 *
 * Message-pair persistence:
 * 1. Validate + authorize + load history + compose + call LLM
 * 2. raw provider reply
 *    → normalizeEstimateConversationPlainText
 *    → validate assistant response (empty/length)
 *    → forbidden-claim validation
 *    → atomic pair persist (NORMALIZED assistant content)
 * If provider fails, normalization is empty/meaningless, or validation rejects:
 * persist neither user nor assistant message.
 * If pair insert fails: MESSAGE_PERSISTENCE_FAILED; neither new row persists.
 * Estimate remains unchanged. No transaction framework / RPC.
 */

import { randomUUID } from "node:crypto";
import {
  callGeminiViaOpenRouter,
  hashStable,
} from "@/services/athenaConversation/athenaConversationProvider";
import { AthenaConversationError } from "@/services/athenaConversation/athenaConversationTypes";
import {
  releaseScopedConversationSlot,
  tryAcquireScopedConversationSlot,
} from "@/services/athenaConversation/athenaConversationValidation";
import {
  AthenaEstimateMessagePersistenceError,
  insertAthenaEstimateMessagePair,
  listAthenaEstimateMessages,
} from "@/services/estimate/athenaEstimateMessageService";
import { getAthenaEstimateByIdForLicensee } from "@/services/estimate/athenaEstimateService";
import { assistantReplyContainsForbiddenEstimateClaims } from "@/services/estimate/athenaEstimateValidation";
import {
  ESTIMATE_INSTRUCTION_NOT_CONFIGURED,
  getActiveEstimatePricingMethodologyInstruction,
} from "@/services/estimate/estimatePricingMethodologyInstruction";
import { assertLicenseeOwnsSubAccount } from "@/services/licensee/licenseeIdentity";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";
import {
  composeEstimateConversationContext,
  type ComposeEstimateConversationContextDeps,
} from "@/services/estimateConversation/estimateConversationContext";
import { normalizeEstimateConversationPlainText } from "@/services/estimateConversation/estimateConversationPlainText";
import { buildEstimateConversationPrompt } from "@/services/estimateConversation/estimateConversationPrompt";
import {
  boundEstimateConversationHistory,
  ESTIMATE_CONVERSATION_LIMITS,
  EstimateConversationError,
  toPublicEstimateConversationMessage,
  type EstimateConversationHistorySuccess,
  type EstimateConversationSendSuccess,
} from "@/services/estimateConversation/estimateConversationTypes";
import { validateEstimateConversationRequest } from "@/services/estimateConversation/estimateConversationValidation";

export type EstimateConversationServiceDeps = {
  getMethodology?: typeof getActiveEstimatePricingMethodologyInstruction;
  callProvider?: typeof callGeminiViaOpenRouter;
  contextDeps?: ComposeEstimateConversationContextDeps;
  listMessages?: typeof listAthenaEstimateMessages;
  insertMessagePair?: typeof insertAthenaEstimateMessagePair;
  getEstimate?: typeof getAthenaEstimateByIdForLicensee;
  requireMaster?: typeof requireLicenseeMasterAccount;
  assertRelationship?: typeof assertLicenseeOwnsSubAccount;
};

function mapProviderError(
  error: unknown,
  requestId: string,
): EstimateConversationError {
  if (error instanceof EstimateConversationError) {
    return error;
  }
  if (error instanceof AthenaConversationError) {
    return new EstimateConversationError(
      error.code,
      error.message,
      error.httpStatus,
      { retryable: error.retryable, requestId: error.requestId ?? requestId },
    );
  }
  return new EstimateConversationError(
    "PROVIDER_ERROR",
    "Athena could not complete the conversation response.",
    500,
    { requestId, retryable: false },
  );
}

function validateAssistantReplyShape(
  content: string,
  requestId: string,
): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new EstimateConversationError(
      "PROVIDER_ERROR",
      "Athena returned an empty response.",
      500,
      { requestId, retryable: false },
    );
  }
  if (trimmed.length > ESTIMATE_CONVERSATION_LIMITS.maxAssistantMessageLength) {
    throw new EstimateConversationError(
      "PROVIDER_ERROR",
      "Athena returned a response that exceeded the maximum length.",
      500,
      { requestId, retryable: false },
    );
  }
  return trimmed;
}

function assertAssistantReplyAllowed(
  content: string,
  requestId: string,
): void {
  if (assistantReplyContainsForbiddenEstimateClaims(content)) {
    throw new EstimateConversationError(
      "PROVIDER_ERROR",
      "Athena returned a response that could not be accepted.",
      500,
      { requestId, retryable: false },
    );
  }
}

/**
 * GET history — active Master ownership + visible Estimate.
 * Relationship and methodology are NOT required.
 */
export async function listEstimateConversationForMaster(input: {
  masterUserId: string;
  estimateId: string;
  deps?: EstimateConversationServiceDeps;
}): Promise<EstimateConversationHistorySuccess> {
  const requireMaster =
    input.deps?.requireMaster ?? requireLicenseeMasterAccount;
  const getEstimate = input.deps?.getEstimate ?? getAthenaEstimateByIdForLicensee;
  const listMessages = input.deps?.listMessages ?? listAthenaEstimateMessages;

  const masterAccount = await requireMaster(input.masterUserId);
  const estimate = await getEstimate(input.estimateId, masterAccount.id);
  if (!estimate) {
    throw new EstimateConversationError(
      "NOT_FOUND",
      "Estimate not found.",
      404,
    );
  }

  const messages = await listMessages({
    licenseeAccountId: masterAccount.id,
    estimateId: estimate.id,
  });

  return {
    ok: true,
    messages: messages.map(toPublicEstimateConversationMessage),
  };
}

/**
 * POST send — Ready + visible + current relationship + methodology + sync LLM.
 * Does not call Estimate writers / generation pipeline.
 */
export async function sendEstimateConversationForMaster(input: {
  masterUserId: string;
  estimateId: string;
  body: unknown;
  requestId?: string;
  deps?: EstimateConversationServiceDeps;
}): Promise<{
  result: EstimateConversationSendSuccess;
  requestId: string;
}> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateEstimateConversationRequest(input.body);

  const requireMaster =
    input.deps?.requireMaster ?? requireLicenseeMasterAccount;
  const getEstimate = input.deps?.getEstimate ?? getAthenaEstimateByIdForLicensee;
  const assertRelationship =
    input.deps?.assertRelationship ?? assertLicenseeOwnsSubAccount;
  const getMethodology =
    input.deps?.getMethodology ?? getActiveEstimatePricingMethodologyInstruction;
  const listMessages = input.deps?.listMessages ?? listAthenaEstimateMessages;
  const insertMessagePair =
    input.deps?.insertMessagePair ?? insertAthenaEstimateMessagePair;
  const callProvider = input.deps?.callProvider ?? callGeminiViaOpenRouter;

  const masterAccount = await requireMaster(input.masterUserId);
  const estimate = await getEstimate(input.estimateId, masterAccount.id);
  if (!estimate) {
    throw new EstimateConversationError(
      "NOT_FOUND",
      "Estimate not found.",
      404,
      { requestId },
    );
  }

  if (estimate.status !== "Ready" || !estimate.package_json) {
    throw new EstimateConversationError(
      "NOT_READY",
      "Ask Athena is available only for Ready Estimates.",
      409,
      { requestId },
    );
  }

  // Relationship gate BEFORE tenant intelligence load.
  await assertRelationship({
    masterUserId: input.masterUserId,
    organizationId: estimate.organization_id,
  });

  const methodology = await getMethodology();
  if (!methodology.configured || !methodology.instructionText.trim()) {
    throw new EstimateConversationError(
      ESTIMATE_INSTRUCTION_NOT_CONFIGURED,
      "Estimate pricing methodology is not configured by GetOblic Super Admin.",
      409,
      { requestId },
    );
  }

  const scopeKey = `estimate:${input.masterUserId}:${estimate.id}`;
  if (!tryAcquireScopedConversationSlot(scopeKey)) {
    throw new EstimateConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for this Estimate.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const persistedHistory = await listMessages({
      licenseeAccountId: masterAccount.id,
      estimateId: estimate.id,
    });
    const history = boundEstimateConversationHistory(persistedHistory);

    const assembled = await composeEstimateConversationContext({
      estimate,
      methodology,
      deps: input.deps?.contextDeps,
    });

    const built = buildEstimateConversationPrompt({
      assembled,
      history,
      userMessage: request.message,
    });

    const promptHash = hashStable(
      built.messages.map((m) => `${m.role}:${m.content.length}`).join("|"),
    );
    const contextHash = hashStable(String(built.contextCharCount));

    let assistantRaw: string;
    try {
      assistantRaw = await callProvider({
        messages: built.messages,
        requestId,
        organizationId: estimate.organization_id,
        scope: "estimate",
        promptHash,
        contextHash,
        promptCharCount: built.promptCharCount,
        contextCharCount: built.contextCharCount,
      });
    } catch (error) {
      throw mapProviderError(error, requestId);
    }

    // Required order: normalize → shape validate → forbidden-claim → persist.
    const assistantNormalized =
      normalizeEstimateConversationPlainText(assistantRaw);
    const assistantContent = validateAssistantReplyShape(
      assistantNormalized,
      requestId,
    );
    assertAssistantReplyAllowed(assistantContent, requestId);

    // Atomic pair insert only after a valid assistant reply exists.
    let assistantMessage;
    try {
      const pair = await insertMessagePair({
        estimateId: estimate.id,
        licenseeAccountId: masterAccount.id,
        organizationId: estimate.organization_id,
        userContent: request.message,
        assistantContent,
        maxUserContentLength: ESTIMATE_CONVERSATION_LIMITS.maxUserMessageLength,
        maxAssistantContentLength:
          ESTIMATE_CONVERSATION_LIMITS.maxAssistantMessageLength,
      });
      assistantMessage = pair.assistantMessage;
    } catch (error) {
      console.error("[ATHENA_ESTIMATE_CONVERSATION] pair_persist_failed", {
        estimateId: estimate.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new EstimateConversationError(
        "MESSAGE_PERSISTENCE_FAILED",
        "Conversation reply was generated but could not be saved.",
        500,
        { requestId, retryable: false },
      );
    }

    const result: EstimateConversationSendSuccess = {
      ok: true,
      message: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    };

    return { result, requestId };
  } catch (error) {
    if (error instanceof EstimateConversationError) {
      throw error;
    }
    if (error instanceof AthenaEstimateMessagePersistenceError) {
      throw new EstimateConversationError(
        "MESSAGE_PERSISTENCE_FAILED",
        "Failed to persist Estimate conversation messages.",
        500,
        { requestId, retryable: false },
      );
    }
    // LicenseeAccessError and other auth errors propagate to the route.
    if (
      error instanceof Error &&
      (error.name === "LicenseeAccessError" ||
        error.name === "LicenseeMasterProvisionBlockedError")
    ) {
      throw error;
    }
    console.error("[ATHENA_ESTIMATE_CONVERSATION] send_failed", {
      requestId,
      estimateId: input.estimateId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new EstimateConversationError(
      "INTERNAL_ERROR",
      "Conversation request failed.",
      500,
      { requestId, retryable: false },
    );
  } finally {
    releaseScopedConversationSlot(scopeKey);
  }
}

export {
  releaseScopedConversationSlot as releaseEstimateConversationSlot,
  resetScopedConversationConcurrencyForTests as resetEstimateConversationConcurrencyForTests,
  tryAcquireScopedConversationSlot as tryAcquireEstimateConversationSlot,
} from "@/services/athenaConversation/athenaConversationValidation";
