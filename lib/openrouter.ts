import {
  getReasoningProfile,
  isReasoningUnsupportedError,
  isReasoningSupportedByModel,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";
import {
  getLLMModelRoles,
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

export type OpenRouterFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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
  /**
   * Aborts the in-flight completion and blocks a later token-budget or
   * reasoning retry. Callers that omit it keep the existing unbounded fetch.
   */
  signal?: AbortSignal;
  /** Test seam. Production calls use global fetch. */
  fetchImpl?: OpenRouterFetch;
};

export class OpenRouterRequestTimeoutError extends Error {
  constructor() {
    super("OpenRouter request timed out");
    this.name = "OpenRouterRequestTimeoutError";
  }
}

function isOpenRouterAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }

  return (
    error instanceof OpenRouterRequestTimeoutError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function throwIfOpenRouterAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new OpenRouterRequestTimeoutError();
  }
}

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
  transport?: { signal?: AbortSignal; fetchImpl?: OpenRouterFetch },
): Promise<Response> {
  const fetchImpl = transport?.fetchImpl ?? fetch;
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };
  if (transport?.signal) {
    init.signal = transport.signal;
  }

  return fetchImpl("https://openrouter.ai/api/v1/chat/completions", init);
}

async function readResponseText(
  response: Response,
  signal?: AbortSignal,
): Promise<string> {
  try {
    throwIfOpenRouterAborted(signal);
    return await response.text();
  } catch (error) {
    if (isOpenRouterAbort(error, signal)) {
      throw new OpenRouterRequestTimeoutError();
    }
    throw error;
  }
}

async function readResponseJson(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    throwIfOpenRouterAborted(signal);
    return await response.json();
  } catch (error) {
    if (isOpenRouterAbort(error, signal)) {
      throw new OpenRouterRequestTimeoutError();
    }
    throw error;
  }
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
  signal?: AbortSignal;
  fetchImpl?: OpenRouterFetch;
}): Promise<ChatCompletionResult> {
  const signal = input.signal;
  const transport = { signal, fetchImpl: input.fetchImpl };
  throwIfOpenRouterAborted(signal);

  let body = { ...input.body };
  let response: Response;
  try {
    response = await postChatCompletion(input.headers, body, transport);
  } catch (error) {
    if (isOpenRouterAbort(error, signal)) {
      throw new OpenRouterRequestTimeoutError();
    }
    throw error;
  }

  if (!response.ok && body.reasoning) {
    const errorText = await readResponseText(response, signal);
    if (isReasoningUnsupportedError(response.status, errorText)) {
      throwIfOpenRouterAborted(signal);
      const { reasoning: _removed, ...bodyWithoutReasoning } = body;
      logReasoningDev({
        generationKind: input.options?.generationKind ?? null,
        model: input.model,
        reasoningProfile: input.profile,
        reasoningAttached: false,
        fallback: "retry_without_reasoning",
      });
      body = bodyWithoutReasoning;
      try {
        response = await postChatCompletion(input.headers, body, transport);
      } catch (error) {
        if (isOpenRouterAbort(error, signal)) {
          throw new OpenRouterRequestTimeoutError();
        }
        throw error;
      }
    } else {
      throwIfOpenRouterAborted(signal);
      return { ok: false, status: response.status, errorText };
    }
  }

  if (!response.ok) {
    const errorText = await readResponseText(response, signal);
    throwIfOpenRouterAborted(signal);
    return { ok: false, status: response.status, errorText };
  }

  const data = (await readResponseJson(response, signal)) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  throwIfOpenRouterAborted(signal);
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

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": siteUrl,
    "X-Title": appName,
  };

  const profile = options?.reasoningProfile ?? "BALANCED";
  const attachment = resolveReasoningAttachment({ model, profile });
  const reasoningLabel =
    attachment.attach && attachment.effort ? attachment.effort : profile;

  if (route) {
    logAthenaLlmRouting(route, reasoningLabel);
  } else {
    console.log(
      `[Athena LLM] stage=unspecified role=fallback model=${model} reasoning=${reasoningLabel}`,
    );
  }

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

    throwIfOpenRouterAborted(options?.signal);

    let result: ChatCompletionResult;
    try {
      result = await requestChatCompletion({
        headers,
        body,
        options,
        profile,
        model,
        signal: options?.signal,
        fetchImpl: options?.fetchImpl,
      });
    } catch (error) {
      if (isOpenRouterAbort(error, options?.signal)) {
        throw new OpenRouterRequestTimeoutError();
      }
      throw error;
    }

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

/**
 * Hard cap for one-shot calls. Generation keeps its own token-budget retries.
 * Community qualification is the production caller and needs room for one
 * pasteable message on each of up to ten results.
 */
export const OPENROUTER_BOUNDED_MAX_TOKENS = 1600;

export type OpenRouterBoundedFailure =
  | "unconfigured"
  | "timeout"
  | "transport"
  | "empty_response";

export type OpenRouterBoundedCompletion = {
  content: string;
  finishReason: string | null;
  completionTokens: number | null;
};

export class OpenRouterBoundedCallError extends Error {
  readonly reason: OpenRouterBoundedFailure;

  constructor(reason: OpenRouterBoundedFailure) {
    super(`OpenRouter bounded call ${reason}`);
    this.name = "OpenRouterBoundedCallError";
    this.reason = reason;
  }
}

export type OpenRouterBoundedMessage = {
  role: "system" | "user";
  content: string;
};

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function boundedMaxTokens(maxTokens: number): number {
  if (!Number.isFinite(maxTokens)) return 1;
  return Math.min(
    OPENROUTER_BOUNDED_MAX_TOKENS,
    Math.max(1, Math.floor(maxTokens)),
  );
}

/**
 * One OpenRouter completion for a short, abortable task.
 * Sends no reasoning payload and does not retry or switch models.
 * Callers that omit `model` keep the analysis model. Community qualification
 * passes its own model and does not fall back to analysis.
 */
export async function callOpenRouterBounded(input: {
  messages: readonly OpenRouterBoundedMessage[];
  maxTokens: number;
  temperature?: number;
  signal: AbortSignal;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<OpenRouterBoundedCompletion> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey || /[\r\n]/.test(apiKey)) {
    throw new OpenRouterBoundedCallError("unconfigured");
  }

  const maxTokens = boundedMaxTokens(input.maxTokens);
  const dedicatedModel = input.model?.trim() ?? "";
  if (input.model !== undefined && (!dedicatedModel || /[\r\n]/.test(dedicatedModel))) {
    throw new OpenRouterBoundedCallError("unconfigured");
  }
  const model = dedicatedModel || getLLMModelRoles().analysis.model;
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";
  const fetchImpl = input.fetchImpl ?? fetch;

  console.log(
    dedicatedModel
      ? `[Athena LLM] stage=community_qualification role=qualification model=${model} reasoning=none max_tokens=${maxTokens}`
      : `[Athena LLM] stage=bounded role=analysis model=${model} reasoning=none max_tokens=${maxTokens}`,
  );

  let response: Response;
  try {
    response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0,
        max_tokens: maxTokens,
      }),
    });
  } catch (error) {
    if (isAbortError(error) || input.signal.aborted) {
      throw new OpenRouterBoundedCallError("timeout");
    }
    throw new OpenRouterBoundedCallError("transport");
  }

  if (!response.ok) {
    throw new OpenRouterBoundedCallError("transport");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortError(error) || input.signal.aborted) {
      throw new OpenRouterBoundedCallError("timeout");
    }
    throw new OpenRouterBoundedCallError("transport");
  }

  const completion = readBoundedCompletion(payload);
  if (!completion.content.trim()) {
    throw new OpenRouterBoundedCallError("empty_response");
  }

  return completion;
}

function readBoundedCompletion(payload: unknown): OpenRouterBoundedCompletion {
  if (!payload || typeof payload !== "object") {
    return { content: "", finishReason: null, completionTokens: null };
  }
  const record = payload as { choices?: unknown; usage?: unknown };
  const choice = Array.isArray(record.choices) ? record.choices[0] : null;
  const choiceRecord =
    choice && typeof choice === "object"
      ? (choice as { message?: unknown; finish_reason?: unknown })
      : null;
  const message =
    choiceRecord?.message && typeof choiceRecord.message === "object"
      ? (choiceRecord.message as { content?: unknown })
      : null;
  const content = typeof message?.content === "string" ? message.content : "";
  const finishReason =
    typeof choiceRecord?.finish_reason === "string" ? choiceRecord.finish_reason : null;
  const usage =
    record.usage && typeof record.usage === "object"
      ? (record.usage as { completion_tokens?: unknown }).completion_tokens
      : null;
  return {
    content,
    finishReason,
    completionTokens:
      typeof usage === "number" && Number.isFinite(usage) ? usage : null,
  };
}
