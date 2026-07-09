import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { formatMarketingRecommendationForPrompt } from "@/services/brain/executiveCoherence/marketingRecommendationContracts";
import {
  ensureExecutiveRecommendation,
  formatExecutiveRecommendationForPrompt,
} from "@/services/brain/executiveCoherence/executiveRecommendationContracts";

export function formatExecutiveMarketingStrategyForPrompt(
  strategy: ExecutiveStrategy,
): string {
  const marketing = strategy.marketingStrategy;
  const recommendationBlock = formatMarketingRecommendationForPrompt({
    primaryIntent: marketing.primaryIntent,
    supportingIntent: marketing.supportingIntent,
    primaryDeliverable: marketing.recommendedPrimaryDeliverable,
    supportingDeliverable: marketing.recommendedSupportingDeliverable,
  });

  const sections = [
    "EXECUTIVE MARKETING STRATEGY (SHARED — DO NOT REINTERPRET):",
    "",
    "This extends Executive Strategy with WHAT should happen next from a marketing perspective.",
    "",
    `- Business objective: ${marketing.businessObjective}`,
    `- Marketing objective: ${marketing.marketingObjective}`,
    `- Recommended primary deliverable: ${marketing.recommendedPrimaryDeliverable}`,
    marketing.recommendedSupportingDeliverable
      ? `- Recommended supporting deliverable: ${marketing.recommendedSupportingDeliverable}`
      : "- Recommended supporting deliverable: none",
    `- Buyer progression: ${marketing.buyerProgressionGoal.currentStage} → ${marketing.buyerProgressionGoal.desiredNextStage}`,
    `- Transition objective: ${marketing.buyerProgressionGoal.transitionObjective}`,
    `- Educational objective: ${marketing.educationalObjective}`,
    `- Trust objective: ${marketing.trustObjective}`,
    `- Conversion objective: ${marketing.conversionObjective}`,
    `- Executive priority: ${marketing.executivePriority}`,
    `- Recommendation confidence: ${marketing.recommendationConfidence}`,
    `- Preferred implementation: ${marketing.preferredImplementationType}`,
    "",
    formatExecutiveRecommendationForPrompt(marketing.executiveRecommendation, {
      initiativeLabel: strategy.primaryObjective,
      businessOutcome: marketing.businessObjective,
      targetAudience: strategy.primaryAudience,
      assetType: marketing.recommendedPrimaryDeliverable,
      rationale: marketing.assetSelectionRationale.join(" ") || undefined,
    }),
    `- Platform influence: ${marketing.platformInfluence.join("; ") || "Multi-platform"}`,
    `- Asset selection rationale: ${
      marketing.assetSelectionRationale.join(" ") ||
      ensureExecutiveRecommendation(marketing.executiveRecommendation).strategicRationale
    }`,
    marketing.refreshGuidance.preserveStrategy
      ? "- Refresh mode: improve execution quality (preserve strategic direction)"
      : `- Refresh mode: change direction — ${marketing.refreshGuidance.changeJustification ?? "materially stronger strategy identified"}`,
    "",
    recommendationBlock,
  ];

  return sections.join("\n").trim();
}

export function formatExecutiveStrategyCompactForBlueprint(
  strategy: ExecutiveStrategy,
  options?: { blueprintSelection?: boolean },
): string {
  const marketing = strategy.marketingStrategy;
  const lines = [
    options?.blueprintSelection
      ? "STRATEGY CONTEXT (no pre-selected asset format):"
      : "STRATEGY SIGNALS (inform selection — not a format mandate):",
    `- Objective: ${strategy.primaryObjective}`,
    `- Audience: ${strategy.primaryAudience}`,
  ];

  if (!options?.blueprintSelection) {
    lines.push(`- Deliverable hint: ${marketing.recommendedPrimaryDeliverable}`);
  }

  lines.push(
    `- Conversion goal: ${marketing.conversionObjective}`,
    `- Trust goal: ${marketing.trustObjective}`,
  );

  return lines.join("\n");
}

export function formatExecutiveStrategyForPrompt(
  strategy: ExecutiveStrategy,
): string {
  const sections = [
    "EXECUTIVE STRATEGY (SHARED — DO NOT REINTERPRET):",
    "",
    "All deliverables must align with this strategy while communicating differently.",
    "Think once. Communicate differently depending on destination.",
    "",
    `- Primary objective: ${strategy.primaryObjective}`,
    `- Primary audience: ${strategy.primaryAudience}`,
    `- Buyer stage: ${strategy.buyerStage ?? "Unknown"}`,
    `- Communication priority: ${strategy.communicationPriority}`,
    `- Recommended approach: ${strategy.recommendedApproach}`,
    `- Relationship strategy: ${strategy.relationshipStrategy}`,
    `- Confidence: ${strategy.confidence}`,
    "",
    "SUPPORTING EVIDENCE:",
    ...(strategy.supportingEvidence.length
      ? strategy.supportingEvidence.map((entry) => `- ${entry}`)
      : ["- Current discussion and business identity"]),
    "",
    "REASONING SUMMARY:",
    strategy.reasoningSummary || "No additional reasoning summary.",
    "",
    formatExecutiveMarketingStrategyForPrompt(strategy),
    "",
    "INSTRUCTIONS:",
    "Align with this strategy. Do not regenerate or contradict it.",
    "Your output must express this strategy through your deliverable's specialized responsibility.",
  ];

  return sections.join("\n").trim();
}

export function validateSharedExecutiveStrategy(
  strategies: ExecutiveStrategy[],
): { consistent: boolean; errors: string[] } {
  const errors: string[] = [];

  if (strategies.length <= 1) {
    return { consistent: true, errors };
  }

  const [first, ...rest] = strategies;
  for (const other of rest) {
    if (first.metadata.organizationId !== other.metadata.organizationId) {
      errors.push("Executive Strategy organization mismatch.");
    }
    if (first.metadata.strategyFingerprint !== other.metadata.strategyFingerprint) {
      errors.push("Executive Strategy fingerprint mismatch across workflows.");
    }
    if (first.recommendedApproach !== other.recommendedApproach) {
      errors.push("Recommended approach drift across workflows.");
    }
    if (
      first.marketingStrategy.marketingFingerprint !==
      other.marketingStrategy.marketingFingerprint
    ) {
      errors.push("Executive Marketing Strategy fingerprint mismatch across workflows.");
    }
    if (
      first.marketingStrategy.recommendedPrimaryDeliverable !==
      other.marketingStrategy.recommendedPrimaryDeliverable
    ) {
      errors.push("Marketing deliverable recommendation drift across workflows.");
    }
  }

  return { consistent: errors.length === 0, errors };
}
