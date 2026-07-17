/**
 * Invoke production generateReview + existing routing. No custom dispatcher.
 */

import { generateReview, resolveModelForStage } from "@/services/aiService";
import type { AthenaLLMStage } from "@/lib/llm/modelRouting";

export type GenerationCallResult = {
  stage: AthenaLLMStage;
  mode: "standard" | "breakthrough";
  model: string;
  role: string;
  rawResponse: string;
  error: string | null;
};

export async function generateStageOutput(input: {
  stage: AthenaLLMStage;
  mode: "standard" | "breakthrough";
  prompt: string;
  discussionId: string;
}): Promise<GenerationCallResult> {
  const route = resolveModelForStage(input.stage);
  try {
    const rawResponse = await generateReview(input.prompt, {
      stage: `breakthrough_eval.${input.stage}.${input.mode}`,
      promptSource: "scripts/evaluation/breakthrough (non-production)",
      athenaStage: input.stage,
      generationKind:
        input.stage === "strategic_blueprint"
          ? "strategic_blueprint"
          : "discussion_analysis",
      discussionId: input.discussionId,
      regenerationRunId: `breakthrough-eval-${input.mode}-${input.discussionId}`,
      explicitRegeneration: false,
    });

    return {
      stage: input.stage,
      mode: input.mode,
      model: route.model,
      role: route.role,
      rawResponse,
      error: null,
    };
  } catch (error) {
    return {
      stage: input.stage,
      mode: input.mode,
      model: route.model,
      role: route.role,
      rawResponse: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
