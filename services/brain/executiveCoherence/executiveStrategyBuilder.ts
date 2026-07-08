import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type {
  BuildExecutiveStrategyParams,
  ExecutiveMarketingStrategy,
  ExecutiveStrategy,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { EXECUTIVE_STRATEGY_VERSION } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { buildExecutiveMarketingStrategy } from "@/services/brain/executiveCoherence/executiveMarketingStrategyBuilder";

function deriveConfidence(understanding: ExecutiveUnderstanding): number {
  const completeness = understanding.businessUnderstanding.knowledgeCompleteness;
  const evidenceCount = understanding.supportingEvidence.totalCount;
  const marketStrength =
    understanding.marketUnderstanding.evidenceStrength === "strong"
      ? 85
      : understanding.marketUnderstanding.evidenceStrength === "moderate"
        ? 65
        : understanding.marketUnderstanding.evidenceStrength === "weak"
          ? 45
          : 30;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(completeness * 0.4 + marketStrength * 0.4 + evidenceCount * 3),
    ),
  );
}

function deriveRelationshipStrategy(
  understanding: ExecutiveUnderstanding,
): string {
  const direction = understanding.strategicUnderstanding.recommendedDirection;
  const secondary = understanding.strategicUnderstanding.secondaryDirection;

  if (direction === "relationship_first") {
    return "Prioritize trust and continuity before advancing the opportunity.";
  }

  if (direction === "escalate") {
    return "Escalate with direct executive engagement while preserving credibility.";
  }

  if (direction === "monitor") {
    return "Observe signals and nurture lightly without premature selling.";
  }

  if (secondary === "relationship_first") {
    return "Lead consultatively while protecting long-term relationship capital.";
  }

  return "Advance consultatively with evidence-led guidance aligned to buyer stage.";
}

export function buildExecutiveStrategy(
  params: BuildExecutiveStrategyParams & {
    previousMarketingStrategy?: ExecutiveMarketingStrategy | null;
  },
): ExecutiveStrategy {
  const { executiveUnderstanding: understanding } = params;
  const direction = understanding.strategicUnderstanding.recommendedDirection;

  const decision = understanding.executiveIntelligence.executiveDecisionSynthesis.selectedDecision;
  const initiative = understanding.executiveInitiativeSelection.selectedInitiative;

  const reasoningSummary = [
    understanding.executiveSummary.narrative,
    understanding.strategicUnderstanding.recommendedExecutiveAction,
    understanding.priorityUnderstanding.rationale.join(" "),
    initiative.whyThisInitiative,
    decision.whyThisStrategy,
  ]
    .filter(Boolean)
    .join(" ");

  const strategyFingerprint = [
    params.organizationId,
    understanding.metadata.discussionId ?? "",
    direction,
    understanding.strategicUnderstanding.primaryExecutiveObjective,
    understanding.opportunityUnderstanding.importance,
    initiative.initiativeLabel,
    initiative.initiativeCategory,
    decision.chosenStrategy,
  ].join("|");

  const executiveStrategyBase = {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: params.organizationId,
      discussionId: understanding.metadata.discussionId,
      strategyVersion: EXECUTIVE_STRATEGY_VERSION,
      strategyFingerprint,
      understandingFingerprint: understanding.metadata.understandingFingerprint,
    },
    primaryObjective: understanding.executiveSummary.primaryObjective,
    primaryAudience:
      understanding.businessUnderstanding.positioning ??
      understanding.executiveSummary.headline,
    buyerStage: understanding.marketUnderstanding.buyerStage,
    communicationPriority: understanding.priorityUnderstanding.level,
    recommendedApproach: direction,
    relationshipStrategy: deriveRelationshipStrategy(understanding),
    confidence: deriveConfidence(understanding),
    supportingEvidence: understanding.supportingEvidence.entries.map(
      (entry) => `${entry.label}: ${entry.detail}`,
    ),
    reasoningSummary,
  };

  const marketingStrategy = buildExecutiveMarketingStrategy({
    executiveStrategyBase,
    executiveUnderstanding: understanding,
    previousMarketingStrategy: params.previousMarketingStrategy,
  });

  return {
    ...executiveStrategyBase,
    marketingStrategy,
  };
}

export function buildExecutiveStrategyFromUnderstanding(input: {
  organizationId: string;
  discussionId?: string;
  executiveUnderstanding: ExecutiveUnderstanding;
  previousMarketingStrategy?: ExecutiveMarketingStrategy | null;
}): ExecutiveStrategy {
  return buildExecutiveStrategy({
    organizationId: input.organizationId,
    discussionId: input.discussionId,
    executiveUnderstanding: input.executiveUnderstanding,
    previousMarketingStrategy: input.previousMarketingStrategy,
  });
}
