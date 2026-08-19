/**
 * Contained OpenRouter Gemini invocation for scoped Athena conversations.
 * Uses google/gemini-2.5-flash explicitly with AbortController timeout.
 */

import { createHash } from "node:crypto";
import { mapOpenRouterHttpFailure } from "@/services/athenaConversation/athenaConversationOpenRouterErrors";
import {
  ATHENA_CONVERSATION_LIMITS,
  ATHENA_CONVERSATION_MODEL,
  AthenaConversationError,
} from "@/services/athenaConversation/athenaConversationTypes";

export function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function callGeminiViaOpenRouter(input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  requestId: string;
  organizationId: string;
  /** Conversational scopes only — Estimate / Social Planner use Flash, not generation stages. */
  scope: "identity" | "getting-started" | "estimate" | "social-planner";
  promptHash: string;
  contextHash: string;
  promptCharCount: number;
  contextCharCount: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AthenaConversationError(
      "PROVIDER_ERROR",
      "AI provider is not configured.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";
  const controller = new AbortController();
  const timeoutMs = ATHENA_CONVERSATION_LIMITS.openRouterTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const eventPrefix =
    input.scope === "identity"
      ? "identity_conversation"
      : input.scope === "estimate"
        ? "estimate_conversation"
        : input.scope === "social-planner"
          ? "social_planner_conversation"
          : "getting_started_conversation";

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": siteUrl,
          "X-Title": appName,
        },
        body: JSON.stringify({
          model: ATHENA_CONVERSATION_MODEL,
          messages: input.messages,
          temperature: 0.3,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      },
    );

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: `${eventPrefix}_provider_error`,
          requestId: input.requestId,
          organizationId: input.organizationId,
          scope: input.scope,
          model: ATHENA_CONVERSATION_MODEL,
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
      throw new AthenaConversationError(
        "PROVIDER_ERROR",
        "Athena returned an empty response.",
        500,
        { requestId: input.requestId, retryable: false },
      );
    }

    console.info(
      JSON.stringify({
        event: `${eventPrefix}_success`,
        requestId: input.requestId,
        organizationId: input.organizationId,
        scope: input.scope,
        model: ATHENA_CONVERSATION_MODEL,
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
          event: `${eventPrefix}_timeout`,
          requestId: input.requestId,
          organizationId: input.organizationId,
          scope: input.scope,
          model: ATHENA_CONVERSATION_MODEL,
          status: "timeout",
          durationMs: Date.now() - startedAt,
          promptHash: input.promptHash,
          contextHash: input.contextHash,
        }),
      );
      throw new AthenaConversationError(
        "TIMEOUT",
        "Athena took too long to respond. Please try again.",
        504,
        { requestId: input.requestId, retryable: true },
      );
    }
    if (error instanceof AthenaConversationError) {
      throw error;
    }
    throw new AthenaConversationError(
      "PROVIDER_ERROR",
      "Athena could not complete the conversation response.",
      500,
      { requestId: input.requestId, retryable: false },
    );
  } finally {
    clearTimeout(timeout);
  }
}
