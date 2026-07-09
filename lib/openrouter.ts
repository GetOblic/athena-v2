import {
  getReasoningProfile,
  isReasoningUnsupportedError,
  isReasoningSupportedByModel,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";
import {
  logAthenaLlmRouting,
  resolveModelForStage,
  resolveOpenRouterFallbackModel,
  type AthenaExtendedLLMStage,
} from "@/lib/llm/modelRouting";
import {
  buildTokenBudgetSchedule,
  capMaxTokensForRetry,
  isTokenBudgetError,
  logOpenRouterTokenBudget,
  parseAvailableTokensFromError,
  resolveDefaultMaxTokens,
} from "@/lib/openrouterTokenBudget";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCallOptions = {
  temperature?: number;
  reasoningProfile?: ReasoningProfileType;
  generationKind?: AthenaGenerationKind;
  athenaStage?: AthenaExtendedLLMStage;
  regenerationRunId?: string;
  /** @deprecated Use regenerationRunId */
  regenerationNonce?: string;
  discussionId?: string;
  /** Pipeline sub-stage label for diagnostics (e.g. discussion_analysis.quality_gate). */
  stage?: string;
};

function resolveCallModel(options?: OpenRouterCallOptions): {
  model: string;
  route: ReturnType<typeof resolveModelForStage> | null;
} {
  if (options?.athenaStage) {
    const route = resolveModelForStage(options.athenaStage);
    return { model: route.model, route };
  }

  const fallback = resolveOpenRouterFallbackModel();
  if (!fallback) {
    throw new Error("Missing OPENROUTER_MODEL environment variable");
  }

  return { model: fallback, route: null };
}

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

type ChatCompletionResult =
  | { ok: true; content: string }
  | { ok: false; status: number; errorText: string };

async function requestChatCompletion(input: {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  options?: OpenRouterCallOptions;
  profile: ReasoningProfileType;
  model: string;
}): Promise<ChatCompletionResult> {
  let body = { ...input.body };
  let response = await postChatCompletion(input.headers, body);

  if (!response.ok && body.reasoning) {
    const errorText = await response.text();
    if (isReasoningUnsupportedError(response.status, errorText)) {
      const { reasoning: _removed, ...bodyWithoutReasoning } = body;
      logReasoningDev({
        generationKind: input.options?.generationKind ?? null,
        model: input.model,
        reasoningProfile: input.profile,
        reasoningAttached: false,
        fallback: "retry_without_reasoning",
      });
      body = bodyWithoutReasoning;
      response = await postChatCompletion(input.headers, body);
    } else {
      return { ok: false, status: response.status, errorText };
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, errorText };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { ok: true, content };
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options?: OpenRouterCallOptions,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  const { model, route } = resolveCallModel(options);

  if (route) {
    logAthenaLlmRouting(route);
  } else {
    console.log(
      `[Athena LLM] stage=unspecified role=fallback model=${model}`,
    );
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": siteUrl,
    "X-Title": appName,
  };

  const profile = options?.reasoningProfile ?? "BALANCED";
  const attachment = resolveReasoningAttachment({ model, profile });
  const baseMaxTokens = resolveDefaultMaxTokens();
  const tokenBudgetSchedule = buildTokenBudgetSchedule(baseMaxTokens);
  const callStartedAt = Date.now();
  let lastErrorText = "";

  logReasoningDev({
    generationKind: options?.generationKind ?? null,
    athenaStage: options?.athenaStage ?? null,
    model,
    reasoningProfile: profile,
    reasoningEffort: attachment.effort,
    reasoningAttached: attachment.attach,
    modelSupportsReasoning: isReasoningSupportedByModel(model),
    baseMaxTokens,
  });

  for (let attemptIndex = 0; attemptIndex < tokenBudgetSchedule.length; attemptIndex++) {
    const attemptNumber = attemptIndex + 1;
    let maxTokens = tokenBudgetSchedule[attemptIndex];

    if (lastErrorText) {
      maxTokens = capMaxTokensForRetry(maxTokens, lastErrorText);
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: maxTokens,
    };

    if (attachment.attach) {
      Object.assign(body, getReasoningProfile(profile));
    }

    logOpenRouterTokenBudget("OpenRouter token budget attempt", {
      attempt: attemptNumber,
      max_tokens: maxTokens,
      stage: options?.stage ?? null,
      athenaStage: options?.athenaStage ?? null,
      generationKind: options?.generationKind ?? null,
      discussionId: options?.discussionId ?? null,
      regenerationRunId:
        options?.regenerationRunId ?? options?.regenerationNonce ?? null,
      availableTokens: lastErrorText
        ? parseAvailableTokensFromError(lastErrorText)
        : null,
    });

    const result = await requestChatCompletion({
      headers,
      body,
      options,
      profile,
      model,
    });

    if (result.ok) {
      logOpenRouterTokenBudget(`Succeeded on attempt ${attemptNumber}`, {
        attempt: attemptNumber,
        max_tokens: maxTokens,
        durationMs: Date.now() - callStartedAt,
        stage: options?.stage ?? null,
        generationKind: options?.generationKind ?? null,
        discussionId: options?.discussionId ?? null,
        regenerationRunId:
          options?.regenerationRunId ?? options?.regenerationNonce ?? null,
      });

      logReasoningDev({
        generationKind: options?.generationKind ?? null,
        model,
        durationMs: Date.now() - callStartedAt,
        responseCharCount: result.content.length,
        regenerationRunId:
          options?.regenerationRunId ?? options?.regenerationNonce ?? null,
        maxTokens,
        attempt: attemptNumber,
      });

      return result.content;
    }

    lastErrorText = result.errorText;

    const canRetry =
      isTokenBudgetError(result.status, result.errorText) &&
      attemptIndex < tokenBudgetSchedule.length - 1;

    if (!canRetry) {
      throw new Error(
        `OpenRouter API error: ${result.status} ${result.errorText}`,
      );
    }
  }

  logOpenRouterTokenBudget("All retry attempts exhausted.", {
    attempts: tokenBudgetSchedule.length,
    stage: options?.stage ?? null,
    generationKind: options?.generationKind ?? null,
    discussionId: options?.discussionId ?? null,
    regenerationRunId:
      options?.regenerationRunId ?? options?.regenerationNonce ?? null,
    lastStatus: lastErrorText ? "token_budget" : null,
  });

  throw new Error(
    `OpenRouter token budget retries exhausted. ${lastErrorText}`,
  );
}
