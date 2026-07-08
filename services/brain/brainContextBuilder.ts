import { normalizeBriefingStatus } from "@/lib/briefingStatus";
import {
  buildBriefingDeploymentAssets,
  buildDiscussionDeploymentAssets,
  buildOpportunityDeploymentAssets,
} from "@/lib/deploymentAssets";
import { getDeploymentReadinessFromBriefing } from "@/lib/deploymentReadiness";
import { formatDomainHealthState } from "@/lib/domainHealthDisplay";
import { classifyOpportunityPriority } from "@/lib/opportunityPriority";
import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  blueprintHasPrompts,
  getDisplayAssetBlueprintByDiscussionId,
  getDisplayAssetBlueprintForBriefing,
  type AthenaAssetBlueprint,
} from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestCommunityIntelligenceByCommunityId } from "@/services/communityIntelligenceService";
import { getCommunities } from "@/services/communityService";
import {
  getAnalyzedDiscussionIds,
  getLatestDiscussionAnalysis,
  type DiscussionAnalysis,
} from "@/services/discussionAnalysisService";
import {
  getDiscussionById,
  getDiscussions,
  getHighPriorityDiscussions,
  type Discussion,
} from "@/services/discussionService";
import { getDiscussionUpdatesByDiscussionId } from "@/services/discussionUpdateService";
import type { AthenaIdentity } from "@/services/identity/identityService";
import { getKnowledgeAssets } from "@/services/knowledgeAssetService";
import {
  getCanonicalOpportunities,
  getOpportunityByDiscussionId,
  getOpportunityById,
  type Opportunity,
} from "@/services/opportunityService";
import { belongsToOrganization } from "@/services/organizationService";
import {
  getCanonicalReviews,
  getLatestReviewByOpportunityId,
  getReviewById,
  type AthenaReview,
} from "@/services/reviewService";
import { normalizeDiscussionLifecycleKey } from "@/lib/discussionStatus";
import {
  computeBrainCompletenessScore,
  computeDiscussionAgeDays,
  countStatusDistribution,
} from "@/services/brain/brainContextHelpers";
import {
  splitMemoryPhrases,
  splitTerminology,
} from "@/services/brain/executiveMemoryHelpers";
import { resolveStoredHomepageLearning } from "@/services/brain/masterProfileHelpers";
import {
  BRAIN_CONTEXT_LIMITS,
  type BrainContextScope,
  type BrainEngineContext,
  type BriefingMemory,
  type BriefingMemoryEntry,
  type BuildBrainContextForBriefingParams,
  type BuildBrainContextForDiscussionParams,
  type BuildBrainContextForOpportunityParams,
  type BusinessMemory,
  type ContextSummary,
  type DiscussionMemory,
  type DiscussionMemoryEntry,
  type DomainMemory,
  type DomainMemoryEntry,
  type FeedbackSignals,
  type KnowledgeMemory,
  type OpportunityMemory,
  type OpportunityMemoryEntry,
  type OrganizationContextSlice,
} from "@/services/brain/brainContextTypes";

export class BrainContextNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainContextNotFoundError";
  }
}

export class BrainContextOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "BrainContextOrganizationRequiredError";
  }
}

export function assertOrganizationId(organizationId: string): string {
  const trimmed = organizationId.trim();
  if (!trimmed) {
    throw new BrainContextOrganizationRequiredError();
  }
  return trimmed;
}

async function fetchOrganization(
  organizationId: string,
): Promise<OrganizationContextSlice | null> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching organization for brain context:", error);
    return null;
  }

  return data;
}

async function fetchIdentityForOrganization(
  organizationId: string,
): Promise<AthenaIdentity | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching identity for brain context:", error);
    return null;
  }

  return data;
}

async function fetchDiscussionAnalyses(
  discussionId: string,
  organizationId: string,
  limit = BRAIN_CONTEXT_LIMITS.priorAnalyses,
): Promise<DiscussionAnalysis[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching discussion analyses for brain context:", error);
    return [];
  }

  return data ?? [];
}

async function fetchRecentBlueprints(
  organizationId: string,
  limit = BRAIN_CONTEXT_LIMITS.assetBlueprints,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching blueprints for brain context:", error);
    return [];
  }

  return data ?? [];
}

function extractHomepageLearning(
  masterProfile: Record<string, unknown> | null,
): string | null {
  return resolveStoredHomepageLearning({ masterProfile });
}

function buildBusinessMemory(identity: AthenaIdentity | null): BusinessMemory {
  const missingFields: string[] = [];

  if (!identity) {
    return {
      identity: null,
      missingFields: [
        "about_you",
        "expertise",
        "website",
        "master_profile",
        "brain_status",
      ],
      isBrainTrained: false,
      completenessScore: 0,
    };
  }

  if (!identity.about_you?.trim()) missingFields.push("about_you");
  if (!identity.expertise?.trim()) missingFields.push("expertise");
  if (!identity.website?.trim()) missingFields.push("website");
  if (!identity.master_profile) missingFields.push("master_profile");
  if (identity.brain_status !== "ready") missingFields.push("brain_status");

  const completenessScore = computeBrainCompletenessScore(missingFields);

  return {
    identity: {
      userId: identity.user_id,
      greetingName: identity.greeting_name,
      aboutYou: identity.about_you,
      expertise: identity.expertise,
      website: identity.website,
      brainStatus: identity.brain_status,
      masterProfile: identity.master_profile,
      masterProfileVersion: identity.master_profile_version,
      homepageLearning: extractHomepageLearning(identity.master_profile),
    },
    missingFields,
    isBrainTrained: identity.brain_status === "ready" && Boolean(identity.master_profile),
    completenessScore,
  };
}

async function buildDomainMemory(organizationId: string): Promise<DomainMemory> {
  const communities = await getCommunities(organizationId);
  const limited = communities.slice(0, BRAIN_CONTEXT_LIMITS.domains);

  const domains: DomainMemoryEntry[] = await Promise.all(
    limited.map(async (community) => {
      const latestIntelligence =
        await getLatestCommunityIntelligenceByCommunityId(
          community.id,
          organizationId,
        );

      const discussionsAnalyzed = latestIntelligence ? 1 : 0;
      const healthLabel = formatDomainHealthState({
        knowledgeConfidence: latestIntelligence?.confidence ?? null,
        discussionsAnalyzed,
      });

      const rawJson = latestIntelligence?.raw_json ?? null;
      const terminologyFromIntelligence =
        typeof rawJson?.terminology === "string"
          ? splitTerminology(rawJson.terminology)
          : [];
      const competitorsFromIntelligence =
        typeof rawJson?.competitors_alternatives === "string"
          ? splitMemoryPhrases(rawJson.competitors_alternatives)
          : [];

      return {
        id: community.id,
        name: community.group_name,
        description: community.notes,
        market: community.niche,
        niche: community.niche,
        status: community.status,
        priority: community.priority,
        platform: community.platform,
        memberCount: community.member_count,
        isActive: community.status?.toLowerCase() !== "inactive",
        terminology: terminologyFromIntelligence,
        competitors: competitorsFromIntelligence,
        recurringQuestions: latestIntelligence?.recurring_questions ?? null,
        recurringObjections: latestIntelligence?.recurring_objections ?? null,
        emergingTrends: latestIntelligence?.market_trends ?? null,
        recommendedContentAngles: latestIntelligence?.recommended_content ?? null,
        athenaUnderstanding: latestIntelligence?.executive_summary ?? null,
        confidence: latestIntelligence?.confidence ?? null,
        healthLabel,
        healthTone: null,
        learningTimelineSummary: null,
        latestIntelligence,
      };
    }),
  );

  return {
    domains,
    totalDomains: communities.length,
    activeDomainCount: domains.filter((domain) => domain.isActive).length,
    focusDomainId: null,
  };
}

function toDiscussionEntry(
  discussion: Discussion,
  analyzedIds: Set<string>,
): DiscussionMemoryEntry {
  return {
    id: discussion.id,
    title: discussion.title,
    status: discussion.status,
    priority: discussion.priority,
    opportunityScore: discussion.opportunity_score,
    communityId: discussion.community_id,
    hasAnalysis: analyzedIds.has(discussion.id),
    summary: discussion.summary,
    lastActivity: discussion.last_activity ?? discussion.created_at,
    ageDays: computeDiscussionAgeDays(discussion.created_at),
  };
}

function countStatusDistributionLocal<T extends { status: string }>(
  items: T[],
  normalize: (status: string) => string,
): Record<string, number> {
  return countStatusDistribution(items, normalize);
}

function buildBriefingEntry(review: AthenaReview): BriefingMemoryEntry {
  return {
    id: review.id,
    status: review.status,
    confidence: review.confidence,
    buyerStage: review.buyer_stage,
    summary: review.summary,
    opportunityId: review.opportunity_id,
    discussionId: review.discussion_id,
    updatedAt: review.updated_at,
  };
}

function buildOpportunityEntry(opportunity: Opportunity): OpportunityMemoryEntry {
  return {
    id: opportunity.id,
    title: opportunity.title,
    score: opportunity.score,
    status: opportunity.status,
    urgency: opportunity.urgency,
    confidence: null,
    discussionId: opportunity.discussion_id,
    latestActivity: opportunity.updated_at,
  };
}

function computeDeploymentAssetFields(input: {
  analysis: DiscussionAnalysis | null;
  briefing: AthenaReview | null;
  opportunity: Opportunity | null;
}): BrainEngineContext["assetMemory"]["deploymentAssetFields"] {
  let source: "analysis" | "briefing" | "opportunity" | null = null;
  let parsedAssetCount = 0;

  if (input.briefing) {
    parsedAssetCount = buildBriefingDeploymentAssets(input.briefing).length;
    source = "briefing";
  } else if (input.analysis) {
    parsedAssetCount = buildDiscussionDeploymentAssets(input.analysis).length;
    source = "analysis";
  } else if (input.opportunity) {
    parsedAssetCount = buildOpportunityDeploymentAssets(
      input.opportunity,
      null,
    ).length;
    source = "opportunity";
  }

  return {
    source,
    suggestedCta: input.analysis?.suggested_cta ?? input.opportunity?.suggested_cta ?? null,
    recommendedResponse: input.briefing?.recommended_response ?? null,
    cta: input.briefing?.cta ?? null,
    parsedAssetCount,
  };
}

function computeFeedbackSignals(input: {
  briefings: AthenaReview[];
  opportunities: Opportunity[];
  discussions: Discussion[];
  blueprints: AthenaAssetBlueprint[];
  analyzedIds: Set<string>;
  focus?: {
    briefing: AthenaReview | null;
    opportunity: Opportunity | null;
    discussion: Discussion | null;
    blueprint: AthenaAssetBlueprint | null;
    deploymentAssetCount: number;
  };
}): FeedbackSignals {
  const briefingStatuses = {
    draft: 0,
    approved: 0,
    needsRevision: 0,
    rejected: 0,
  };

  for (const briefing of input.briefings) {
    const key = normalizeBriefingStatus(briefing.status);
    if (key === "draft") briefingStatuses.draft += 1;
    if (key === "approved") briefingStatuses.approved += 1;
    if (key === "needs_revision") briefingStatuses.needsRevision += 1;
    if (key === "rejected") briefingStatuses.rejected += 1;
  }

  const staleDiscussionCount = input.discussions.filter(
    (discussion) =>
      !input.analyzedIds.has(discussion.id) &&
      discussion.status.toLowerCase() !== "completed",
  ).length;

  const missingAssetPrompts = input.blueprints.filter(
    (blueprint) => !blueprintHasPrompts(blueprint),
  ).length;

  const hasGeneratedAssets = input.blueprints.some((blueprint) =>
    blueprintHasPrompts(blueprint),
  );

  return {
    briefingStatuses,
    opportunitySalesStatuses: countStatusDistributionLocal(
      input.opportunities,
      (status) => normalizeOpportunityStatus(status),
    ),
    discussionLifecycleStatuses: countStatusDistributionLocal(
      input.discussions,
      (status) => status.trim().toLowerCase() || "unknown",
    ),
    approvalCount: briefingStatuses.approved,
    revisionRequestCount: briefingStatuses.needsRevision,
    hasGeneratedAssets,
    missingAssetPrompts,
    staleDiscussionCount,
    deploymentReadinessDistribution: {},
    focusSignals: {
      briefingStatus: input.focus?.briefing?.status ?? null,
      opportunityStatus: input.focus?.opportunity?.status ?? null,
      discussionStatus: input.focus?.discussion?.status ?? null,
      hasLinkedBlueprint: Boolean(input.focus?.blueprint),
      hasDeploymentAssets: (input.focus?.deploymentAssetCount ?? 0) > 0,
    },
  };
}

function computeContextSummary(input: {
  scope: BrainContextScope;
  businessMemory: BusinessMemory;
  domainMemory: DomainMemory;
  discussions: DiscussionMemoryEntry[];
  opportunities: OpportunityMemoryEntry[];
  briefings: BriefingMemoryEntry[];
  knowledgeCount: number;
  feedbackSignals: FeedbackSignals;
}): ContextSummary {
  const warnings: string[] = [];

  if (!input.businessMemory.isBrainTrained) {
    warnings.push("no_athena_brain_trained");
  }

  if (input.domainMemory.totalDomains === 0) {
    warnings.push("no_intelligence_domains");
  }

  if (input.discussions.length === 0) {
    warnings.push("no_recent_discussions");
  }

  if (input.knowledgeCount === 0) {
    warnings.push("no_knowledge_assets_yet");
  }

  const highestOpportunityScore =
    input.opportunities.length > 0
      ? Math.max(...input.opportunities.map((item) => item.score))
      : null;

  return {
    scope: input.scope,
    totalDomains: input.domainMemory.totalDomains,
    totalDiscussionsConsidered: input.discussions.length,
    totalOpportunitiesConsidered: input.opportunities.length,
    totalBriefingsConsidered: input.briefings.length,
    totalKnowledgeAssetsConsidered: input.knowledgeCount,
    highestOpportunityScore,
    pendingBriefingCount: input.feedbackSignals.briefingStatuses.draft,
    approvedBriefingCount: input.feedbackSignals.briefingStatuses.approved,
    needsRevisionCount: input.feedbackSignals.briefingStatuses.needsRevision,
    missingBrainSetupFields: input.businessMemory.missingFields,
    warnings,
  };
}

type OrgDataBundle = {
  organization: OrganizationContextSlice;
  identity: AthenaIdentity | null;
  businessMemory: BusinessMemory;
  domainMemory: DomainMemory;
  discussions: Discussion[];
  analyzedIds: Set<string>;
  opportunities: Opportunity[];
  briefings: AthenaReview[];
  knowledgeAssets: Awaited<ReturnType<typeof getKnowledgeAssets>>;
  blueprints: AthenaAssetBlueprint[];
};

async function loadOrganizationData(
  organizationId: string,
): Promise<OrgDataBundle | null> {
  const organization = await fetchOrganization(organizationId);
  if (!organization) {
    return null;
  }

  const [
    identity,
    domainMemory,
    discussions,
    analyzedIds,
    opportunities,
    briefings,
    knowledgeAssets,
    blueprints,
  ] = await Promise.all([
    fetchIdentityForOrganization(organizationId),
    buildDomainMemory(organizationId),
    getDiscussions(organizationId),
    getAnalyzedDiscussionIds(organizationId),
    getCanonicalOpportunities(organizationId),
    getCanonicalReviews(organizationId),
    getKnowledgeAssets(organizationId),
    fetchRecentBlueprints(organizationId),
  ]);

  const businessMemory = buildBusinessMemory(identity);

  return {
    organization,
    identity,
    businessMemory,
    domainMemory,
    discussions,
    analyzedIds,
    opportunities,
    briefings,
    knowledgeAssets: knowledgeAssets.slice(0, BRAIN_CONTEXT_LIMITS.knowledgeAssets),
    blueprints,
  };
}

function buildOrgDiscussionMemory(
  bundle: OrgDataBundle,
  focus: DiscussionMemory["focus"],
): DiscussionMemory {
  const recentDiscussions = bundle.discussions
    .slice(0, BRAIN_CONTEXT_LIMITS.discussions)
    .map((discussion) => toDiscussionEntry(discussion, bundle.analyzedIds));

  const recentAnalyzedDiscussions = bundle.discussions
    .filter((discussion) => bundle.analyzedIds.has(discussion.id))
    .slice(0, BRAIN_CONTEXT_LIMITS.discussions)
    .map((discussion) => toDiscussionEntry(discussion, bundle.analyzedIds));

  const highIntent = bundle.discussions
    .filter((discussion) => discussion.opportunity_score >= 50)
    .slice(0, BRAIN_CONTEXT_LIMITS.discussions)
    .map((discussion) => toDiscussionEntry(discussion, bundle.analyzedIds));

  const monitoringDiscussions = bundle.discussions
    .filter(
      (discussion) =>
        normalizeDiscussionLifecycleKey(discussion.status) === "monitoring",
    )
    .slice(0, BRAIN_CONTEXT_LIMITS.discussions)
    .map((discussion) => toDiscussionEntry(discussion, bundle.analyzedIds));

  const lifecycleDistribution: Record<string, number> = {};
  for (const discussion of bundle.discussions.slice(
    0,
    BRAIN_CONTEXT_LIMITS.discussions,
  )) {
    const key = normalizeDiscussionLifecycleKey(discussion.status) ?? "unknown";
    lifecycleDistribution[key] = (lifecycleDistribution[key] ?? 0) + 1;
  }

  const recurringThemes = bundle.briefings
    .map((briefing) => briefing.pain_points?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);

  return {
    recentDiscussions,
    recentAnalyzedDiscussions,
    highIntentDiscussions: highIntent,
    monitoringDiscussions,
    recurringThemes,
    lifecycleDistribution,
    focus,
  };
}

function buildOrgOpportunityMemory(
  bundle: OrgDataBundle,
  focus: OpportunityMemory["focus"],
): OpportunityMemory {
  const recent = bundle.opportunities
    .slice(0, BRAIN_CONTEXT_LIMITS.opportunities)
    .map(buildOpportunityEntry);

  const highestScoring =
    bundle.opportunities.length > 0
      ? buildOpportunityEntry(
          [...bundle.opportunities].sort((a, b) => b.score - a.score)[0],
        )
      : null;

  const immediateAction = bundle.opportunities
    .filter(
      (opportunity) =>
        classifyOpportunityPriority(opportunity) === "immediate_action",
    )
    .slice(0, BRAIN_CONTEXT_LIMITS.opportunities)
    .map(buildOpportunityEntry);

  const highIntent = bundle.opportunities
    .filter(
      (opportunity) =>
        classifyOpportunityPriority(opportunity) === "high_intent",
    )
    .slice(0, BRAIN_CONTEXT_LIMITS.opportunities)
    .map(buildOpportunityEntry);

  const monitor = bundle.opportunities
    .filter(
      (opportunity) => classifyOpportunityPriority(opportunity) === "monitor",
    )
    .slice(0, BRAIN_CONTEXT_LIMITS.opportunities)
    .map(buildOpportunityEntry);

  const lowPriority = bundle.opportunities
    .filter(
      (opportunity) =>
        classifyOpportunityPriority(opportunity) === "low_priority",
    )
    .slice(0, BRAIN_CONTEXT_LIMITS.opportunities)
    .map(buildOpportunityEntry);

  return {
    recentOpportunities: recent,
    highestScoring,
    queues: {
      immediateAction,
      highIntent,
      monitor,
      lowPriority,
    },
    statusDistribution: countStatusDistributionLocal(
      bundle.opportunities,
      (status) => normalizeOpportunityStatus(status),
    ),
    focus,
  };
}

function buildOrgBriefingMemory(
  bundle: OrgDataBundle,
  focus: BriefingMemory["focus"],
): BriefingMemory {
  const recent = bundle.briefings
    .slice(0, BRAIN_CONTEXT_LIMITS.briefings)
    .map(buildBriefingEntry);

  const approved = bundle.briefings
    .filter((briefing) => normalizeBriefingStatus(briefing.status) === "approved")
    .slice(0, BRAIN_CONTEXT_LIMITS.briefings)
    .map(buildBriefingEntry);

  const needsRevision = bundle.briefings
    .filter((briefing) => {
      const key = normalizeBriefingStatus(briefing.status);
      return key === "needs_revision";
    })
    .slice(0, BRAIN_CONTEXT_LIMITS.briefings)
    .map(buildBriefingEntry);

  const rejected = bundle.briefings
    .filter((briefing) => normalizeBriefingStatus(briefing.status) === "rejected")
    .slice(0, BRAIN_CONTEXT_LIMITS.briefings)
    .map(buildBriefingEntry);

  const draft = bundle.briefings
    .filter((briefing) => normalizeBriefingStatus(briefing.status) === "draft")
    .slice(0, BRAIN_CONTEXT_LIMITS.briefings)
    .map(buildBriefingEntry);

  const buyerStageDistribution: Record<string, number> = {};
  for (const briefing of bundle.briefings.slice(0, BRAIN_CONTEXT_LIMITS.briefings)) {
    const stage = briefing.buyer_stage?.trim() || "unknown";
    buyerStageDistribution[stage] = (buyerStageDistribution[stage] ?? 0) + 1;
  }

  return {
    recentBriefings: recent,
    approvedBriefings: approved,
    needsRevisionBriefings: needsRevision,
    rejectedBriefings: rejected,
    draftBriefings: draft,
    statusDistribution: countStatusDistributionLocal(
      bundle.briefings,
      (status) => normalizeBriefingStatus(status),
    ),
    buyerStageDistribution,
    focus,
  };
}

function buildKnowledgeMemory(
  knowledgeAssets: Awaited<ReturnType<typeof getKnowledgeAssets>>,
): KnowledgeMemory {
  const approvedBriefingKnowledgeCount = knowledgeAssets.filter(
    (asset) => asset.asset_type === "approved_briefing",
  ).length;

  return {
    assets: [...knowledgeAssets]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .map((asset) => ({
      id: asset.id,
      title: asset.title,
      category: asset.category,
      assetType: asset.asset_type,
      summary: asset.summary,
      communityId: asset.community_id,
      sourceType: asset.source_type,
      sourceId: asset.source_id,
      rating: asset.rating,
      timesUsed: asset.times_used,
      tags: asset.tags ?? [],
    })),
    approvedBriefingKnowledgeCount,
    communityIntelligence: [],
    productionIntelligence: [],
    knowledgeConfidence: null,
    knowledgeConfidenceDelta: null,
  };
}

function buildAssetMemory(
  blueprints: AthenaAssetBlueprint[],
  focusBlueprint: AthenaAssetBlueprint | null,
  deploymentFields: BrainEngineContext["assetMemory"]["deploymentAssetFields"],
): BrainEngineContext["assetMemory"] {
  const recentBlueprints = blueprints.map((blueprint) => ({
    id: blueprint.id,
    assetTitle: blueprint.asset_title,
    assetType: blueprint.asset_type,
    businessGoal: blueprint.business_goal,
    targetAudience: blueprint.target_audience,
    estimatedReuse: blueprint.estimated_reuse,
    discussionId: blueprint.discussion_id,
    opportunityId: blueprint.opportunity_id,
    briefingId: blueprint.briefing_id,
    hasPrompts: blueprintHasPrompts(blueprint),
    createdAt: blueprint.created_at,
  }));

  const reuseValues = recentBlueprints
    .map((blueprint) => blueprint.estimatedReuse)
    .filter((value): value is number => value != null);

  return {
    recentBlueprints,
    focusBlueprint,
    assetTypes: [...new Set(recentBlueprints.map((blueprint) => blueprint.assetType))],
    businessGoals: recentBlueprints
      .map((blueprint) => blueprint.businessGoal)
      .filter((value): value is string => Boolean(value?.trim())),
    targetAudiences: recentBlueprints
      .map((blueprint) => blueprint.targetAudience)
      .filter((value): value is string => Boolean(value?.trim())),
    averageEstimatedReuse:
      reuseValues.length > 0
        ? reuseValues.reduce((sum, value) => sum + value, 0) / reuseValues.length
        : null,
    deploymentAssetFields: deploymentFields,
  };
}

function assembleContext(
  bundle: OrgDataBundle,
  scope: BrainContextScope,
  partial: {
    discussionMemory: DiscussionMemory;
    opportunityMemory: OpportunityMemory;
    briefingMemory: BriefingMemory;
    assetMemory: BrainEngineContext["assetMemory"];
    focusFeedback: FeedbackSignals["focusSignals"] & {
      deploymentAssetCount: number;
    };
  },
): BrainEngineContext {
  const feedbackSignals = computeFeedbackSignals({
    briefings: bundle.briefings,
    opportunities: bundle.opportunities,
    discussions: bundle.discussions.slice(0, BRAIN_CONTEXT_LIMITS.discussions),
    blueprints: bundle.blueprints,
    analyzedIds: bundle.analyzedIds,
    focus: {
      briefing: partial.briefingMemory.focus?.briefing ?? null,
      opportunity: partial.opportunityMemory.focus?.opportunity ?? null,
      discussion: partial.discussionMemory.focus?.discussion ?? null,
      blueprint:
        partial.assetMemory.focusBlueprint ??
        partial.discussionMemory.focus?.linkedBlueprint ??
        null,
      deploymentAssetCount: partial.focusFeedback.deploymentAssetCount,
    },
  });

  const knowledgeMemory = buildKnowledgeMemory(bundle.knowledgeAssets);

  const contextSummary = computeContextSummary({
    scope,
    businessMemory: bundle.businessMemory,
    domainMemory: bundle.domainMemory,
    discussions: partial.discussionMemory.recentDiscussions,
    opportunities: partial.opportunityMemory.recentOpportunities,
    briefings: partial.briefingMemory.recentBriefings,
    knowledgeCount: knowledgeMemory.assets.length,
    feedbackSignals,
  });

  return {
    organization: bundle.organization,
    scope,
    identity: bundle.businessMemory,
    businessMemory: bundle.businessMemory,
    domainMemory: bundle.domainMemory,
    discussionMemory: partial.discussionMemory,
    opportunityMemory: partial.opportunityMemory,
    briefingMemory: partial.briefingMemory,
    assetMemory: partial.assetMemory,
    knowledgeMemory,
    feedbackSignals,
    contextSummary,
    builtAt: new Date().toISOString(),
  };
}

export async function buildBrainContextForOrganization(
  organizationId: string,
): Promise<BrainEngineContext | null> {
  const orgId = assertOrganizationId(organizationId);
  const bundle = await loadOrganizationData(orgId);

  if (!bundle) {
    return null;
  }

  const highPriority = await getHighPriorityDiscussions(
    orgId,
    BRAIN_CONTEXT_LIMITS.discussions,
  );

  const discussionMemory = buildOrgDiscussionMemory(bundle, null);
  if (highPriority.length > 0) {
    discussionMemory.highIntentDiscussions = highPriority
      .slice(0, BRAIN_CONTEXT_LIMITS.discussions)
      .map((discussion) => toDiscussionEntry(discussion, bundle.analyzedIds));
  }

  const opportunityMemory = buildOrgOpportunityMemory(bundle, null);
  const briefingMemory = buildOrgBriefingMemory(bundle, null);
  const assetMemory = buildAssetMemory(bundle.blueprints, null, {
    source: null,
    suggestedCta: null,
    recommendedResponse: null,
    cta: null,
    parsedAssetCount: 0,
  });

  return assembleContext(bundle, "organization", {
    discussionMemory,
    opportunityMemory,
    briefingMemory,
    assetMemory,
    focusFeedback: {
      briefingStatus: null,
      opportunityStatus: null,
      discussionStatus: null,
      hasLinkedBlueprint: false,
      hasDeploymentAssets: false,
      deploymentAssetCount: 0,
    },
  });
}

export async function buildBrainContextForDiscussion(
  params: BuildBrainContextForDiscussionParams,
): Promise<BrainEngineContext | null> {
  const orgId = assertOrganizationId(params.organizationId);
  const bundle = await loadOrganizationData(orgId);

  if (!bundle) {
    return null;
  }

  const discussion = await getDiscussionById(params.discussionId, orgId);
  if (!discussion || !belongsToOrganization(discussion, orgId)) {
    throw new BrainContextNotFoundError(
      `Discussion not found for organization: ${params.discussionId}`,
    );
  }

  const [
    threadUpdates,
    latestAnalysis,
    priorAnalyses,
    linkedOpportunity,
  ] = await Promise.all([
    getDiscussionUpdatesByDiscussionId(params.discussionId, orgId),
    getLatestDiscussionAnalysis(params.discussionId, orgId),
    fetchDiscussionAnalyses(params.discussionId, orgId),
    getOpportunityByDiscussionId(params.discussionId, orgId),
  ]);

  const linkedBriefing = linkedOpportunity
    ? await getLatestReviewByOpportunityId(linkedOpportunity.id, orgId)
    : null;

  const linkedBlueprint = linkedBriefing
    ? await getDisplayAssetBlueprintForBriefing({
        briefingId: linkedBriefing.id,
        organizationId: orgId,
        discussionId: params.discussionId,
      })
    : await getDisplayAssetBlueprintByDiscussionId(params.discussionId, orgId);

  const deploymentFields = computeDeploymentAssetFields({
    analysis: latestAnalysis,
    briefing: linkedBriefing,
    opportunity: linkedOpportunity,
  });

  const discussionMemory = buildOrgDiscussionMemory(bundle, {
    discussion,
    threadUpdates: threadUpdates.slice(0, BRAIN_CONTEXT_LIMITS.discussionUpdates),
    latestAnalysis,
    priorAnalyses: priorAnalyses.slice(1),
    linkedOpportunity,
    linkedBriefing,
    linkedBlueprint,
  });

  const opportunityMemory = buildOrgOpportunityMemory(bundle, linkedOpportunity
    ? {
        opportunity: linkedOpportunity,
        linkedDiscussion: discussion,
        linkedBriefing,
        deploymentReadinessKey: linkedBriefing
          ? getDeploymentReadinessFromBriefing(linkedBriefing.status).key
          : null,
        deploymentAssetsAvailable: deploymentFields.parsedAssetCount > 0,
        linkedBlueprint,
      }
    : null);

  const briefingMemory = buildOrgBriefingMemory(bundle, linkedBriefing
    ? {
        briefing: linkedBriefing,
        linkedOpportunity,
        linkedDiscussion: discussion,
        linkedBlueprint,
      }
    : null);

  const assetMemory = buildAssetMemory(
    bundle.blueprints,
    linkedBlueprint,
    deploymentFields,
  );

  return assembleContext(bundle, "discussion", {
    discussionMemory,
    opportunityMemory,
    briefingMemory,
    assetMemory,
    focusFeedback: {
      briefingStatus: linkedBriefing?.status ?? null,
      opportunityStatus: linkedOpportunity?.status ?? null,
      discussionStatus: discussion.status,
      hasLinkedBlueprint: Boolean(linkedBlueprint),
      hasDeploymentAssets: deploymentFields.parsedAssetCount > 0,
      deploymentAssetCount: deploymentFields.parsedAssetCount,
    },
  });
}

export async function buildBrainContextForOpportunity(
  params: BuildBrainContextForOpportunityParams,
): Promise<BrainEngineContext | null> {
  const orgId = assertOrganizationId(params.organizationId);
  const bundle = await loadOrganizationData(orgId);

  if (!bundle) {
    return null;
  }

  const opportunity = await getOpportunityById(params.opportunityId, orgId);
  if (!opportunity || !belongsToOrganization(opportunity, orgId)) {
    throw new BrainContextNotFoundError(
      `Opportunity not found for organization: ${params.opportunityId}`,
    );
  }

  const linkedDiscussion = opportunity.discussion_id
    ? await getDiscussionById(opportunity.discussion_id, orgId)
    : null;

  const linkedBriefing = await getLatestReviewByOpportunityId(
    opportunity.id,
    orgId,
  );

  const linkedBlueprint = linkedBriefing
    ? await getDisplayAssetBlueprintForBriefing({
        briefingId: linkedBriefing.id,
        organizationId: orgId,
        discussionId: opportunity.discussion_id,
      })
    : opportunity.discussion_id
      ? await getDisplayAssetBlueprintByDiscussionId(
          opportunity.discussion_id,
          orgId,
        )
      : null;

  const latestAnalysis =
    opportunity.discussion_id
      ? await getLatestDiscussionAnalysis(opportunity.discussion_id, orgId)
      : null;

  const deploymentFields = computeDeploymentAssetFields({
    analysis: latestAnalysis,
    briefing: linkedBriefing,
    opportunity,
  });

  const discussionMemory = buildOrgDiscussionMemory(
    bundle,
    linkedDiscussion
      ? {
          discussion: linkedDiscussion,
          threadUpdates: linkedDiscussion
            ? await getDiscussionUpdatesByDiscussionId(
                linkedDiscussion.id,
                orgId,
              )
            : [],
          latestAnalysis,
          priorAnalyses: linkedDiscussion
            ? (await fetchDiscussionAnalyses(linkedDiscussion.id, orgId)).slice(1)
            : [],
          linkedOpportunity: opportunity,
          linkedBriefing,
          linkedBlueprint,
        }
      : null,
  );

  const opportunityMemory = buildOrgOpportunityMemory(bundle, {
    opportunity,
    linkedDiscussion,
    linkedBriefing,
    deploymentReadinessKey: linkedBriefing
      ? getDeploymentReadinessFromBriefing(linkedBriefing.status).key
      : null,
    deploymentAssetsAvailable: deploymentFields.parsedAssetCount > 0,
    linkedBlueprint,
  });

  const briefingMemory = buildOrgBriefingMemory(bundle, linkedBriefing
    ? {
        briefing: linkedBriefing,
        linkedOpportunity: opportunity,
        linkedDiscussion,
        linkedBlueprint,
      }
    : null);

  const assetMemory = buildAssetMemory(
    bundle.blueprints,
    linkedBlueprint,
    deploymentFields,
  );

  return assembleContext(bundle, "opportunity", {
    discussionMemory,
    opportunityMemory,
    briefingMemory,
    assetMemory,
    focusFeedback: {
      briefingStatus: linkedBriefing?.status ?? null,
      opportunityStatus: opportunity.status,
      discussionStatus: linkedDiscussion?.status ?? null,
      hasLinkedBlueprint: Boolean(linkedBlueprint),
      hasDeploymentAssets: deploymentFields.parsedAssetCount > 0,
      deploymentAssetCount: deploymentFields.parsedAssetCount,
    },
  });
}

export async function buildBrainContextForBriefing(
  params: BuildBrainContextForBriefingParams,
): Promise<BrainEngineContext | null> {
  const orgId = assertOrganizationId(params.organizationId);
  const bundle = await loadOrganizationData(orgId);

  if (!bundle) {
    return null;
  }

  const briefing = await getReviewById(params.briefingId, orgId);
  if (!briefing || !belongsToOrganization(briefing, orgId)) {
    throw new BrainContextNotFoundError(
      `Briefing not found for organization: ${params.briefingId}`,
    );
  }

  const linkedOpportunity = briefing.opportunity_id
    ? await getOpportunityById(briefing.opportunity_id, orgId)
    : null;

  const linkedDiscussion = briefing.discussion_id
    ? await getDiscussionById(briefing.discussion_id, orgId)
    : linkedOpportunity?.discussion_id
      ? await getDiscussionById(linkedOpportunity.discussion_id, orgId)
      : null;

  const linkedBlueprint = await getDisplayAssetBlueprintForBriefing({
    briefingId: briefing.id,
    organizationId: orgId,
    discussionId: briefing.discussion_id ?? linkedDiscussion?.id ?? null,
  });

  const latestAnalysis =
    linkedDiscussion
      ? await getLatestDiscussionAnalysis(linkedDiscussion.id, orgId)
      : null;

  const deploymentFields = computeDeploymentAssetFields({
    analysis: latestAnalysis,
    briefing,
    opportunity: linkedOpportunity,
  });

  const discussionMemory = buildOrgDiscussionMemory(
    bundle,
    linkedDiscussion
      ? {
          discussion: linkedDiscussion,
          threadUpdates: await getDiscussionUpdatesByDiscussionId(
            linkedDiscussion.id,
            orgId,
          ),
          latestAnalysis,
          priorAnalyses: (await fetchDiscussionAnalyses(linkedDiscussion.id, orgId)).slice(1),
          linkedOpportunity,
          linkedBriefing: briefing,
          linkedBlueprint,
        }
      : null,
  );

  const opportunityMemory = buildOrgOpportunityMemory(
    bundle,
    linkedOpportunity
      ? {
          opportunity: linkedOpportunity,
          linkedDiscussion,
          linkedBriefing: briefing,
          deploymentReadinessKey: getDeploymentReadinessFromBriefing(
            briefing.status,
          ).key,
          deploymentAssetsAvailable: deploymentFields.parsedAssetCount > 0,
          linkedBlueprint,
        }
      : null,
  );

  const briefingMemory = buildOrgBriefingMemory(bundle, {
    briefing,
    linkedOpportunity,
    linkedDiscussion,
    linkedBlueprint,
  });

  const assetMemory = buildAssetMemory(
    bundle.blueprints,
    linkedBlueprint,
    deploymentFields,
  );

  return assembleContext(bundle, "briefing", {
    discussionMemory,
    opportunityMemory,
    briefingMemory,
    assetMemory,
    focusFeedback: {
      briefingStatus: briefing.status,
      opportunityStatus: linkedOpportunity?.status ?? null,
      discussionStatus: linkedDiscussion?.status ?? null,
      hasLinkedBlueprint: Boolean(linkedBlueprint),
      hasDeploymentAssets: deploymentFields.parsedAssetCount > 0,
      deploymentAssetCount: deploymentFields.parsedAssetCount,
    },
  });
}
