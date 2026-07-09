import {
  getReasoningProfile,
  isReasoningUnsupportedError,
  isReasoningSupportedByModel,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";
import { logRegenerationEvent } from "@/lib/regenerationDiagnostics";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCallOptions = {
  temperature?: number;
  reasoningProfile?: ReasoningProfileType;
  generationKind?: AthenaGenerationKind;
  regenerationNonce?: string;
  discussionId?: string;
  stage?: string;
};

function shouldLogReasoningDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function logReasoningDev(data: Record<string, unknown>): void {
  if (!shouldLogReasoningDev()) {
    return;
  }

  console.log(
    `[OPENROUTER_REASONING] ${JSON.stringify({
      ...data,
      loggedAt: new Date().toISOString(),
    })}`,
  );
}

async function postChatCompletion(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options?: OpenRouterCallOptions,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  if (!model) {
    throw new Error("Missing OPENROUTER_MODEL environment variable");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": siteUrl,
    "X-Title": appName,
  };

  const profile = options?.reasoningProfile ?? "BALANCED";
  const attachment = resolveReasoningAttachment({ model, profile });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.2,
  };

  if (attachment.attach) {
    Object.assign(body, getReasoningProfile(profile));
  }

  const callStartedAt = Date.now();
  logRegenerationEvent("OPENROUTER_CALL_STARTED", {
    stage: options?.stage ?? null,
    generationKind: options?.generationKind ?? null,
    model,
    regenerationNonce: options?.regenerationNonce ?? null,
    discussionId: options?.discussionId ?? null,
  });

  logReasoningDev({
    generationKind: options?.generationKind ?? null,
    model,
    reasoningProfile: profile,
    reasoningEffort: attachment.effort,
    reasoningAttached: attachment.attach,
    modelSupportsReasoning: isReasoningSupportedByModel(model),
  });

  let response = await postChatCompletion(headers, body);

  if (!response.ok && body.reasoning) {
    const errorText = await response.text();
    if (isReasoningUnsupportedError(response.status, errorText)) {
      const { reasoning: _removed, ...bodyWithoutReasoning } = body;
      logReasoningDev({
        generationKind: options?.generationKind ?? null,
        model,
        reasoningProfile: profile,
        reasoningAttached: false,
        fallback: "retry_without_reasoning",
      });
      response = await postChatCompletion(headers, bodyWithoutReasoning);
    } else {
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  logRegenerationEvent("OPENROUTER_RESPONSE_RECEIVED", {
    stage: options?.stage ?? null,
    generationKind: options?.generationKind ?? null,
    model,
    durationMs: Date.now() - callStartedAt,
    responseCharCount: content.length,
    regenerationNonce: options?.regenerationNonce ?? null,
    discussionId: options?.discussionId ?? null,
  });

  return content;
}
