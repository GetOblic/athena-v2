/**
 * Contained Prospect Conversation OpenRouter invocation.
 * Uses google/gemini-2.5-flash explicitly with AbortController timeout.
 * Does not alter model routing stages or call intelligence mutation APIs.
 */

import { createHash, randomUUID } from "node:crypto";
import { assembleProspectConversationContext } from "@/services/prospectConversation/prospectConversationContext";
import { mapOpenRouterHttpFailure } from "@/services/prospectConversation/prospectConversationOpenRouterErrors";
import { buildProspectConversationPrompt } from "@/services/prospectConversation/prospectConversationPrompt";
import {
  PROSPECT_CONVERSATION_LIMITS,
  PROSPECT_CONVERSATION_MODEL,
  ProspectConversationError,
  type ProspectConversationResult,
  type ProspectConversationSuccessResult,
} from "@/services/prospectConversation/prospectConversationTypes";
import {
  releaseConversationSlot,
  tryAcquireConversationSlot,
  validateProspectConversationRequest,
} from "@/services/prospectConversation/prospectConversationValidation";
import type { Prospect } from "@/services/prospects/prospectService";

export {
  releaseConversationSlot,
  resetConversationConcurrencyForTests,
  tryAcquireConversationSlot,
  validateProspectConversationRequest,
} from "@/services/prospectConversation/prospectConversationValidation";

export { mapOpenRouterHttpFailure } from "@/services/prospectConversation/prospectConversationOpenRouterErrors";

function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function callGeminiViaOpenRouter(input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  requestId: string;
  prospectId: string;
  organizationId: string;
  executiveVersionId: string | null;
  promptHash: string;
  contextHash: string;
  promptCharCount: number;
  contextCharCount: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ProspectConversationError(
      "PROVIDER_ERROR",
      "AI provider is not configured.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";
  const controller = new AbortController();
  const timeoutMs = PROSPECT_CONVERSATION_LIMITS.openRouterTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model: PROSPECT_CONVERSATION_MODEL,
        messages: input.messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      // Do not log response body (may echo prompt content).
      console.error(
        JSON.stringify({
          event: "prospect_conversation_provider_error",
          requestId: input.requestId,
          organizationId: input.organizationId,
          prospectId: input.prospectId,
          executiveVersionId: input.executiveVersionId,
          model: PROSPECT_CONVERSATION_MODEL,
          status: response.status,
          durationMs,
          promptHash: input.promptHash,
          contextHash: input.contextHash,
          promptCharCount: input.promptCharCount,
          contextCharCount: input.contextCharCount,
        }),
      );

      throw mapOpenRouterHttpFailure(response.status, input.requestId);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      // Empty model content is not treated as a transient transport/provider class.
      throw new ProspectConversationError(
        "PROVIDER_ERROR",
        "Athena returned an empty response.",
        500,
        { requestId: input.requestId, retryable: false },
      );
    }

    console.info(
      JSON.stringify({
        event: "prospect_conversation_success",
        requestId: input.requestId,
        organizationId: input.organizationId,
        prospectId: input.prospectId,
        executiveVersionId: input.executiveVersionId,
        model: PROSPECT_CONVERSATION_MODEL,
        status: 200,
        durationMs,
        promptHash: input.promptHash,
        contextHash: input.contextHash,
        promptCharCount: input.promptCharCount,
        contextCharCount: input.contextCharCount,
        responseCharCount: content.length,
      }),
    );

    return content.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      console.error(
        JSON.stringify({
          event: "prospect_conversation_timeout",
          requestId: input.requestId,
          organizationId: input.organizationId,
          prospectId: input.prospectId,
          executiveVersionId: input.executiveVersionId,
          model: PROSPECT_CONVERSATION_MODEL,
          status: "timeout",
          durationMs: Date.now() - startedAt,
          promptHash: input.promptHash,
          contextHash: input.contextHash,
        }),
      );
      throw new ProspectConversationError(
        "TIMEOUT",
        "Athena took too long to respond. Please try again.",
        504,
        { requestId: input.requestId, retryable: true },
      );
    }
    if (error instanceof ProspectConversationError) {
      throw error;
    }
    throw new ProspectConversationError(
      "PROVIDER_ERROR",
      "Athena could not complete the conversation response.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function runProspectConversation(input: {
  organizationId: string;
  userId: string;
  prospect: Prospect;
  body: unknown;
  requestId?: string;
}): Promise<{ result: ProspectConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validateProspectConversationRequest(input.body);

  if (!tryAcquireConversationSlot(input.userId, input.prospect.id)) {
    // Athena concurrent-request slot — not provider rate limiting.
    throw new ProspectConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for this prospect.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const assembled = await assembleProspectConversationContext({
      organizationId: input.organizationId,
      userId: input.userId,
      prospect: input.prospect,
      executiveVersionId: request.executiveVersionId,
      assetReference: request.assetReference,
    });

    const built = buildProspectConversationPrompt({
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
      prospectId: input.prospect.id,
      organizationId: input.organizationId,
      executiveVersionId: assembled.executiveVersionId,
      promptHash,
      contextHash,
      promptCharCount: built.promptCharCount,
      contextCharCount: built.contextCharCount,
    });

    const result: ProspectConversationSuccessResult = {
      ok: true,
      message: {
        role: "assistant",
        content: assistantContent,
      },
      context: {
        prospectId: assembled.prospectId,
        executiveVersionId: assembled.executiveVersionId,
        versionState: assembled.versionState,
        versionLabel: assembled.versionLabel,
        asset: assembled.referencedAsset
          ? {
              kind: assembled.referencedAsset.kind,
              key: assembled.referencedAsset.key,
              title: assembled.referencedAsset.title,
            }
          : null,
      },
    };

    return { result, requestId };
  } catch (error) {
    if (error instanceof ProspectConversationError && !error.requestId) {
      throw new ProspectConversationError(
        error.code,
        error.message,
        error.httpStatus,
        { retryable: error.retryable, requestId },
      );
    }
    throw error;
  } finally {
    releaseConversationSlot(input.userId, input.prospect.id);
  }
}
