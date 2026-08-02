/**
 * Contained Persona Ask Athena OpenRouter invocation.
 */

import { createHash, randomUUID } from "node:crypto";
import { assemblePersonaConversationContext } from "@/services/personaConversation/personaConversationContext";
import { buildPersonaConversationPrompt } from "@/services/personaConversation/personaConversationPrompt";
import {
  PERSONA_CONVERSATION_LIMITS,
  PERSONA_CONVERSATION_MODEL,
  PersonaConversationError,
  type PersonaConversationResult,
  type PersonaConversationSuccessResult,
} from "@/services/personaConversation/personaConversationTypes";
import {
  releaseConversationSlot,
  tryAcquireConversationSlot,
  validatePersonaConversationRequest,
} from "@/services/personaConversation/personaConversationValidation";
import type { Persona } from "@/services/personas/personaService";

export {
  releaseConversationSlot,
  resetConversationConcurrencyForTests,
  tryAcquireConversationSlot,
  validatePersonaConversationRequest,
} from "@/services/personaConversation/personaConversationValidation";

function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function mapOpenRouterHttpFailure(
  status: number,
  requestId: string,
): PersonaConversationError {
  if (status === 429) {
    return new PersonaConversationError(
      "PROVIDER_RATE_LIMITED",
      "Athena could not complete the conversation response.",
      429,
      { requestId, retryable: true },
    );
  }
  if (status >= 500) {
    return new PersonaConversationError(
      "PROVIDER_ERROR",
      "Athena could not complete the conversation response.",
      status >= 600 ? 502 : status,
      { requestId, retryable: true },
    );
  }
  return new PersonaConversationError(
    "PROVIDER_ERROR",
    "Athena could not complete the conversation response.",
    500,
    { requestId, retryable: false },
  );
}

async function callGeminiViaOpenRouter(input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  requestId: string;
  personaId: string;
  organizationId: string;
  executiveVersionId: string | null;
  promptHash: string;
  contextHash: string;
  promptCharCount: number;
  contextCharCount: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new PersonaConversationError(
      "PROVIDER_ERROR",
      "AI provider is not configured.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PERSONA_CONVERSATION_LIMITS.openRouterTimeoutMs,
  );
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
        model: PERSONA_CONVERSATION_MODEL,
        messages: input.messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "persona_conversation_provider_error",
          requestId: input.requestId,
          organizationId: input.organizationId,
          personaId: input.personaId,
          executiveVersionId: input.executiveVersionId,
          model: PERSONA_CONVERSATION_MODEL,
          status: response.status,
          durationMs,
          promptHash: input.promptHash,
          contextHash: input.contextHash,
        }),
      );
      throw mapOpenRouterHttpFailure(response.status, input.requestId);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new PersonaConversationError(
        "PROVIDER_ERROR",
        "Athena returned an empty response.",
        500,
        { requestId: input.requestId, retryable: false },
      );
    }

    console.info(
      JSON.stringify({
        event: "persona_conversation_success",
        requestId: input.requestId,
        organizationId: input.organizationId,
        personaId: input.personaId,
        executiveVersionId: input.executiveVersionId,
        model: PERSONA_CONVERSATION_MODEL,
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
      throw new PersonaConversationError(
        "TIMEOUT",
        "Athena took too long to respond. Please try again.",
        504,
        { requestId: input.requestId, retryable: true },
      );
    }
    if (error instanceof PersonaConversationError) throw error;
    throw new PersonaConversationError(
      "PROVIDER_ERROR",
      "Athena could not complete the conversation response.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function runPersonaConversation(input: {
  organizationId: string;
  userId: string;
  persona: Persona;
  body: unknown;
  requestId?: string;
}): Promise<{ result: PersonaConversationResult; requestId: string }> {
  const requestId = input.requestId?.trim() || randomUUID();
  const request = validatePersonaConversationRequest(input.body);

  if (!tryAcquireConversationSlot(input.userId, input.persona.id)) {
    throw new PersonaConversationError(
      "RATE_LIMITED",
      "A conversation request is already in progress for this Persona.",
      429,
      { requestId, retryable: false },
    );
  }

  try {
    const assembled = await assemblePersonaConversationContext({
      organizationId: input.organizationId,
      userId: input.userId,
      persona: input.persona,
      executiveVersionId: request.executiveVersionId,
      assetReference: request.assetReference ?? null,
    });

    const built = buildPersonaConversationPrompt({
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
      personaId: input.persona.id,
      organizationId: input.organizationId,
      executiveVersionId: assembled.executiveVersionId,
      promptHash,
      contextHash,
      promptCharCount: built.promptCharCount,
      contextCharCount: built.contextCharCount,
    });

    const result: PersonaConversationSuccessResult = {
      ok: true,
      message: {
        role: "assistant",
        content: assistantContent,
      },
      context: {
        personaId: assembled.personaId,
        executiveVersionId: assembled.executiveVersionId,
        versionState: assembled.versionState,
        versionLabel: assembled.versionLabel,
        asset: assembled.referencedAsset
          ? {
              kind: assembled.referencedAsset.kind,
              key: assembled.referencedAsset.key,
              title: assembled.referencedAsset.title,
              group: assembled.referencedAsset.group,
            }
          : null,
      },
    };

    return { result, requestId };
  } catch (error) {
    if (error instanceof PersonaConversationError && !error.requestId) {
      throw new PersonaConversationError(
        error.code,
        error.message,
        error.httpStatus,
        { retryable: error.retryable, requestId },
      );
    }
    throw error;
  } finally {
    releaseConversationSlot(input.userId, input.persona.id);
  }
}
