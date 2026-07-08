import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import { buildEvidenceExtraction } from "@/services/brain/reasoningPipeline/evidenceExtractionBuilder";
import { buildRelevantMemory } from "@/services/brain/reasoningPipeline/memoryRetrievalBuilder";
import { buildBusinessReasoning } from "@/services/brain/reasoningPipeline/businessReasoningBuilder";
import { buildBusinessDecision } from "@/services/brain/reasoningPipeline/businessDecisionBuilder";
import {
  REASONING_PIPELINE_VERSION,
  type ReasoningPipeline,
} from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

export function buildReasoningPipeline(input: {
  organizationId: string;
  discussionId?: string | null;
  brainContext: AthenaBrainContext;
  discussionText?: string;
}): ReasoningPipeline {
  const evidence = buildEvidenceExtraction(input.brainContext, input.discussionText);
  const memory = buildRelevantMemory(input.brainContext);
  const reasoning = buildBusinessReasoning({ evidence, memory });
  const decision = buildBusinessDecision({ evidence, reasoning });

  return {
    version: REASONING_PIPELINE_VERSION,
    organizationId: input.organizationId,
    discussionId: input.discussionId ?? input.brainContext.discussionMemory.focus?.discussion?.id ?? null,
    evidence,
    memory,
    reasoning,
    decision,
  };
}
