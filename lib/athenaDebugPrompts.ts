import { resolveOpenRouterFallbackModel } from "@/lib/llm/modelRouting";

export const ATHENA_REVIEW_SYSTEM_PROMPT =
  "You are Athena, an institutional intelligence analyst. Produce concise, professional business intelligence.";

export const ATHENA_DEFAULT_LLM_TEMPERATURE = 0.2;

export type AthenaPromptDebugPayload = {
  stage: string;
  model?: string;
  temperature?: number;
  max_tokens?: number | null;
  systemPrompt: string;
  userPrompt: string;
  outputSchema?: string;
  jsonContract?: Record<string, unknown>;
};

export function isAthenaDebugPromptsEnabled(): boolean {
  return process.env.ATHENA_DEBUG_PROMPTS === "true";
}

export function logAthenaPromptDebug(payload: AthenaPromptDebugPayload): void {
  if (!isAthenaDebugPromptsEnabled()) {
    return;
  }

  const debugRecord = {
    tag: "ATHENA_DEBUG_PROMPTS",
    stage: payload.stage,
    timestamp: new Date().toISOString(),
    model: payload.model ?? resolveOpenRouterFallbackModel(),
    temperature: payload.temperature ?? ATHENA_DEFAULT_LLM_TEMPERATURE,
    max_tokens: payload.max_tokens ?? null,
    system_prompt: payload.systemPrompt,
    user_prompt: payload.userPrompt,
    output_schema: payload.outputSchema ?? null,
    json_contract: payload.jsonContract ?? null,
    user_prompt_char_count: payload.userPrompt.length,
  };

  console.log(`[ATHENA_DEBUG_PROMPTS] ${JSON.stringify(debugRecord, null, 2)}`);
}
