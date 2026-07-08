import {
  classifyOpportunityPriority,
  getUrgencyRank,
  type OpportunityPriorityKey,
} from "@/lib/opportunityPriority";
import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";
import type {
  ExecutiveReasoning,
  ExecutiveReasoningSourceContext,
  MarketAssessment,
  OpportunityAssessment,
  PriorityAssessment,
  RecommendedDirection,
  RecommendedDirectionKey,
  RiskAssessment,
  StrategicAssessment,
} from "@/services/brain/executiveReasoningTypes";
import { REASONING_PRIORITY_THRESHOLDS } from "@/services/brain/executiveReasoningTypes";
import { extractAudienceSignalsFromMasterProfile } from "@/services/brain/masterProfileHelpers";
import type { Opportunity } from "@/services/opportunityService";

export function classifyReasoningPriority(input: {
  score: number;
  urgency: string | null;
  salesStatus: string | null;
}): { level: OpportunityPriorityKey; thresholdsApplied: string[] } {
  const thresholdsApplied: string[] = [];
  const urgencyRank = getUrgencyRank(input.urgency);
  const salesStatus = normalizeOpportunityStatus(input.salesStatus);

  if (salesStatus === "won" || salesStatus === "lost") {
    return { level: "low_priority", thresholdsApplied: ["closed_outcome"] };
  }

  if (
    input.score >= REASONING_PRIORITY_THRESHOLDS.immediate.minScore ||
    urgencyRank >= REASONING_PRIORITY_THRESHOLDS.immediate.minUrgencyRank ||
    (
      REASONING_PRIORITY_THRESHOLDS.immediate.activeSalesStatuses as readonly string[]
    ).includes(salesStatus)
  ) {
    if (input.score >= REASONING_PRIORITY_THRESHOLDS.immediate.minScore) {
      thresholdsApplied.push(`score>=${REASONING_PRIORITY_THRESHOLDS.immediate.minScore}`);
    }
    if (urgencyRank >= REASONING_PRIORITY_THRESHOLDS.immediate.minUrgencyRank) {
      thresholdsApplied.push(
        `urgency_rank>=${REASONING_PRIORITY_THRESHOLDS.immediate.minUrgencyRank}`,
      );
    }
    if (
      (
        REASONING_PRIORITY_THRESHOLDS.immediate.activeSalesStatuses as readonly string[]
      ).includes(salesStatus)
    ) {
      thresholdsApplied.push(`sales_status=${salesStatus}`);
    }
    return { level: "immediate_action", thresholdsApplied };
  }

  if (
    input.score >= REASONING_PRIORITY_THRESHOLDS.high.minScore ||
    urgencyRank >= REASONING_PRIORITY_THRESHOLDS.high.minUrgencyRank ||
    salesStatus === REASONING_PRIORITY_THRESHOLDS.high.salesStatus
  ) {
    if (input.score >= REASONING_PRIORITY_THRESHOLDS.high.minScore) {
      thresholdsApplied.push(`score>=${REASONING_PRIORITY_THRESHOLDS.high.minScore}`);
    }
    if (urgencyRank >= REASONING_PRIORITY_THRESHOLDS.high.minUrgencyRank) {
      thresholdsApplied.push(
        `urgency_rank>=${REASONING_PRIORITY_THRESHOLDS.high.minUrgencyRank}`,
      );
    }
    if (salesStatus === REASONING_PRIORITY_THRESHOLDS.high.salesStatus) {
      thresholdsApplied.push("sales_status=qualified");
    }
    return { level: "high_intent", thresholdsApplied };
  }

  if (
    input.score >= REASONING_PRIORITY_THRESHOLDS.monitor.minScore ||
    urgencyRank >= REASONING_PRIORITY_THRESHOLDS.monitor.minUrgencyRank
  ) {
    if (input.score >= REASONING_PRIORITY_THRESHOLDS.monitor.minScore) {
      thresholdsApplied.push(`score>=${REASONING_PRIORITY_THRESHOLDS.monitor.minScore}`);
    }
    if (urgencyRank >= REASONING_PRIORITY_THRESHOLDS.monitor.minUrgencyRank) {
      thresholdsApplied.push(
        `urgency_rank>=${REASONING_PRIORITY_THRESHOLDS.monitor.minUrgencyRank}`,
      );
    }
    return { level: "monitor", thresholdsApplied };
  }

  return { level: "low_priority", thresholdsApplied: ["default_low_priority"] };
}

export function buildStrategicAssessment(
  context: ExecutiveReasoningSourceContext,
): StrategicAssessment {
  const memory = context.executiveMemory;
  const learning = context.executiveLearning;

  const recurringPainPoints = memory.painPointKnowledge
    .slice(0, 5)
    .map((entry) => entry.painPoint);

  const knownTerminology = memory.terminologyKnowledge
    .slice(0, 8)
    .map((entry) => entry.term);

  const executivePreferences = [
    ...learning.decisionLearning.events
      .filter((event) => event.event.includes("approved"))
      .slice(0, 3)
      .map((event) => event.event),
    ...learning.patternLearning.mostApprovedBuyerStage
      ? [`preferred_buyer_stage:${learning.patternLearning.mostApprovedBuyerStage}`]
      : [],
  ];

  const historicalPatterns = [
    learning.patternLearning.mostCommonOpportunityReason,
    memory.patternKnowledge.mostCommonRecommendation,
    learning.patternLearning.mostCommonObjection,
    memory.patternKnowledge.mostCommonDeploymentType,
  ].filter((value): value is string => Boolean(value?.trim()));

  const focusDomain = context.discussionMemory.focus?.discussion?.community_id
    ? context.domainMemory.domains.find(
        (domain) =>
          domain.id === context.discussionMemory.focus?.discussion?.community_id,
      )
    : context.domainMemory.domains[0];

  return {
    mostRelevantMarketContext:
      focusDomain?.athenaUnderstanding ??
      focusDomain?.market ??
      context.snapshot.marketSummary,
    recurringPainPoints,
    knownTerminology,
    executivePreferences,
    previousApprovals: learning.briefingLearning.approved,
    historicalPatterns,
    supportingEvidenceCount: context.marketEvidence.length,
  };
}

export function buildBusinessAssessment(
  context: ExecutiveReasoningSourceContext,
): ExecutiveReasoning["businessAssessment"] {
  const identity = context.identityMemory;
  const constraints = context.executiveMemory.businessKnowledge.businessConstraints;
  const homepageLearning =
    identity.homepageLearning ??
    context.executiveMemory.businessKnowledge.homepageLearning;

  return {
    expertise: identity.expertise,
    preferredPositioning: identity.aboutYou,
    voice: identity.greetingName
      ? `${identity.greetingName}${identity.expertise ? ` — ${identity.expertise}` : ""}`
      : context.executiveMemory.businessKnowledge.voice,
    website: identity.website,
    homepageLearning,
    businessConstraints: constraints,
    knowledgeCompleteness: identity.completenessScore,
    isBrainTrained: identity.isBrainTrained,
    summary: context.snapshot.businessSummary,
  };
}

export function resolveEvidenceStrength(
  context: ExecutiveReasoningSourceContext,
): MarketAssessment["evidenceStrength"] {
  const confidence = context.knowledgeMemory.knowledgeConfidence;
  const evidenceCount = context.marketEvidence.length;

  if (confidence != null && confidence >= 60 && evidenceCount >= 5) {
    return "strong";
  }

  if (confidence != null && confidence >= 35 && evidenceCount >= 2) {
    return "moderate";
  }

  if (evidenceCount > 0 || confidence != null) {
    return "weak";
  }

  return "unknown";
}

export function buildMarketAssessment(
  context: ExecutiveReasoningSourceContext,
): MarketAssessment {
  const focusDiscussion = context.discussionMemory.focus?.discussion;
  const focusDomain = focusDiscussion?.community_id
    ? context.domainMemory.domains.find(
        (domain) => domain.id === focusDiscussion.community_id,
      )
    : null;

  const currentMarketSignals = context.marketEvidence
    .slice(0, 5)
    .map((entry) => `${entry.category}: ${entry.value} (${entry.occurrences}x)`);

  const audienceSignals = extractAudienceSignalsFromMasterProfile(
    context.identityMemory.masterProfile,
  );

  const recurringObjections = [
    ...context.marketEvidence
      .filter((entry) => entry.category === "objection")
      .slice(0, 5)
      .map((entry) => entry.value),
    ...audienceSignals.commonObjections.slice(0, 3),
  ].filter((value, index, array) => array.indexOf(value) === index);

  const recurringTerminology = context.executiveMemory.terminologyKnowledge
    .slice(0, 5)
    .map((entry) => entry.term);

  return {
    currentMarketSignals,
    discussionRelevance: focusDiscussion?.summary ?? focusDiscussion?.title ?? null,
    domainMaturity: focusDomain
      ? [
          focusDomain.healthLabel,
          focusDomain.memberCount != null
            ? `${focusDomain.memberCount} community members`
            : null,
          focusDomain.priority != null && focusDomain.priority >= 3
            ? "high-priority domain"
            : null,
        ]
          .filter(Boolean)
          .join(" — ") || null
      : null,
    evidenceStrength: resolveEvidenceStrength(context),
    recurringObjections,
    recurringTerminology,
    marketConfidence: context.knowledgeMemory.knowledgeConfidence,
    activeDomainCount: context.domainMemory.activeDomainCount,
  };
}

export function buildOpportunityAssessment(
  context: ExecutiveReasoningSourceContext,
): OpportunityAssessment {
  const focusOpportunity =
    context.opportunityMemory.focus?.opportunity ??
    context.discussionMemory.focus?.linkedOpportunity;
  const focusDiscussion = context.discussionMemory.focus?.discussion;
  const score =
    focusOpportunity?.score ??
    focusDiscussion?.opportunity_score ??
    context.contextSummary.highestOpportunityScore ??
    0;

  const priority = classifyReasoningPriority({
    score,
    urgency: focusOpportunity?.urgency ?? null,
    salesStatus: focusOpportunity?.status ?? null,
  });

  const businessRelevance =
    context.identityMemory.isBrainTrained && score >= 50
      ? "high"
      : score >= 25
        ? "medium"
        : score > 0
          ? "low"
          : "unknown";

  const approvedCount = context.executiveLearning.briefingLearning.approved;
  const executiveAlignment =
    approvedCount > 0 && priority.level !== "low_priority"
      ? "aligned"
      : approvedCount > 0
        ? "partial"
        : "unknown";

  return {
    importance: priority.level,
    businessRelevance,
    executiveAlignment,
    supportingEvidence: context.marketEvidence
      .slice(0, 3)
      .map((entry) => entry.value),
    knownObjections: context.marketEvidence
      .filter((entry) => entry.category === "objection")
      .slice(0, 3)
      .map((entry) => entry.value),
    relatedHistoricalOpportunities:
      context.executiveMemory.metadata.opportunityCount,
    historicalOutcomes: context.executiveLearning.salesLearning.statusCounts,
    focusDiscussionScore: focusDiscussion?.opportunity_score ?? null,
  };
}

export function buildPriorityAssessment(
  context: ExecutiveReasoningSourceContext,
): PriorityAssessment {
  const focusOpportunity =
    context.opportunityMemory.focus?.opportunity ??
    context.discussionMemory.focus?.linkedOpportunity;
  const focusDiscussion = context.discussionMemory.focus?.discussion;

  const score =
    focusOpportunity?.score ??
    focusDiscussion?.opportunity_score ??
    context.operationalMemory.todaysIntelligence.highestOpportunity?.score ??
    0;

  const classified = classifyReasoningPriority({
    score,
    urgency: focusOpportunity?.urgency ?? null,
    salesStatus: focusOpportunity?.status ?? null,
  });

  const rationale: string[] = [];
  if (focusDiscussion) {
    rationale.push(`Focus discussion score: ${focusDiscussion.opportunity_score}.`);
    if (focusDiscussion.priority >= 3) {
      rationale.push(`Executive-flagged discussion priority: ${focusDiscussion.priority}.`);
    }
  }
  if (focusOpportunity) {
    rationale.push(
      `Linked opportunity score: ${focusOpportunity.score}, status: ${focusOpportunity.status}.`,
    );
  }
  if (context.operationalMemory.queueCounts.immediateActionOpportunities > 0) {
    rationale.push(
      `${context.operationalMemory.queueCounts.immediateActionOpportunities} immediate-action opportunity(ies) in queue.`,
    );
  }

  return {
    level: classified.level,
    rationale,
    thresholdsApplied: classified.thresholdsApplied,
  };
}

export function buildRiskAssessment(
  context: ExecutiveReasoningSourceContext,
): RiskAssessment {
  const signals: string[] = [...context.contextWarnings.messages];
  const missingInformation = [...context.businessMemory.missingFields];
  const conflictingEvidence: string[] = [];

  const lowConfidence =
    context.knowledgeMemory.knowledgeConfidence != null &&
    context.knowledgeMemory.knowledgeConfidence < 40;

  if (lowConfidence) {
    signals.push("Knowledge confidence is below 40%.");
  }

  if (!context.identityMemory.isBrainTrained) {
    signals.push("Athena Brain is not fully trained.");
    missingInformation.push("trained_brain");
  }

  const revisionHistoryCount =
    context.executiveLearning.briefingLearning.revisionFrequency;
  const refreshEvents = context.executiveLearning.refreshLearning.totalRefreshEvents;

  if (revisionHistoryCount >= 3) {
    signals.push("Elevated briefing revision history.");
  }

  if (refreshEvents >= 3) {
    signals.push("Repeated refresh activity detected across discussions or analyses.");
  }

  const sparseHistory =
    context.executiveMemory.metadata.analysisCount < 3 ||
    context.executiveMemory.metadata.discussionCount < 2;

  if (sparseHistory) {
    signals.push("Limited organizational history available.");
  }

  if (
    context.marketEvidence.some((entry) => entry.promotionReadiness === "high") &&
    context.marketEvidence.some((entry) => entry.promotionReadiness === "low")
  ) {
    conflictingEvidence.push("Mixed promotion readiness across market evidence.");
  }

  let overallRisk: RiskAssessment["overallRisk"] = "low";
  if (
    signals.length >= 3 ||
    lowConfidence ||
    revisionHistoryCount >= 5 ||
    sparseHistory
  ) {
    overallRisk = "high";
  } else if (signals.length >= 1 || missingInformation.length >= 2) {
    overallRisk = "medium";
  }

  return {
    signals,
    lowConfidence,
    missingInformation,
    conflictingEvidence,
    sparseHistory,
    revisionHistoryCount,
    overallRisk,
  };
}

export function buildRecommendedDirection(input: {
  context: ExecutiveReasoningSourceContext;
  priority: PriorityAssessment;
  risk: RiskAssessment;
}): RecommendedDirection {
  const { context, priority, risk } = input;
  const rationale: string[] = [];
  let primary: RecommendedDirectionKey = "consultative";
  let secondary: RecommendedDirectionKey | null = null;

  if (risk.overallRisk === "high" && priority.level === "immediate_action") {
    primary = "escalate";
    rationale.push("High risk with immediate priority warrants escalation.");
  } else if (!context.identityMemory.isBrainTrained) {
    primary = "educational";
    rationale.push("Brain training incomplete — lead with educational value.");
  } else if (priority.level === "immediate_action" || priority.level === "high_intent") {
    primary = "consultative";
    secondary = "sales_first";
    rationale.push("Priority opportunity — consult first, advance when aligned.");
  } else if (priority.level === "monitor") {
    primary = "monitor";
    rationale.push("Signals present but below high-intent threshold.");
  } else if (context.executiveLearning.briefingLearning.revisionFrequency >= 3) {
    primary = "relationship_first";
    rationale.push("Revision history suggests relationship-first approach.");
  } else if (context.executiveLearning.refreshLearning.totalRefreshEvents >= 3) {
    primary = "relationship_first";
    rationale.push("Repeated refresh activity suggests improving execution over changing direction.");
  } else if (context.executiveLearning.briefingLearning.approved >= 2) {
    primary = "consultative";
    rationale.push("Prior approved briefings support consultative positioning.");
  } else {
    primary = "educational";
    rationale.push("Default to educational positioning with sparse executive history.");
  }

  return { primary, secondary, rationale };
}

export function classifyOpportunityPriorityFromContext(
  opportunity: Opportunity,
): OpportunityPriorityKey {
  return classifyOpportunityPriority(opportunity);
}

export function formatExecutiveReasoningForPrompt(
  reasoning: ExecutiveReasoning,
): string {
  const sections = [
    "ATHENA EXECUTIVE REASONING:",
    "",
    "STRATEGIC ASSESSMENT:",
    `- Market context: ${reasoning.strategicAssessment.mostRelevantMarketContext ?? "Not available."}`,
    `- Recurring pain points: ${reasoning.strategicAssessment.recurringPainPoints.join("; ") || "None recorded."}`,
    `- Known terminology: ${reasoning.strategicAssessment.knownTerminology.join(", ") || "None recorded."}`,
    `- Previous approvals: ${reasoning.strategicAssessment.previousApprovals}`,
    `- Historical patterns: ${reasoning.strategicAssessment.historicalPatterns.join("; ") || "None recorded."}`,
    "",
    "BUSINESS ASSESSMENT:",
    `- ${reasoning.businessAssessment.summary}`,
    `- Completeness: ${reasoning.businessAssessment.knowledgeCompleteness}%`,
    `- Website: ${reasoning.businessAssessment.website ?? "Not recorded."}`,
    `- Homepage knowledge: ${reasoning.businessAssessment.homepageLearning?.slice(0, 240) ?? "Not available."}`,
    `- Constraints: ${reasoning.businessAssessment.businessConstraints.join("; ") || "None recorded."}`,
    "",
    "MARKET ASSESSMENT:",
    `- Evidence strength: ${reasoning.marketAssessment.evidenceStrength}`,
    `- Market confidence: ${reasoning.marketAssessment.marketConfidence ?? "Not measured"}%`,
    `- Signals: ${reasoning.marketAssessment.currentMarketSignals.join("; ") || "None recorded."}`,
    `- Objections: ${reasoning.marketAssessment.recurringObjections.join("; ") || "None recorded."}`,
    "",
    "PRIORITY ASSESSMENT:",
    `- Level: ${reasoning.priorityAssessment.level}`,
    `- Rationale: ${reasoning.priorityAssessment.rationale.join(" ") || "No additional rationale."}`,
    "",
    "RISK ASSESSMENT:",
    `- Overall risk: ${reasoning.riskAssessment.overallRisk}`,
    `- Signals: ${reasoning.riskAssessment.signals.join("; ") || "None."}`,
    "",
    "RECOMMENDED DIRECTION:",
    `- Primary: ${reasoning.recommendedDirection.primary}`,
    reasoning.recommendedDirection.secondary
      ? `- Secondary: ${reasoning.recommendedDirection.secondary}`
      : "",
    `- Rationale: ${reasoning.recommendedDirection.rationale.join(" ")}`,
    "",
    "INSTRUCTIONS:",
    "Use this executive reasoning to decide what matters in the discussion.",
    "Do not contradict validated executive decisions or recurring organizational evidence.",
    "Generation should follow the recommended direction unless the discussion clearly requires otherwise.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}

export function formatIdentityFromBrainContext(
  context: ExecutiveReasoningSourceContext,
): string {
  const identity = context.identityMemory;

  if (!identity.aboutYou && !identity.expertise && !identity.masterProfile) {
    return `
ATHENA BRAIN CONTEXT:
No Athena Identity profile has been configured yet.

Use the discussion context only. Do not invent a user persona, brand voice, methodology, offers, resources, lead magnets, or expertise.
`.trim();
  }

  return `
ATHENA BRAIN CONTEXT:

GREETING NAME:
${identity.greetingName || "Not available."}

ABOUT THE USER:
${identity.aboutYou || "Not provided."}

USER EXPERTISE:
${identity.expertise || "Not provided."}

USER WEBSITE:
${identity.website || "Not provided."}

MASTER IDENTITY PROFILE:
${JSON.stringify(identity.masterProfile ?? {}, null, 2)}

INSTRUCTIONS:
Use this identity context as the user's voice, expertise, methodology, terminology, rules, positioning, and CTA style.
Do not contradict it.
Do not invent credentials, guarantees, income promises, or unsupported claims.
`.trim();
}

export function buildDiscussionAnalysisBrainPrompt(
  context: ExecutiveReasoningSourceContext & {
    executiveReasoning: ExecutiveReasoning;
  },
): string {
  return [
    formatIdentityFromBrainContext(context),
    formatExecutiveReasoningForPrompt(context.executiveReasoning),
  ].join("\n\n");
}
