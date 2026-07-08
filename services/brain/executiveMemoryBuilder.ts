import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { blueprintHasPrompts } from "@/services/assetBlueprints/assetBlueprintService";
import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import {
  assertOrganizationId,
  BrainContextNotFoundError,
} from "@/services/brain/brainContextBuilder";
import {
  buildBriefingDecisionCounts,
  buildBuyerStageDistribution,
  buildDiscussionOutcomeDistribution,
  buildDomainDiscussionCounts,
  buildOpportunityStatusDistribution,
  collectBuyingSignals,
  collectCompetitors,
  collectPainPoints,
  collectTerminology,
  extractBusinessConstraints,
  extractVoiceFromProfile,
  mostCommonValue,
  splitMemoryPhrases,
  topDistributionKeys,
} from "@/services/brain/executiveMemoryHelpers";
import type {
  BuildExecutiveMemoryParams,
  ExecutiveMemory,
  ExecutiveMemorySourceContext,
} from "@/services/brain/executiveMemoryTypes";
import {
  EXECUTIVE_MEMORY_VERSION,
  MAX_EXECUTIVE_MEMORY_ANALYSES,
} from "@/services/brain/executiveMemoryTypes";
import {
  MAX_BLUEPRINTS_CONTEXT,
  MAX_KNOWLEDGE_CONTEXT,
} from "@/services/brain/brainContextTypes";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById, getDiscussions } from "@/services/discussionService";
import { getKnowledgeAssets } from "@/services/knowledgeAssetService";
import { getCanonicalOpportunities } from "@/services/opportunityService";
import { belongsToOrganization } from "@/services/organizationService";
import { getCanonicalReviews } from "@/services/reviewService";

export class ExecutiveMemoryOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "ExecutiveMemoryOrganizationRequiredError";
  }
}

async function fetchRecentAnalyses(
  organizationId: string,
  limit = MAX_EXECUTIVE_MEMORY_ANALYSES,
): Promise<DiscussionAnalysis[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching analyses for executive memory:", error);
    return [];
  }

  return data ?? [];
}

async function fetchRecentBlueprints(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MAX_BLUEPRINTS_CONTEXT);

  if (error) {
    console.error("Error fetching blueprints for executive memory:", error);
    return [];
  }

  return data ?? [];
}

async function verifyOptionalDiscussion(
  organizationId: string,
  discussionId?: string,
): Promise<void> {
  if (!discussionId?.trim()) {
    return;
  }

  const discussion = await getDiscussionById(discussionId.trim(), organizationId);
  if (!discussion || !belongsToOrganization(discussion, organizationId)) {
    throw new BrainContextNotFoundError(
      `Discussion not found for organization: ${discussionId}`,
    );
  }
}

type ExecutiveMemoryBuildInput = BuildExecutiveMemoryParams & {
  sourceContext?: ExecutiveMemorySourceContext;
};

export async function buildExecutiveMemory(
  params: ExecutiveMemoryBuildInput,
): Promise<ExecutiveMemory> {
  const organizationId = assertOrganizationId(params.organizationId);
  await verifyOptionalDiscussion(organizationId, params.discussionId);

  const focusDomainId = params.domainId?.trim() || null;
  const focusDiscussionId = params.discussionId?.trim() || null;
  const source = params.sourceContext;

  const [
    resolvedDiscussions,
    analyzedIds,
    resolvedOpportunities,
    resolvedBriefings,
    resolvedKnowledgeAssets,
    analyses,
    blueprints,
  ] = await Promise.all([
    getDiscussions(organizationId),
    getAnalyzedDiscussionIds(organizationId),
    getCanonicalOpportunities(organizationId),
    getCanonicalReviews(organizationId),
    getKnowledgeAssets(organizationId),
    fetchRecentAnalyses(organizationId),
    fetchRecentBlueprints(organizationId),
  ]);

  const domains = source?.domainMemory.domains ?? [];
  const domainLookup = new Map(domains.map((domain) => [domain.id, domain]));
  const businessMemory = source?.businessMemory;
  const identityMemory = source?.identityMemory ?? null;
  const identity = identityMemory ?? businessMemory?.identity ?? null;
  const knowledgeMemory = source?.knowledgeMemory;

  const domainEntries = buildDomainDiscussionCounts(
    resolvedDiscussions,
    analyzedIds,
    domains,
  );

  const sortedByActivity = [...domainEntries].sort(
    (a, b) => b.discussionCount - a.discussionCount,
  );
  const sortedByMarket = [...domainEntries].sort(
    (a, b) => b.analyzedDiscussionCount - a.analyzedDiscussionCount,
  );

  const buyerStageDistribution = buildBuyerStageDistribution({
    analyses,
    briefings: resolvedBriefings,
  });

  const painPointKnowledge = collectPainPoints({
    analyses,
    briefings: resolvedBriefings,
    domains,
    domainLookup,
  });

  const buyingSignalKnowledge = collectBuyingSignals({
    analyses,
    opportunities: resolvedOpportunities,
  });

  const terminologyKnowledge = collectTerminology({
    domains,
    discussions: resolvedDiscussions.slice(0, MAX_EXECUTIVE_MEMORY_ANALYSES),
    knowledgeTags: resolvedKnowledgeAssets.flatMap((asset) => asset.tags ?? []),
    masterProfile: identity?.masterProfile ?? null,
    expertise: identity?.expertise ?? null,
  });

  const competitorKnowledge = collectCompetitors(domains);

  const limitedKnowledgeAssets = resolvedKnowledgeAssets.slice(
    0,
    MAX_KNOWLEDGE_CONTEXT,
  );

  const briefingCounts = buildBriefingDecisionCounts(resolvedBriefings);
  const opportunityStatusDistribution = buildOpportunityStatusDistribution(
    resolvedOpportunities,
  );
  const discussionOutcomeDistribution = buildDiscussionOutcomeDistribution(
    resolvedDiscussions,
  );

  const staleDiscussions = resolvedDiscussions.filter(
    (discussion) =>
      !analyzedIds.has(discussion.id) &&
      discussion.status.toLowerCase() !== "completed",
  ).length;

  const blueprintWithPromptsCount = blueprints.filter((blueprint) =>
    blueprintHasPrompts(blueprint),
  ).length;

  const reuseValues = blueprints
    .map((blueprint) => blueprint.estimated_reuse)
    .filter((value): value is number => value != null);

  const deploymentAssetCount = source?.blueprintMemory.deploymentAssetFields
    .parsedAssetCount
    ? source.blueprintMemory.deploymentAssetFields.parsedAssetCount
    : 0;

  const objectionMap = new Map<string, number>();
  for (const domain of domains) {
    for (const phrase of splitMemoryPhrases(domain.recurringObjections)) {
      const key = phrase.toLowerCase();
      objectionMap.set(key, (objectionMap.get(key) ?? 0) + 1);
    }
  }

  const recommendationMap = new Map<string, number>();
  for (const analysis of analyses) {
    if (analysis.recommended_action?.trim()) {
      const key = analysis.recommended_action.trim().toLowerCase();
      recommendationMap.set(key, (recommendationMap.get(key) ?? 0) + 1);
    }
  }

  const opportunityReasonMap = new Map<string, number>();
  for (const analysis of analyses) {
    if (analysis.opportunity_reason?.trim()) {
      const key = analysis.opportunity_reason.trim().toLowerCase();
      opportunityReasonMap.set(key, (opportunityReasonMap.get(key) ?? 0) + 1);
    }
  }
  for (const opportunity of resolvedOpportunities) {
    if (opportunity.reason?.trim()) {
      const key = opportunity.reason.trim().toLowerCase();
      opportunityReasonMap.set(key, (opportunityReasonMap.get(key) ?? 0) + 1);
    }
  }

  const opportunityTypeMap = new Map<string, number>();
  for (const opportunity of resolvedOpportunities) {
    const key = opportunity.type?.trim() || "unknown";
    opportunityTypeMap.set(key, (opportunityTypeMap.get(key) ?? 0) + 1);
  }

  const deploymentTypeMap = new Map<string, number>();
  for (const asset of resolvedKnowledgeAssets) {
    if (asset.asset_type?.trim()) {
      const key = asset.asset_type.trim();
      deploymentTypeMap.set(key, (deploymentTypeMap.get(key) ?? 0) + 1);
    }
  }
  for (const blueprint of blueprints) {
    if (blueprint.asset_type?.trim()) {
      const key = blueprint.asset_type.trim();
      deploymentTypeMap.set(key, (deploymentTypeMap.get(key) ?? 0) + 1);
    }
  }

  const mostActiveDomain = sortedByActivity[0] ?? null;

  const avgOpportunityScore =
    resolvedOpportunities.length > 0
      ? resolvedOpportunities.reduce((sum, item) => sum + item.score, 0) /
        resolvedOpportunities.length
      : null;

  const avgBriefingConfidence =
    resolvedBriefings.length > 0
      ? resolvedBriefings.reduce((sum, item) => sum + item.confidence, 0) /
        resolvedBriefings.length
      : null;

  const avgAnalysisConfidence =
    analyses.length > 0
      ? analyses.reduce((sum, item) => sum + item.confidence, 0) / analyses.length
      : null;

  const recentActivityCount = resolvedDiscussions.filter((discussion) => {
    const activity = discussion.last_activity ?? discussion.created_at;
    if (!activity) {
      return false;
    }
    const days =
      (Date.now() - new Date(activity).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;

  const coveredDomains = domainEntries.filter(
    (entry) => entry.analyzedDiscussionCount > 0,
  ).length;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId,
      focusDomainId,
      focusDiscussionId,
      discussionCount: resolvedDiscussions.length,
      opportunityCount: resolvedOpportunities.length,
      briefingCount: resolvedBriefings.length,
      knowledgeAssetCount: resolvedKnowledgeAssets.length,
      domainCount: domains.length,
      analysisCount: analyses.length,
      memoryVersion: EXECUTIVE_MEMORY_VERSION,
    },
    businessKnowledge: {
      description: identity?.aboutYou ?? null,
      voice: extractVoiceFromProfile(
        identity?.masterProfile ?? null,
        identity?.expertise ?? null,
      ),
      expertise: identity?.expertise ?? null,
      website: identity?.website ?? null,
      businessKnowledge: identity?.aboutYou ?? null,
      masterProfile: identity?.masterProfile ?? null,
      masterProfileVersion: identity?.masterProfileVersion ?? null,
      homepageLearning: identity?.homepageLearning ?? null,
      businessConstraints: extractBusinessConstraints(
        identity?.masterProfile ?? null,
      ),
      missingFields:
        businessMemory?.missingFields ?? identityMemory?.missingFields ?? [],
      completenessScore:
        businessMemory?.completenessScore ?? identityMemory?.completenessScore ?? 0,
      isBrainTrained:
        businessMemory?.isBrainTrained ?? identityMemory?.isBrainTrained ?? false,
    },
    marketKnowledge: {
      topMarkets: sortedByMarket.slice(0, 10),
      mostActiveDomains: sortedByActivity.slice(0, 10),
      domainCoverage:
        domains.length > 0 ? Math.round((coveredDomains / domains.length) * 100) : 0,
      knowledgeGrowthDelta: knowledgeMemory?.knowledgeConfidenceDelta ?? null,
      recentActivityCount,
      totalDomains: domains.length,
    },
    audienceKnowledge: {
      buyerStageDistribution,
      topBuyerStages: topDistributionKeys(buyerStageDistribution).map(
        ({ key, count }) => ({
          stage: key,
          count,
        }),
      ),
    },
    terminologyKnowledge,
    competitorKnowledge,
    painPointKnowledge,
    buyingSignalKnowledge,
    decisionKnowledge: {
      briefingsApproved: briefingCounts.approved,
      briefingsNeedsRevision: briefingCounts.needsRevision,
      briefingsRejected: briefingCounts.rejected,
      briefingsDraft: briefingCounts.draft,
      opportunityStatusDistribution,
      discussionOutcomeDistribution,
      refreshIndicators: {
        staleDiscussions,
        analysesConsidered: analyses.length,
      },
    },
    contentKnowledge: {
      deploymentAssetCount,
      blueprintCount: blueprints.length,
      blueprintWithPromptsCount,
      knowledgeAssetCount: resolvedKnowledgeAssets.length,
      approvedBriefingAssetCount: resolvedKnowledgeAssets.filter(
        (asset) => asset.asset_type === "approved_briefing",
      ).length,
      latestBlueprintAt: blueprints[0]?.created_at ?? null,
      latestKnowledgeAssetAt: resolvedKnowledgeAssets[0]?.created_at ?? null,
      averageEstimatedReuse:
        reuseValues.length > 0
          ? reuseValues.reduce((sum, value) => sum + value, 0) / reuseValues.length
          : source?.blueprintMemory.averageEstimatedReuse ?? null,
      assetTypeCoverage: [
        ...new Set(
          blueprints
            .map((blueprint) => blueprint.asset_type)
            .filter((value): value is string => Boolean(value?.trim())),
        ),
      ],
    },
    patternKnowledge: {
      mostCommonBuyerStage: mostCommonValue(buyerStageDistribution),
      mostCommonObjection: topDistributionKeys(
        Object.fromEntries(objectionMap),
        1,
      )[0]?.key ?? null,
      mostCommonOpportunityReason: topDistributionKeys(
        Object.fromEntries(opportunityReasonMap),
        1,
      )[0]?.key ?? null,
      mostCommonRecommendation: topDistributionKeys(
        Object.fromEntries(recommendationMap),
        1,
      )[0]?.key ?? null,
      mostCommonDeploymentType: topDistributionKeys(
        Object.fromEntries(deploymentTypeMap),
        1,
      )[0]?.key ?? null,
      mostActiveDomainId: mostActiveDomain?.domainId ?? null,
      mostActiveDomainName: mostActiveDomain?.domainName ?? null,
      highestOpportunityCategory: topDistributionKeys(
        Object.fromEntries(opportunityTypeMap),
        1,
      )[0]?.key ?? null,
    },
    performanceKnowledge: {
      averageOpportunityScore: avgOpportunityScore,
      averageBriefingConfidence: avgBriefingConfidence,
      averageAnalysisConfidence: avgAnalysisConfidence,
      knowledgeConfidence: knowledgeMemory?.knowledgeConfidence ?? null,
      knowledgeConfidenceDelta: knowledgeMemory?.knowledgeConfidenceDelta ?? null,
    },
  };
}
