import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertOrganizationId,
  BrainContextNotFoundError,
} from "@/services/brain/brainContextBuilder";
import { buildExecutiveMemory } from "@/services/brain/executiveMemoryBuilder";
import type { ExecutiveMemory } from "@/services/brain/executiveMemoryTypes";
import {
  buildBriefingLearning,
  buildBriefingDecisionEvents,
  buildDiscussionLearning,
  buildMarketEvidenceFromMemory,
  buildPatternLearning,
  buildPromotionCandidates,
  buildRefreshEntries,
  buildSalesProgressionEvents,
  countBriefingStatuses,
  countSalesStatuses,
  groupAnalysisCounts,
  groupBriefingCountsByOpportunity,
} from "@/services/brain/executiveLearningHelpers";
import type {
  BuildExecutiveLearningParams,
  ExecutiveLearningSummary,
} from "@/services/brain/executiveLearningTypes";
import {
  EXECUTIVE_LEARNING_VERSION,
  MAX_EXECUTIVE_LEARNING_EVENTS,
  MAX_MARKET_EVIDENCE_ENTRIES,
} from "@/services/brain/executiveLearningTypes";
import { MAX_EXECUTIVE_MEMORY_ANALYSES } from "@/services/brain/executiveMemoryTypes";
import { getDiscussionById, getDiscussions } from "@/services/discussionService";
import { getCanonicalOpportunities, getOpportunityById } from "@/services/opportunityService";
import { belongsToOrganization } from "@/services/organizationService";
import { getReviewById, getReviews } from "@/services/reviewService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

export class ExecutiveLearningOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "ExecutiveLearningOrganizationRequiredError";
  }
}

async function fetchAnalyses(organizationId: string): Promise<DiscussionAnalysis[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MAX_EXECUTIVE_MEMORY_ANALYSES);

  if (error) {
    console.error("Error fetching analyses for executive learning:", error);
    return [];
  }

  return data ?? [];
}

async function fetchDiscussionUpdateCounts(
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_updates")
    .select("discussion_id")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error fetching discussion updates for learning:", error);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.discussion_id, (counts.get(row.discussion_id) ?? 0) + 1);
  }

  return counts;
}

async function verifyOptionalEntities(
  organizationId: string,
  params: BuildExecutiveLearningParams,
): Promise<void> {
  if (params.discussionId?.trim()) {
    const discussion = await getDiscussionById(
      params.discussionId.trim(),
      organizationId,
    );
    if (!discussion || !belongsToOrganization(discussion, organizationId)) {
      throw new BrainContextNotFoundError(
        `Discussion not found for organization: ${params.discussionId}`,
      );
    }
  }

  if (params.opportunityId?.trim()) {
    const opportunity = await getOpportunityById(
      params.opportunityId.trim(),
      organizationId,
    );
    if (!opportunity || !belongsToOrganization(opportunity, organizationId)) {
      throw new BrainContextNotFoundError(
        `Opportunity not found for organization: ${params.opportunityId}`,
      );
    }
  }

  if (params.briefingId?.trim()) {
    const briefing = await getReviewById(params.briefingId.trim(), organizationId);
    if (!briefing || !belongsToOrganization(briefing, organizationId)) {
      throw new BrainContextNotFoundError(
        `Briefing not found for organization: ${params.briefingId}`,
      );
    }
  }
}

type BuildExecutiveLearningInput = BuildExecutiveLearningParams & {
  sourceMemory?: ExecutiveMemory;
};

export async function buildExecutiveLearning(
  params: BuildExecutiveLearningInput,
): Promise<ExecutiveLearningSummary> {
  const organizationId = assertOrganizationId(params.organizationId);
  await verifyOptionalEntities(organizationId, params);

  const focusDomainId = params.domainId?.trim() || null;
  const focusDiscussionId = params.discussionId?.trim() || null;
  const focusOpportunityId = params.opportunityId?.trim() || null;
  const focusBriefingId = params.briefingId?.trim() || null;

  const memory =
    params.sourceMemory ??
    (await buildExecutiveMemory({
      organizationId,
      domainId: focusDomainId ?? undefined,
      discussionId: focusDiscussionId ?? undefined,
    }));

  const [discussions, opportunities, allBriefings, analyses, updateCounts] =
    await Promise.all([
      getDiscussions(organizationId),
      getCanonicalOpportunities(organizationId),
      getReviews(organizationId),
      fetchAnalyses(organizationId),
      fetchDiscussionUpdateCounts(organizationId),
    ]);

  const briefingEvents = buildBriefingDecisionEvents(allBriefings);
  const salesEvents = buildSalesProgressionEvents(opportunities);
  const decisionEvents = [...briefingEvents, ...salesEvents]
    .sort((a, b) =>
      (b.latestOccurrence ?? "").localeCompare(a.latestOccurrence ?? ""),
    )
    .slice(0, MAX_EXECUTIVE_LEARNING_EVENTS);

  const briefingDecisions = countBriefingStatuses(allBriefings);
  const opportunityProgressions = countSalesStatuses(opportunities);

  const discussionLearning = buildDiscussionLearning({
    discussions,
    analyses,
    updateCounts,
  });

  const briefingLearning = buildBriefingLearning(allBriefings);

  const salesLearning = {
    statusCounts: opportunityProgressions,
    events: salesEvents.slice(0, MAX_EXECUTIVE_LEARNING_EVENTS),
    latestProgression: salesEvents[0] ?? null,
    qualifiedCount: opportunityProgressions.qualified,
    wonCount: opportunityProgressions.won,
    lostCount: opportunityProgressions.lost,
  };

  const analysisCounts = groupAnalysisCounts(analyses);
  const briefingCountsByOpportunity = groupBriefingCountsByOpportunity(allBriefings);

  const discussionRefreshMap = new Map<string, { count: number; latest: string }>();
  for (const discussion of discussions) {
    const count = updateCounts.get(discussion.id) ?? 0;
    if (count >= 2) {
      discussionRefreshMap.set(discussion.id, {
        count,
        latest: discussion.last_activity ?? discussion.created_at,
      });
    }
  }

  const discussionRefreshes = buildRefreshEntries(
    discussionRefreshMap,
    "discussion",
    2,
  );
  const analysisRefreshes = buildRefreshEntries(analysisCounts, "analysis");
  const briefingRefreshes = buildRefreshEntries(
    briefingCountsByOpportunity,
    "briefing",
  );

  const opportunityRefreshMap = new Map<string, { count: number; latest: string }>();
  for (const opportunity of opportunities) {
    if (opportunity.updated_at > opportunity.created_at) {
      opportunityRefreshMap.set(opportunity.id, {
        count: 1,
        latest: opportunity.updated_at,
      });
    }
  }
  const opportunityRefreshes = buildRefreshEntries(
    opportunityRefreshMap,
    "opportunity",
    1,
  );

  const refreshLearning = {
    discussionRefreshes,
    analysisRefreshes,
    opportunityRefreshes,
    briefingRefreshes,
    totalRefreshEvents:
      discussionRefreshes.length +
      analysisRefreshes.length +
      opportunityRefreshes.length +
      briefingRefreshes.length,
  };

  const marketEvidence = buildMarketEvidenceFromMemory(memory).slice(
    0,
    MAX_MARKET_EVIDENCE_ENTRIES,
  );

  const repeatedEvidenceCount = marketEvidence.filter(
    (entry) => entry.occurrences >= 2,
  ).length;

  const promotionCandidates = buildPromotionCandidates(marketEvidence);

  const patternLearning = buildPatternLearning({
    memory,
    briefings: allBriefings,
    opportunities,
  });

  const totalValidatedDecisions =
    briefingDecisions.approved +
    briefingDecisions.needs_revision +
    briefingDecisions.rejected +
    salesEvents.length;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId,
      focusDomainId,
      focusDiscussionId,
      focusOpportunityId,
      focusBriefingId,
      learningVersion: EXECUTIVE_LEARNING_VERSION,
      discussionEvents: discussionLearning.events.length,
      briefingEvents: briefingEvents.length,
      salesEvents: salesEvents.length,
      refreshEvents: refreshLearning.totalRefreshEvents,
      marketEvidenceEvents: marketEvidence.length,
    },
    decisionLearning: {
      events: decisionEvents,
      briefingDecisions,
      opportunityProgressions,
      latestBriefingDecision: briefingEvents[0] ?? null,
      latestSalesProgression: salesEvents[0] ?? null,
      totalValidatedDecisions,
    },
    discussionLearning,
    briefingLearning,
    salesLearning,
    marketLearning: {
      evidence: marketEvidence,
      totalEvidenceItems: marketEvidence.length,
      repeatedEvidenceCount,
    },
    refreshLearning,
    patternLearning,
    promotionCandidates,
  };
}
