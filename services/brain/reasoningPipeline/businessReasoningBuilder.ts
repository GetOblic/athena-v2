import type {
  EvidenceExtraction,
  BusinessReasoning,
} from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";
import type { RelevantMemory } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

export function buildBusinessReasoning(input: {
  evidence: EvidenceExtraction;
  memory: RelevantMemory;
}): BusinessReasoning {
  const { evidence, memory } = input;
  const primaryPain = evidence.statedPainPoints[0] ?? "the buyer's unresolved problem";
  const primaryNeed = evidence.explicitBuyerNeed ?? primaryPain;

  const realBusinessOpportunity = evidence.explicitBuyerNeed
    ? `Convert active demand around "${primaryNeed}" into a qualified next step.`
    : `Surface and resolve ${primaryPain} before competitors do.`;

  const whyItMattersNow =
    evidence.urgencySignals[0] ??
    (evidence.buyingIntent
      ? `Buyer intent is present (${evidence.buyingIntent}).`
      : "Discussion signals are fresh and actionable now.");

  const highestLeverageMove = evidence.requestedSolution
    ? `Directly address the requested solution path: ${evidence.requestedSolution}`
    : evidence.objections.length > 0
      ? `Neutralize the primary objection with proof, not generic education.`
      : `Respond with a specific, evidence-backed move tied to ${primaryPain}.`;

  const genericResponseToAvoid =
    "Create a generic guide, webinar, or broad educational post without tying to this buyer's stated context.";

  const whyAvoidGenericResponse =
    evidence.objections.length > 0
      ? "Generic content will not address stated objections and will read as template advice."
      : "Generic content ignores the specific signals in this discussion and wastes conversion leverage.";

  const seniorOperatorAction =
    evidence.urgencySignals.length > 0
      ? "Respond quickly with a concrete proof asset and a direct qualification path."
      : "Publish a targeted asset that demonstrates pattern recognition, then follow up privately.";

  const supportingEvidence = [
    ...evidence.quotedEvidenceSnippets.slice(0, 4),
    ...evidence.statedPainPoints.slice(0, 3),
    ...evidence.decisionCriteria.slice(0, 2),
  ].filter(Boolean);

  const memorySupport = [
    ...memory.priorWinningAngles.slice(0, 3),
    ...memory.recurringBuyerConcerns.slice(0, 2),
  ].filter(Boolean);

  const memoryContradictions = memory.priorRejectedAngles.slice(0, 3);

  const risks = [
    evidence.missingInformation.length > 0
      ? `Information gaps: ${evidence.missingInformation.join(" ")}`
      : "",
    evidence.constraints.length > 0
      ? `Constraints: ${evidence.constraints.join("; ")}`
      : "",
    memoryContradictions.length > 0
      ? "Prior rejected angles suggest caution against repeating failed patterns."
      : "",
  ].filter(Boolean);

  const confidence = Math.round(
    (evidence.confidence +
      (memory.hasMemory ? 20 : 0) +
      (supportingEvidence.length >= 2 ? 15 : 0) +
      (memorySupport.length > 0 ? 10 : 0)) /
      1.45,
  );

  return {
    realBusinessOpportunity,
    whyItMattersNow,
    highestLeverageMove,
    genericResponseToAvoid,
    whyAvoidGenericResponse,
    seniorOperatorAction,
    supportingEvidence,
    memorySupport,
    memoryContradictions,
    risks,
    confidence: Math.max(0, Math.min(100, confidence)),
  };
}
