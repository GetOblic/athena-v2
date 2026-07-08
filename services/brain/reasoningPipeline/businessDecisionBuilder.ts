import type {
  BusinessDecision,
  BusinessDecisionType,
  BusinessReasoning,
  EvidenceExtraction,
} from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

function mapDecisionType(input: {
  evidence: EvidenceExtraction;
  reasoning: BusinessReasoning;
}): BusinessDecisionType {
  const { evidence, reasoning } = input;

  if (
    !evidence.explicitBuyerNeed &&
    evidence.statedPainPoints.length === 0 &&
    evidence.confidence < 30
  ) {
    return "ignore_monitor";
  }

  if (evidence.urgencySignals.length > 0 && evidence.buyingIntent) {
    return "respond_directly";
  }

  if (evidence.objections.length > 0) {
    return evidence.objections.some((objection) =>
      /compare|versus|vs\.|alternative/i.test(objection),
    )
      ? "build_comparison_framework"
      : "publish_proof_asset";
  }

  if (evidence.requestedSolution?.toLowerCase().includes("diagnostic")) {
    return "create_diagnostic";
  }

  if (evidence.requestedSolution?.toLowerCase().includes("case study")) {
    return "create_case_study";
  }

  if (reasoning.highestLeverageMove.toLowerCase().includes("proof")) {
    return "publish_proof_asset";
  }

  if (evidence.buyingIntent) {
    return "qualify_privately";
  }

  return "create_readiness_assessment";
}

function decisionAssetType(decision: BusinessDecisionType): string {
  switch (decision) {
    case "build_comparison_framework":
      return "comparison_framework";
    case "create_diagnostic":
    case "create_readiness_assessment":
      return "diagnostic_checklist";
    case "create_implementation_teardown":
      return "implementation_teardown";
    case "create_case_study":
      return "case_study";
    case "publish_proof_asset":
      return "proof_asset";
    case "respond_directly":
    case "qualify_privately":
      return "direct_response";
    case "ignore_monitor":
      return "monitor";
    default:
      return "pdf_guide";
  }
}

function decisionCta(decision: BusinessDecisionType): string {
  switch (decision) {
    case "respond_directly":
      return "Reply in-thread with a specific next step.";
    case "qualify_privately":
      return "Invite a private qualification conversation.";
    case "ignore_monitor":
      return "Monitor for stronger buying signals.";
    default:
      return "Offer the asset and request a concrete next action.";
  }
}

export function buildBusinessDecision(input: {
  evidence: EvidenceExtraction;
  reasoning: BusinessReasoning;
}): BusinessDecision {
  const { evidence, reasoning } = input;
  const decision = mapDecisionType({ evidence, reasoning });
  const recommendedAssetType = decisionAssetType(decision);

  const rationale = [
    reasoning.highestLeverageMove,
    reasoning.whyItMattersNow,
  ]
    .filter(Boolean)
    .join(" ");

  const whyThisBeatsAlternatives = [
    reasoning.whyAvoidGenericResponse,
    reasoning.genericResponseToAvoid,
  ].join(" ");

  const urgency: BusinessDecision["urgency"] =
    evidence.urgencySignals.length > 0
      ? "immediate"
      : evidence.buyingIntent
        ? "high"
        : evidence.confidence >= 50
          ? "medium"
          : "low";

  const whyThisAsset =
    decision === "ignore_monitor"
      ? "No asset yet — monitor until stronger evidence appears."
      : `${recommendedAssetType.replace(/_/g, " ")} implements the selected business decision: ${reasoning.realBusinessOpportunity}`;

  return {
    decision,
    rationale,
    whyThisBeatsAlternatives,
    targetAudience: evidence.buyingIntent ?? "Primary buyer from current discussion",
    intendedOutcome: reasoning.realBusinessOpportunity,
    primaryCta: decisionCta(decision),
    recommendedChannel:
      decision === "qualify_privately"
        ? "Private message"
        : decision === "respond_directly"
          ? "Community reply"
          : "Community + email follow-up",
    urgency,
    confidence: Math.round((reasoning.confidence + evidence.confidence) / 2),
    successMetric:
      decision === "ignore_monitor"
        ? "Signal strength on next interaction"
        : "Qualified reply or booked next step",
    whyThisAsset,
    recommendedAssetType,
  };
}
