import { normalizeBriefingStatus, type BriefingStatusKey } from "@/lib/briefingStatus";
import { normalizeDiscussionLifecycleKey } from "@/lib/discussionStatus";
import {
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_ORDER,
  type OpportunityStatusKey,
} from "@/lib/opportunityStatus";
import { computeDiscussionAgeDays } from "@/services/brain/brainContextHelpers";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import type { ExecutiveMemory } from "@/services/brain/executiveMemoryTypes";
import type {
  ExecutiveLearningEvent,
  MarketEvidenceEntry,
  PromotionCandidate,
  PromotionReadiness,
  RefreshLearningEntry,
} from "@/services/brain/executiveLearningTypes";
import {
  MAX_PROMOTION_CANDIDATES,
  PROMOTION_HIGH_MIN_CONFIDENCE,
  PROMOTION_HIGH_MIN_DOMAINS,
  PROMOTION_HIGH_MIN_OCCURRENCES,
  PROMOTION_LOW_MIN_OCCURRENCES,
  PROMOTION_MEDIUM_MIN_DOMAINS,
  PROMOTION_MEDIUM_MIN_OCCURRENCES,
} from "@/services/brain/executiveLearningTypes";
import { splitMemoryPhrases } from "@/services/brain/executiveMemoryHelpers";

export function computePromotionReadiness(input: {
  occurrences: number;
  domainsAffected: number;
  confidence: number | null;
}): PromotionReadiness {
  if (input.occurrences < PROMOTION_LOW_MIN_OCCURRENCES) {
    return "none";
  }

  if (
    input.occurrences >= PROMOTION_HIGH_MIN_OCCURRENCES &&
    input.domainsAffected >= PROMOTION_HIGH_MIN_DOMAINS &&
    (input.confidence ?? 0) >= PROMOTION_HIGH_MIN_CONFIDENCE
  ) {
    return "high";
  }

  if (
    input.occurrences >= PROMOTION_MEDIUM_MIN_OCCURRENCES &&
    input.domainsAffected >= PROMOTION_MEDIUM_MIN_DOMAINS
  ) {
    return "medium";
  }

  return "low";
}

export function buildLearningEvent(input: {
  event: string;
  timestamp?: string | null;
  linkedObjectType: ExecutiveLearningEvent["linkedObjectType"];
  linkedObjectId?: string | null;
  frequency?: number;
}): ExecutiveLearningEvent {
  return {
    event: input.event,
    timestamp: input.timestamp ?? null,
    linkedObjectType: input.linkedObjectType,
    linkedObjectId: input.linkedObjectId ?? null,
    frequency: input.frequency ?? 1,
    latestOccurrence: input.timestamp ?? null,
  };
}

export function buildBriefingDecisionEvents(
  briefings: AthenaReview[],
): ExecutiveLearningEvent[] {
  const events: ExecutiveLearningEvent[] = [];

  for (const briefing of briefings) {
    const status = normalizeBriefingStatus(briefing.status);
    events.push(
      buildLearningEvent({
        event: `briefing_${status}`,
        timestamp: briefing.approved_at ?? briefing.updated_at ?? briefing.created_at,
        linkedObjectType: "briefing",
        linkedObjectId: briefing.id,
      }),
    );
  }

  return events.sort((a, b) =>
    (b.latestOccurrence ?? "").localeCompare(a.latestOccurrence ?? ""),
  );
}

export function buildSalesProgressionEvents(
  opportunities: Opportunity[],
): ExecutiveLearningEvent[] {
  const events: ExecutiveLearningEvent[] = [];

  for (const opportunity of opportunities) {
    const status = normalizeOpportunityStatus(opportunity.status);
    if (status === "pending") {
      continue;
    }

    events.push(
      buildLearningEvent({
        event: `opportunity_${status}`,
        timestamp: opportunity.updated_at ?? opportunity.created_at,
        linkedObjectType: "opportunity",
        linkedObjectId: opportunity.id,
      }),
    );
  }

  return events.sort((a, b) =>
    (b.latestOccurrence ?? "").localeCompare(a.latestOccurrence ?? ""),
  );
}

export function countBriefingStatuses(
  briefings: AthenaReview[],
): Record<BriefingStatusKey, number> {
  const counts: Record<BriefingStatusKey, number> = {
    draft: 0,
    approved: 0,
    needs_revision: 0,
    rejected: 0,
  };

  for (const briefing of briefings) {
    counts[normalizeBriefingStatus(briefing.status)] += 1;
  }

  return counts;
}

export function countSalesStatuses(
  opportunities: Opportunity[],
): Record<OpportunityStatusKey, number> {
  const counts = Object.fromEntries(
    OPPORTUNITY_STATUS_ORDER.map((key) => [key, 0]),
  ) as Record<OpportunityStatusKey, number>;

  for (const opportunity of opportunities) {
    counts[normalizeOpportunityStatus(opportunity.status)] += 1;
  }

  return counts;
}

export function groupAnalysisCounts(
  analyses: DiscussionAnalysis[],
): Map<string, { count: number; latest: string }> {
  const map = new Map<string, { count: number; latest: string }>();

  for (const analysis of analyses) {
    const existing = map.get(analysis.discussion_id) ?? {
      count: 0,
      latest: analysis.created_at,
    };
    existing.count += 1;
    if (analysis.created_at > existing.latest) {
      existing.latest = analysis.created_at;
    }
    map.set(analysis.discussion_id, existing);
  }

  return map;
}

export function groupBriefingCountsByOpportunity(
  briefings: AthenaReview[],
): Map<string, { count: number; latest: string }> {
  const map = new Map<string, { count: number; latest: string }>();

  for (const briefing of briefings) {
    if (!briefing.opportunity_id) {
      continue;
    }

    const timestamp = briefing.updated_at ?? briefing.created_at;
    const existing = map.get(briefing.opportunity_id) ?? {
      count: 0,
      latest: timestamp,
    };
    existing.count += 1;
    if (timestamp > existing.latest) {
      existing.latest = timestamp;
    }
    map.set(briefing.opportunity_id, existing);
  }

  return map;
}

export function buildRefreshEntries(
  map: Map<string, { count: number; latest: string }>,
  objectType: RefreshLearningEntry["objectType"],
  minCount = 2,
): RefreshLearningEntry[] {
  return [...map.entries()]
    .filter(([, value]) => value.count >= minCount)
    .map(([linkedObjectId, value]) => ({
      objectType,
      linkedObjectId,
      count: value.count,
      latestRefresh: value.latest,
    }))
    .sort((a, b) => b.count - a.count);
}

export function buildMarketEvidenceFromMemory(
  memory: ExecutiveMemory,
): MarketEvidenceEntry[] {
  const evidence: MarketEvidenceEntry[] = [];

  for (const entry of memory.painPointKnowledge) {
    const domainsAffected = entry.primaryDomainId ? 1 : 0;
    evidence.push({
      category: "pain_point",
      value: entry.painPoint,
      occurrences: entry.occurrences,
      domainsInvolved: entry.primaryDomainName ? [entry.primaryDomainName] : [],
      domainIds: entry.primaryDomainId ? [entry.primaryDomainId] : [],
      lastSeen: entry.lastSeen,
      confidence: entry.confidence,
      promotionReadiness: computePromotionReadiness({
        occurrences: entry.occurrences,
        domainsAffected: Math.max(domainsAffected, entry.occurrences >= 2 ? 1 : 0),
        confidence: entry.confidence,
      }),
    });
  }

  for (const entry of memory.competitorKnowledge) {
    evidence.push({
      category: "competitor",
      value: entry.name,
      occurrences: entry.mentions,
      domainsInvolved: entry.domainName ? [entry.domainName] : [],
      domainIds: entry.domainId ? [entry.domainId] : [],
      lastSeen: entry.lastSeen,
      confidence: null,
      promotionReadiness: computePromotionReadiness({
        occurrences: entry.mentions,
        domainsAffected: entry.domainId ? 1 : 0,
        confidence: null,
      }),
    });
  }

  for (const entry of memory.terminologyKnowledge) {
    evidence.push({
      category: "terminology",
      value: entry.term,
      occurrences: entry.count,
      domainsInvolved: entry.sources.filter((source) => source.startsWith("domain")),
      domainIds: [],
      lastSeen: null,
      confidence: null,
      promotionReadiness: computePromotionReadiness({
        occurrences: entry.count,
        domainsAffected: entry.sources.length >= 2 ? 2 : 1,
        confidence: null,
      }),
    });
  }

  for (const [stage, count] of Object.entries(memory.audienceKnowledge.buyerStageDistribution)) {
    if (stage === "unknown" || count < 2) {
      continue;
    }
    evidence.push({
      category: "buyer_stage",
      value: stage,
      occurrences: count,
      domainsInvolved: [],
      domainIds: [],
      lastSeen: null,
      confidence: memory.performanceKnowledge.averageAnalysisConfidence,
      promotionReadiness: computePromotionReadiness({
        occurrences: count,
        domainsAffected: 1,
        confidence: memory.performanceKnowledge.averageAnalysisConfidence,
      }),
    });
  }

  if (memory.patternKnowledge.mostCommonObjection) {
    evidence.push({
      category: "objection",
      value: memory.patternKnowledge.mostCommonObjection,
      occurrences: 2,
      domainsInvolved: memory.patternKnowledge.mostActiveDomainName
        ? [memory.patternKnowledge.mostActiveDomainName]
        : [],
      domainIds: memory.patternKnowledge.mostActiveDomainId
        ? [memory.patternKnowledge.mostActiveDomainId]
        : [],
      lastSeen: null,
      confidence: null,
      promotionReadiness: "low",
    });
  }

  if (memory.patternKnowledge.mostCommonOpportunityReason) {
    evidence.push({
      category: "opportunity_category",
      value: memory.patternKnowledge.mostCommonOpportunityReason,
      occurrences: 2,
      domainsInvolved: [],
      domainIds: [],
      lastSeen: null,
      confidence: memory.performanceKnowledge.averageOpportunityScore,
      promotionReadiness: "low",
    });
  }

  if (memory.patternKnowledge.mostCommonRecommendation) {
    evidence.push({
      category: "recommendation",
      value: memory.patternKnowledge.mostCommonRecommendation,
      occurrences: 2,
      domainsInvolved: [],
      domainIds: [],
      lastSeen: null,
      confidence: memory.performanceKnowledge.averageAnalysisConfidence,
      promotionReadiness: "low",
    });
  }

  if (memory.patternKnowledge.mostCommonDeploymentType) {
    evidence.push({
      category: "deployment_pattern",
      value: memory.patternKnowledge.mostCommonDeploymentType,
      occurrences: 2,
      domainsInvolved: [],
      domainIds: [],
      lastSeen: null,
      confidence: null,
      promotionReadiness: "low",
    });
  }

  for (const domain of memory.marketKnowledge.mostActiveDomains) {
    for (const phrase of splitMemoryPhrases(domain.market)) {
      evidence.push({
        category: "content_request",
        value: phrase,
        occurrences: domain.discussionCount,
        domainsInvolved: [domain.domainName],
        domainIds: [domain.domainId],
        lastSeen: null,
        confidence: domain.confidence,
        promotionReadiness: computePromotionReadiness({
          occurrences: domain.discussionCount,
          domainsAffected: 1,
          confidence: domain.confidence,
        }),
      });
    }
  }

  return evidence;
}

export function buildPromotionCandidates(
  evidence: MarketEvidenceEntry[],
): PromotionCandidate[] {
  return evidence
    .filter((entry) => entry.promotionReadiness !== "none")
    .map((entry) => ({
      category: entry.category,
      value: entry.value,
      occurrences: entry.occurrences,
      domainsAffected: Math.max(entry.domainIds.length, entry.domainsInvolved.length, 1),
      confidence: entry.confidence,
      promotionReadiness: entry.promotionReadiness,
      lastSeen: entry.lastSeen,
    }))
    .sort((a, b) => {
      const readinessOrder = { high: 3, medium: 2, low: 1, none: 0 };
      const readinessDiff =
        readinessOrder[b.promotionReadiness] - readinessOrder[a.promotionReadiness];
      if (readinessDiff !== 0) {
        return readinessDiff;
      }
      return b.occurrences - a.occurrences;
    })
    .slice(0, MAX_PROMOTION_CANDIDATES);
}

export function buildDiscussionLearning(input: {
  discussions: Discussion[];
  analyses: DiscussionAnalysis[];
  updateCounts: Map<string, number>;
}): import("@/services/brain/executiveLearningTypes").DiscussionLearning {
  const analysisCounts = groupAnalysisCounts(input.analyses);
  const lifecycleDistribution: Record<string, number> = {};
  const stateDistribution: Record<string, number> = {};
  let totalAgeDays = 0;
  let ageCount = 0;
  let latestActivity: string | null = null;

  for (const discussion of input.discussions) {
    const lifecycle = normalizeDiscussionLifecycleKey(discussion.status) ?? "unknown";
    lifecycleDistribution[lifecycle] = (lifecycleDistribution[lifecycle] ?? 0) + 1;
    stateDistribution[discussion.status] = (stateDistribution[discussion.status] ?? 0) + 1;

    const age = computeDiscussionAgeDays(discussion.created_at);
    if (age != null) {
      totalAgeDays += age;
      ageCount += 1;
    }

    const activity = discussion.last_activity ?? discussion.created_at;
    if (activity && (!latestActivity || activity > latestActivity)) {
      latestActivity = activity;
    }
  }

  const repeatedAnalysisCount = [...analysisCounts.values()].filter(
    (value) => value.count > 1,
  ).length;

  const refreshCount = [...input.updateCounts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );

  const events: ExecutiveLearningEvent[] = input.discussions.slice(0, 20).map(
    (discussion) =>
      buildLearningEvent({
        event: `discussion_${normalizeDiscussionLifecycleKey(discussion.status) ?? "unknown"}`,
        timestamp: discussion.last_activity ?? discussion.created_at,
        linkedObjectType: "discussion",
        linkedObjectId: discussion.id,
        frequency: input.updateCounts.get(discussion.id) ?? 1,
      }),
  );

  return {
    refreshCount,
    lifecycleDistribution,
    repeatedAnalysisCount,
    reprocessingCount: repeatedAnalysisCount,
    latestActivity,
    averageAgeDays: ageCount > 0 ? Math.round(totalAgeDays / ageCount) : null,
    stateDistribution,
    events,
  };
}

export function buildBriefingLearning(
  briefings: AthenaReview[],
): import("@/services/brain/executiveLearningTypes").BriefingLearning {
  const counts = countBriefingStatuses(briefings);
  const approvalHistory = buildBriefingDecisionEvents(briefings).filter((event) =>
    event.event.includes("approved"),
  );

  return {
    approved: counts.approved,
    needsRevision: counts.needs_revision,
    rejected: counts.rejected,
    draft: counts.draft,
    approvalFrequency: counts.approved,
    revisionFrequency: counts.needs_revision + counts.rejected,
    approvalHistory,
    latestDecision: approvalHistory[0] ?? buildBriefingDecisionEvents(briefings)[0] ?? null,
  };
}

export function buildPatternLearning(input: {
  memory: ExecutiveMemory;
  briefings: AthenaReview[];
  opportunities: Opportunity[];
}): import("@/services/brain/executiveLearningTypes").PatternLearning {
  const approvedStages = input.briefings
    .filter((briefing) => normalizeBriefingStatus(briefing.status) === "approved")
    .map((briefing) => briefing.buyer_stage?.trim())
    .filter((value): value is string => Boolean(value));

  const revisedStages = input.briefings
    .filter((briefing) => {
      const status = normalizeBriefingStatus(briefing.status);
      return status === "needs_revision" || status === "rejected";
    })
    .map((briefing) => briefing.buyer_stage?.trim())
    .filter((value): value is string => Boolean(value));

  const stageCount = (stages: string[]) => {
    const map = new Map<string, number>();
    for (const stage of stages) {
      map.set(stage, (map.get(stage) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  const outcomeMap = new Map<string, number>();
  for (const opportunity of input.opportunities) {
    const key = normalizeOpportunityStatus(opportunity.status);
    outcomeMap.set(key, (outcomeMap.get(key) ?? 0) + 1);
  }

  return {
    mostApprovedBuyerStage: stageCount(approvedStages),
    mostRevisedBuyerStage: stageCount(revisedStages),
    mostCommonOpportunityOutcome:
      [...outcomeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    mostCommonDeploymentCompletion:
      input.memory.patternKnowledge.mostCommonDeploymentType,
    mostCommonObjection: input.memory.patternKnowledge.mostCommonObjection,
    mostCommonTerminology:
      input.memory.terminologyKnowledge[0]?.term ??
      input.memory.patternKnowledge.mostCommonObjection,
    mostCommonOpportunityReason:
      input.memory.patternKnowledge.mostCommonOpportunityReason,
  };
}
