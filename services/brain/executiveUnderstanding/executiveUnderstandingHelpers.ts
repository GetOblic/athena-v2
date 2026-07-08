import { formatExecutiveIntelligenceForPrompt } from "@/services/brain/executiveIntelligenceHelpers";
import { formatExecutiveInitiativeSelectionForPrompt } from "@/services/brain/executiveInitiativeSelectionHelpers";
import {
  formatExecutiveCampaignNarrativeForPrompt,
  formatExecutiveOutputReviewForPrompt,
} from "@/services/brain/executiveOutputReviewHelpers";
import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoning } from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveIntelligencePipeline } from "@/services/brain/executiveReasoningTypes";
import type {
  BusinessUnderstanding,
  ExecutiveSummary,
  ExecutiveUnderstanding,
  MarketUnderstanding,
  OpportunityUnderstanding,
  PriorityUnderstanding,
  RiskUnderstanding,
  StrategicUnderstanding,
  SupportingEvidence,
  UnderstandingEvidenceEntry,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

export function buildBusinessUnderstanding(
  context: AthenaBrainContext,
  reasoning: ExecutiveReasoning,
): BusinessUnderstanding {
  const identity = context.identityMemory;
  const business = reasoning.businessAssessment;

  return {
    positioning: business.preferredPositioning ?? identity.aboutYou,
    voice: business.voice ?? identity.aboutYou,
    expertise: business.expertise ?? identity.expertise,
    website: business.website ?? identity.website,
    homepageUnderstanding:
      business.homepageLearning ??
      identity.homepageLearning ??
      null,
    businessConstraints: business.businessConstraints,
    knowledgeCompleteness: business.knowledgeCompleteness,
    isBrainTrained: business.isBrainTrained,
    summary: business.summary,
  };
}

export function buildMarketUnderstanding(
  context: AthenaBrainContext,
  reasoning: ExecutiveReasoning,
): MarketUnderstanding {
  const market = reasoning.marketAssessment;
  const focusDiscussion = context.discussionMemory.focus?.discussion;
  const focusAnalysis = context.discussionMemory.focus?.latestAnalysis;
  const focusDomain = context.domainMemory.domains.find(
    (domain) => domain.id === context.domainMemory.focusDomainId,
  );

  const painPoints = uniqueStrings([
    ...market.recurringObjections,
    focusAnalysis?.pain_points,
    ...context.executiveMemory.painPointKnowledge
      .slice(0, 5)
      .map((entry) => entry.painPoint),
  ]);

  const recurringTerminology = uniqueStrings([
    ...market.recurringTerminology,
    ...reasoning.strategicAssessment.knownTerminology,
    ...context.executiveMemory.terminologyKnowledge
      .slice(0, 8)
      .map((entry) => entry.term),
  ]);

  const competitors = uniqueStrings([
    ...(focusDomain?.competitors ?? []),
    ...context.executiveMemory.competitorKnowledge
      .slice(0, 5)
      .map((entry) => entry.name),
  ]);

  const emergingThemes = uniqueStrings([
    focusDomain?.emergingTrends,
    ...context.discussionMemory.recurringThemes,
    ...context.marketEvidence.slice(0, 3).map((entry) => entry.value),
  ]);

  const historicalEnrichmentAvailable =
    context.executiveMemory.metadata.discussionCount > 0 ||
    context.executiveMemory.painPointKnowledge.length > 0 ||
    context.executiveMemory.terminologyKnowledge.length > 0;

  return {
    buyerStage: focusAnalysis?.buyer_stage ?? null,
    painPoints: uniqueStrings([
      ...painPoints,
      reasoning.executiveIntelligence.hiddenProblem.hiddenMarketProblem,
    ]),
    marketSignals: market.currentMarketSignals,
    recurringTerminology,
    competitors,
    emergingThemes,
    discussionRelevance: market.discussionRelevance,
    domainRelevance: focusDomain?.athenaUnderstanding ?? focusDomain?.name ?? null,
    evidenceStrength: market.evidenceStrength,
    historicalEnrichmentAvailable,
  };
}

export function buildStrategicUnderstanding(
  reasoning: ExecutiveReasoning,
): StrategicUnderstanding {
  const direction = reasoning.recommendedDirection;
  const priority = reasoning.priorityAssessment;

  const recommendedExecutiveAction =
    direction.primary === "escalate"
      ? "Escalate with executive review and immediate follow-up."
      : direction.primary === "monitor"
        ? "Monitor signals and prepare educational follow-up."
        : direction.primary === "sales_first"
          ? "Advance consultatively while preparing deployment assets."
          : direction.primary === "relationship_first"
            ? "Prioritize relationship continuity before advancing the opportunity."
            : direction.primary === "consultative"
              ? "Lead with consultative guidance aligned to business positioning."
              : "Lead with educational value grounded in current discussion intelligence.";

  const recommendedDeploymentDirection =
    direction.primary === "educational" || direction.primary === "monitor"
      ? "Educational community reply with soft follow-up assets."
      : direction.primary === "sales_first" || direction.primary === "escalate"
        ? "Direct deployment assets with clear CTA and follow-up sequence."
        : "Consultative deployment assets with community reply, private message, and social post.";

  return {
    recommendedPositioning: reasoning.businessAssessment.preferredPositioning,
    recommendedDirection: direction.primary,
    secondaryDirection: direction.secondary,
    recommendedExecutiveAction,
    recommendedDeploymentDirection,
    primaryExecutiveObjective:
      reasoning.executiveIntelligence.hiddenProblem.foundationalInsight ||
      priority.rationale[0] ||
      recommendedExecutiveAction,
    rationale: uniqueStrings([
      ...direction.rationale,
      reasoning.executiveIntelligence.contrarianThinking.strategicReframe,
      reasoning.executiveIntelligence.strategicDifferentiation.differentiationStatement,
    ]),
  };
}

export function buildOpportunityUnderstanding(
  context: AthenaBrainContext,
  reasoning: ExecutiveReasoning,
): OpportunityUnderstanding {
  const opportunity = reasoning.opportunityAssessment;
  const focusDiscussion = context.discussionMemory.focus?.discussion;
  const focusAnalysis = context.discussionMemory.focus?.latestAnalysis;
  const focusOpportunity =
    context.opportunityMemory.focus?.opportunity ??
    context.discussionMemory.focus?.linkedOpportunity;

  const businessOpportunity = uniqueStrings([
    reasoning.executiveIntelligence.suggestedOpportunityTitle,
    focusOpportunity?.title,
    focusAnalysis?.opportunity_title,
    focusDiscussion?.title,
  ])[0] ?? null;

  const historicalEvidence = uniqueStrings([
    ...reasoning.strategicAssessment.historicalPatterns,
    ...opportunity.supportingEvidence.filter((entry) =>
      entry.toLowerCase().includes("historical"),
    ),
    context.executiveLearning.decisionLearning.totalValidatedDecisions > 0
      ? `${context.executiveLearning.decisionLearning.totalValidatedDecisions} validated executive decisions on record`
      : null,
  ]);

  return {
    businessOpportunity,
    businessAlignment: opportunity.businessRelevance,
    executiveAlignment: opportunity.executiveAlignment,
    importance: opportunity.importance,
    supportingEvidence: opportunity.supportingEvidence,
    historicalEvidence,
    historicalEvidenceAvailable: historicalEvidence.length > 0,
  };
}

export function buildRiskUnderstanding(
  reasoning: ExecutiveReasoning,
): RiskUnderstanding {
  const risk = reasoning.riskAssessment;

  return {
    overallRisk: risk.overallRisk,
    signals: risk.signals,
    missingInformation: risk.missingInformation,
    sparseHistory: risk.sparseHistory,
  };
}

export function buildPriorityUnderstanding(
  reasoning: ExecutiveReasoning,
): PriorityUnderstanding {
  return {
    level: reasoning.priorityAssessment.level,
    rationale: reasoning.priorityAssessment.rationale,
  };
}

export function buildExecutiveSummary(input: {
  context: AthenaBrainContext;
  strategic: StrategicUnderstanding;
  opportunity: OpportunityUnderstanding;
  executiveIntelligence: ExecutiveIntelligencePipeline;
  discussionId?: string;
}): ExecutiveSummary {
  const focusDiscussion = input.context.discussionMemory.focus?.discussion;
  const focusAnalysis = input.context.discussionMemory.focus?.latestAnalysis;
  const narrativeParts = uniqueStrings([
    input.executiveIntelligence.hiddenProblem.hiddenMarketProblem,
    focusAnalysis?.summary,
    input.context.snapshot.businessSummary,
    input.strategic.recommendedExecutiveAction,
  ]);

  const headline =
    input.opportunity.businessOpportunity ??
    input.executiveIntelligence.suggestedOpportunityTitle ??
    focusDiscussion?.title ??
    `${input.context.organization.name} executive understanding`;

  return {
    headline,
    narrative: narrativeParts.join(" "),
    primaryObjective: input.strategic.primaryExecutiveObjective,
    discussionId: input.discussionId?.trim() ?? focusDiscussion?.id ?? null,
    scope: input.context.scope,
  };
}

export function buildSupportingEvidence(
  context: AthenaBrainContext,
  reasoning: ExecutiveReasoning,
): SupportingEvidence {
  const entries: UnderstandingEvidenceEntry[] = [];

  if (context.identityMemory.aboutYou || context.identityMemory.expertise) {
    entries.push({
      source: "business_identity",
      label: "Business Identity",
      detail: uniqueStrings([
        context.identityMemory.aboutYou,
        context.identityMemory.expertise,
      ]).join(" — "),
      optional: false,
    });
  }

  const homepageLearning =
    reasoning.businessAssessment.homepageLearning ??
    context.identityMemory.homepageLearning;
  if (homepageLearning?.trim()) {
    entries.push({
      source: "business_identity",
      label: "Homepage Knowledge",
      detail: homepageLearning.slice(0, 280),
      optional: true,
    });
  }

  const focusDiscussion = context.discussionMemory.focus?.discussion;
  if (focusDiscussion) {
    entries.push({
      source: "current_discussion",
      label: "Current Discussion",
      detail: focusDiscussion.title,
      optional: false,
    });

    if (focusDiscussion.ai_notes?.trim()) {
      entries.push({
        source: "current_discussion",
        label: "Discussion Notes",
        detail: focusDiscussion.ai_notes.trim().slice(0, 280),
        optional: true,
      });
    }
  }

  const threadCount = context.discussionMemory.focus?.threadUpdates.length ?? 0;
  if (threadCount > 0) {
    entries.push({
      source: "current_discussion",
      label: "Discussion Updates",
      detail: `${threadCount} thread update(s) available`,
      optional: false,
    });
  }

  const focusDomain = context.domainMemory.domains.find(
    (domain) => domain.id === context.domainMemory.focusDomainId,
  );
  if (focusDomain) {
    entries.push({
      source: "intelligence_domains",
      label: "Intelligence Domain",
      detail: focusDomain.name,
      optional: false,
    });
  }

  if (context.discussionMemory.focus?.latestAnalysis) {
    entries.push({
      source: "current_discussion",
      label: "Current Discussion Analysis",
      detail: context.discussionMemory.focus.latestAnalysis.summary ?? "Analysis available",
      optional: false,
    });
  }

  const linkedBriefing = context.discussionMemory.focus?.linkedBriefing;
  if (linkedBriefing?.notes?.trim()) {
    entries.push({
      source: "executive_learning",
      label: "Briefing Operator Notes",
      detail: linkedBriefing.notes.trim().slice(0, 280),
      optional: true,
    });
  }

  for (const asset of context.knowledgeMemory.assets.slice(0, 3)) {
    const ratingSuffix =
      asset.rating != null && asset.rating > 0 ? ` (confidence ${asset.rating})` : "";
    entries.push({
      source: "knowledge_assets",
      label: "Knowledge Asset",
      detail: asset.summary?.trim()
        ? `${asset.title}${ratingSuffix}: ${asset.summary.slice(0, 180)}`
        : `${asset.title}${ratingSuffix}`,
      optional: false,
    });
  }

  if (reasoning.strategicAssessment.mostRelevantMarketContext) {
    entries.push({
      source: "current_discussion",
      label: "Current Market Context",
      detail: reasoning.strategicAssessment.mostRelevantMarketContext,
      optional: false,
    });
  }

  if (context.executiveMemory.painPointKnowledge.length > 0) {
    entries.push({
      source: "executive_memory",
      label: "Executive Memory",
      detail: `${context.executiveMemory.painPointKnowledge.length} recurring pain point(s)`,
      optional: true,
    });
  }

  if (context.executiveLearning.decisionLearning.totalValidatedDecisions > 0) {
    entries.push({
      source: "executive_learning",
      label: "Executive Learning",
      detail: `${context.executiveLearning.decisionLearning.totalValidatedDecisions} validated decision(s)`,
      optional: true,
    });
  }

  for (const evidence of context.marketEvidence.slice(0, 3)) {
    entries.push({
      source: "intelligence_domains",
      label: "Market Evidence",
      detail: evidence.value,
      optional: true,
    });
  }

  const historicalCount = entries.filter((entry) => entry.optional).length;

  return {
    entries,
    totalCount: entries.length,
    historicalCount,
  };
}

export function buildUnderstandingFingerprint(
  understanding: Pick<
    ExecutiveUnderstanding,
    "executiveSummary" | "strategicUnderstanding" | "opportunityUnderstanding"
  >,
): string {
  return [
    understanding.executiveSummary.discussionId ?? "",
    understanding.strategicUnderstanding.recommendedDirection,
    understanding.strategicUnderstanding.primaryExecutiveObjective,
    understanding.opportunityUnderstanding.businessOpportunity ?? "",
    understanding.opportunityUnderstanding.importance,
  ].join("|");
}

export function formatExecutiveUnderstandingForPrompt(
  understanding: ExecutiveUnderstanding,
): string {
  const sections = [
    "ATHENA EXECUTIVE UNDERSTANDING:",
    "",
    "This is the canonical executive interpretation. All outputs must align with it.",
    "Do not independently reinterpret strategy, buyer understanding, or opportunity importance.",
    "",
    "EXECUTIVE SUMMARY:",
    `- Headline: ${understanding.executiveSummary.headline}`,
    `- Narrative: ${understanding.executiveSummary.narrative || "Not available."}`,
    `- Primary objective: ${understanding.executiveSummary.primaryObjective}`,
    "",
    "BUSINESS UNDERSTANDING:",
    `- Positioning: ${understanding.businessUnderstanding.positioning ?? "Not available."}`,
    `- Voice: ${understanding.businessUnderstanding.voice ?? "Not available."}`,
    `- Expertise: ${understanding.businessUnderstanding.expertise ?? "Not available."}`,
    `- Website: ${understanding.businessUnderstanding.website ?? "Not available."}`,
    `- Homepage understanding: ${understanding.businessUnderstanding.homepageUnderstanding ?? "Not available."}`,
    `- Knowledge completeness: ${understanding.businessUnderstanding.knowledgeCompleteness}%`,
    `- Constraints: ${understanding.businessUnderstanding.businessConstraints.join("; ") || "None recorded."}`,
    "",
    "MARKET UNDERSTANDING:",
    `- Buyer stage: ${understanding.marketUnderstanding.buyerStage ?? "Unknown"}`,
    `- Pain points: ${understanding.marketUnderstanding.painPoints.join("; ") || "None recorded."}`,
    `- Market signals: ${understanding.marketUnderstanding.marketSignals.join("; ") || "None recorded."}`,
    `- Terminology: ${understanding.marketUnderstanding.recurringTerminology.join(", ") || "None recorded."}`,
    `- Competitors: ${understanding.marketUnderstanding.competitors.join(", ") || "None recorded."}`,
    `- Emerging themes: ${understanding.marketUnderstanding.emergingThemes.join("; ") || "None recorded."}`,
    `- Discussion relevance: ${understanding.marketUnderstanding.discussionRelevance ?? "Not assessed."}`,
    `- Domain relevance: ${understanding.marketUnderstanding.domainRelevance ?? "Not assessed."}`,
    `- Evidence strength: ${understanding.marketUnderstanding.evidenceStrength}`,
    "",
    "STRATEGIC UNDERSTANDING:",
    `- Recommended positioning: ${understanding.strategicUnderstanding.recommendedPositioning ?? "Not available."}`,
    `- Primary direction: ${understanding.strategicUnderstanding.recommendedDirection}`,
    understanding.strategicUnderstanding.secondaryDirection
      ? `- Secondary direction: ${understanding.strategicUnderstanding.secondaryDirection}`
      : "",
    `- Executive action: ${understanding.strategicUnderstanding.recommendedExecutiveAction}`,
    `- Deployment direction: ${understanding.strategicUnderstanding.recommendedDeploymentDirection}`,
    `- Primary objective: ${understanding.strategicUnderstanding.primaryExecutiveObjective}`,
    `- Rationale: ${understanding.strategicUnderstanding.rationale.join(" ") || "None recorded."}`,
    "",
    "OPPORTUNITY UNDERSTANDING:",
    `- Business opportunity: ${understanding.opportunityUnderstanding.businessOpportunity ?? "Not identified."}`,
    `- Business alignment: ${understanding.opportunityUnderstanding.businessAlignment}`,
    `- Executive alignment: ${understanding.opportunityUnderstanding.executiveAlignment}`,
    `- Importance: ${understanding.opportunityUnderstanding.importance}`,
    `- Supporting evidence: ${understanding.opportunityUnderstanding.supportingEvidence.join("; ") || "None recorded."}`,
    understanding.opportunityUnderstanding.historicalEvidenceAvailable
      ? `- Historical evidence: ${understanding.opportunityUnderstanding.historicalEvidence.join("; ")}`
      : "- Historical evidence: none required; current intelligence is sufficient.",
    "",
    "PRIORITY UNDERSTANDING:",
    `- Level: ${understanding.priorityUnderstanding.level}`,
    `- Rationale: ${understanding.priorityUnderstanding.rationale.join(" ") || "None recorded."}`,
    "",
    "RISK UNDERSTANDING:",
    `- Overall risk: ${understanding.riskUnderstanding.overallRisk}`,
    `- Signals: ${understanding.riskUnderstanding.signals.join("; ") || "None."}`,
    `- Missing information: ${understanding.riskUnderstanding.missingInformation.join("; ") || "None."}`,
    "",
    "SUPPORTING EVIDENCE:",
    ...understanding.supportingEvidence.entries.map(
      (entry) =>
        `- [${entry.source}${entry.optional ? ", optional" : ", required"}] ${entry.label}: ${entry.detail}`,
    ),
    "",
    formatExecutiveIntelligenceForPrompt(understanding.executiveIntelligence),
    "",
    formatExecutiveInitiativeSelectionForPrompt(understanding.executiveInitiativeSelection),
    "",
    understanding.executiveCampaignNarrative
      ? formatExecutiveCampaignNarrativeForPrompt(understanding.executiveCampaignNarrative)
      : "",
    understanding.executiveOutputReview && understanding.executiveCampaignNarrative
      ? formatExecutiveOutputReviewForPrompt(
          understanding.executiveOutputReview,
          understanding.executiveCampaignNarrative,
        )
      : "",
    "",
    "INSTRUCTIONS:",
    "Express this executive understanding in generated language.",
    "Do not contradict strategic direction, buyer understanding, or opportunity importance.",
    "Historical evidence enriches output when present but is never required.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}

export function validateSharedExecutiveUnderstanding(
  understandings: ExecutiveUnderstanding[],
): { consistent: boolean; errors: string[] } {
  const errors: string[] = [];

  if (understandings.length <= 1) {
    return { consistent: true, errors };
  }

  const [first, ...rest] = understandings;
  for (const other of rest) {
    if (first.metadata.organizationId !== other.metadata.organizationId) {
      errors.push("Executive Understanding organization mismatch across workflows.");
    }
    if (first.metadata.discussionId !== other.metadata.discussionId) {
      errors.push("Executive Understanding discussion mismatch across workflows.");
    }
    if (
      first.metadata.understandingFingerprint !==
      other.metadata.understandingFingerprint
    ) {
      errors.push("Executive Understanding fingerprint mismatch across workflows.");
    }
    if (
      first.strategicUnderstanding.recommendedDirection !==
      other.strategicUnderstanding.recommendedDirection
    ) {
      errors.push("Strategic direction drift detected across workflows.");
    }
  }

  return { consistent: errors.length === 0, errors };
}
