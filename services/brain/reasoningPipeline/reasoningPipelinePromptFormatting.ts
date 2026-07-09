import type { ReasoningPipeline } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

export function formatReasoningPipelineCompactForPrompt(
  pipeline: ReasoningPipeline,
): string {
  const { evidence, memory, reasoning, decision } = pipeline;

  return [
    "=== DECISION SIGNALS (inform reasoning — not a format mandate) ===",
    `- Pain: ${evidence.statedPainPoints.slice(0, 3).join("; ") || "See discussion"}`,
    `- Objections: ${evidence.objections.slice(0, 2).join("; ") || "None recorded"}`,
    `- Leverage move: ${reasoning.highestLeverageMove}`,
    `- Prior winning angles: ${memory.priorWinningAngles.slice(0, 2).join("; ") || "None"}`,
    `- Domain terms: ${memory.relevantDomainTerminology.slice(0, 8).join(", ") || "None"}`,
    `- Selected decision: ${decision.decision}`,
    `- Suggested asset type: ${decision.recommendedAssetType}`,
    `- Why: ${decision.whyThisAsset}`,
    `- Primary CTA direction: ${decision.primaryCta}`,
  ].join("\n");
}

/** Blueprint selection context — no pre-decided asset type. */
export function formatReasoningContextForBlueprintSelection(
  pipeline: ReasoningPipeline,
): string {
  const { evidence, reasoning, decision } = pipeline;

  return [
    "=== COMMERCIAL CONTEXT (evaluate before choosing asset format) ===",
    `- Buyer uncertainty: ${evidence.statedPainPoints.slice(0, 3).join("; ") || "See discussion"}`,
    `- Hidden objection: ${evidence.objections.slice(0, 2).join("; ") || "Infer from discussion"}`,
    `- Leverage move: ${reasoning.highestLeverageMove}`,
    `- Commercial objective: ${decision.intendedOutcome}`,
    `- Target audience: ${decision.targetAudience}`,
    `- Primary CTA direction: ${decision.primaryCta}`,
    "You must choose asset_type after evaluating buyer uncertainty, hidden objection, commercial objective, conversion mechanism, and reusable value.",
  ].join("\n");
}

/** @deprecated Use formatReasoningPipelineCompactForPrompt — full pipeline removed from prompts. */
export function formatReasoningPipelineForPrompt(
  pipeline: ReasoningPipeline,
): string {
  return formatReasoningPipelineCompactForPrompt(pipeline);
}

export function formatReasoningPipelineCompactForBlueprint(
  pipeline: ReasoningPipeline,
): string {
  return formatReasoningContextForBlueprintSelection(pipeline);
}
