import { getDeploymentReadinessFromBriefing } from "@/lib/deploymentReadiness";
import {
  formatDomainHealthState,
  getDomainHealthStateColor,
} from "@/lib/domainHealthDisplay";
import { normalizeDiscussionLifecycleKey } from "@/lib/discussionStatus";
import { classifyOpportunityPriority } from "@/lib/opportunityPriority";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDashboardStats } from "@/services/dashboardService";
import { getTodaysIntelligence } from "@/services/todaysIntelligenceService";
import { getDomainLearningTimeline } from "@/services/intelligenceDomainService";
import type {
  AthenaBrainContext,
  BrainEngineContext,
  BriefingMemoryEntry,
  BusinessMemory,
  ContextSummary,
  ContextWarnings,
  DomainLearningTimelineSummary,
  DomainMemory,
  FeedbackMemory,
  IdentityMemory,
  KnowledgeMemory,
  OperationalMemory,
  OpportunityMemoryEntry,
} from "@/services/brain/brainContextTypes";
import {
  MAX_COMMUNITY_INTELLIGENCE_CONTEXT,
  MAX_PRODUCTION_INTELLIGENCE_CONTEXT,
} from "@/services/brain/brainContextTypes";

const BRAIN_FIELD_WEIGHTS = [
  "about_you",
  "expertise",
  "website",
  "master_profile",
  "brain_status",
] as const;

export function computeBrainCompletenessScore(missingFields: string[]): number {
  const missing = new Set(missingFields);
  const filled = BRAIN_FIELD_WEIGHTS.filter((field) => !missing.has(field));
  return Math.round((filled.length / BRAIN_FIELD_WEIGHTS.length) * 100);
}

export function countStatusDistribution<T extends { status: string }>(
  items: T[],
  normalize: (status: string) => string,
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const item of items) {
    const key = normalize(item.status);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return distribution;
}

export function computeDiscussionAgeDays(
  createdAt: string | null | undefined,
): number | null {
  if (!createdAt) {
    return null;
  }

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return null;
  }

  const diffMs = Date.now() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function buildIdentityMemory(businessMemory: BusinessMemory): IdentityMemory {
  if (!businessMemory.identity) {
    return {
      userId: null,
      greetingName: null,
      aboutYou: null,
      expertise: null,
      website: null,
      brainStatus: null,
      masterProfile: null,
      masterProfileVersion: null,
      homepageLearning: null,
      missingFields: businessMemory.missingFields,
      isBrainTrained: businessMemory.isBrainTrained,
      completenessScore: businessMemory.completenessScore,
    };
  }

  return {
    ...businessMemory.identity,
    missingFields: businessMemory.missingFields,
    isBrainTrained: businessMemory.isBrainTrained,
    completenessScore: businessMemory.completenessScore,
  };
}

export async function fetchRecentCommunityIntelligence(
  organizationId: string,
  limit = MAX_COMMUNITY_INTELLIGENCE_CONTEXT,
) {
  const { data, error } = await supabaseAdmin
    .from("athena_community_intelligence")
    .select("id, community_id, executive_summary, confidence, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching community intelligence for brain context:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    communityId: row.community_id,
    executiveSummary: row.executive_summary,
    confidence: row.confidence,
    createdAt: row.created_at,
  }));
}

export async function fetchRecentProductionIntelligence(
  organizationId: string,
  limit = MAX_PRODUCTION_INTELLIGENCE_CONTEXT,
) {
  const { data, error } = await supabaseAdmin
    .from("athena_production_intelligence")
    .select("id, community_id, content_theme, confidence, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching production intelligence for brain context:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    communityId: row.community_id,
    contentTheme: row.content_theme,
    confidence: row.confidence,
    createdAt: row.created_at,
  }));
}

export async function loadOperationalMemory(
  organizationId: string,
  feedbackMemory: FeedbackMemory,
  opportunityQueues: {
    immediateAction: OpportunityMemoryEntry[];
    highIntent: OpportunityMemoryEntry[];
    monitor: OpportunityMemoryEntry[];
    lowPriority: OpportunityMemoryEntry[];
  },
): Promise<OperationalMemory> {
  const [dashboard, todaysIntelligence] = await Promise.all([
    getDashboardStats(organizationId),
    getTodaysIntelligence(organizationId),
  ]);

  const pendingEditorialTotal =
    feedbackMemory.briefingStatuses.draft +
    feedbackMemory.briefingStatuses.needsRevision;

  return {
    dashboard,
    todaysIntelligence,
    queueCounts: {
      immediateActionOpportunities: opportunityQueues.immediateAction.length,
      highIntentOpportunities: opportunityQueues.highIntent.length,
      monitorOpportunities: opportunityQueues.monitor.length,
      lowPriorityOpportunities: opportunityQueues.lowPriority.length,
      draftBriefings: feedbackMemory.briefingStatuses.draft,
      needsRevisionBriefings: feedbackMemory.briefingStatuses.needsRevision,
      approvedBriefings: feedbackMemory.briefingStatuses.approved,
      rejectedBriefings: feedbackMemory.briefingStatuses.rejected,
      pendingEditorialTotal,
      newDiscussions: todaysIntelligence.newDiscussions,
      strategicBlueprints: todaysIntelligence.strategicBlueprints,
    },
  };
}

export async function enrichKnowledgeMemory(
  base: KnowledgeMemory,
  organizationId: string,
): Promise<KnowledgeMemory> {
  const [communityIntelligence, productionIntelligence] = await Promise.all([
    fetchRecentCommunityIntelligence(organizationId),
    fetchRecentProductionIntelligence(organizationId),
  ]);

  const todays = await getTodaysIntelligence(organizationId);

  return {
    ...base,
    communityIntelligence,
    productionIntelligence,
    knowledgeConfidence: todays.knowledgeConfidence,
    knowledgeConfidenceDelta: todays.knowledgeConfidenceDelta,
  };
}

export async function enrichDomainMemory(
  domainMemory: DomainMemory,
  organizationId: string,
  focusDomainId: string | null,
): Promise<DomainMemory> {
  const activeDomainCount = domainMemory.domains.filter(
    (domain) => domain.isActive,
  ).length;

  const domains = await Promise.all(
    domainMemory.domains.map(async (domain) => {
      let learningTimelineSummary: DomainLearningTimelineSummary | null = null;

      if (focusDomainId && domain.id === focusDomainId) {
        const timeline = await getDomainLearningTimeline(domain.id, organizationId);
        const latest = timeline[0] ?? null;
        learningTimelineSummary = {
          eventCount: timeline.length,
          latestEventTitle: latest?.title ?? null,
          latestEventTimestamp: latest?.timestamp ?? null,
        };
      }

      const healthLabel = domain.healthLabel;
      const healthTone =
        healthLabel != null
          ? getDomainHealthStateColor(
              healthLabel as ReturnType<typeof formatDomainHealthState>,
            )
          : null;

      return {
        ...domain,
        healthTone,
        learningTimelineSummary,
      };
    }),
  );

  return {
    ...domainMemory,
    domains,
    activeDomainCount,
    focusDomainId,
  };
}

export function generateContextWarnings(input: {
  businessMemory: BusinessMemory;
  domainMemory: DomainMemory;
  discussionCount: number;
  opportunityCount: number;
  approvedBriefingCount: number;
  knowledgeMemory: KnowledgeMemory;
  feedbackMemory: FeedbackMemory;
  contextSummary: ContextSummary;
}): ContextWarnings {
  const codes: string[] = [...input.contextSummary.warnings];
  const messages: string[] = [];

  if (!input.businessMemory.isBrainTrained) {
    messages.push("Athena Brain is not fully trained.");
  }

  if (input.domainMemory.totalDomains === 0) {
    messages.push("No Intelligence Domains configured.");
  }

  if (input.discussionCount === 0) {
    messages.push("No discussions available in context.");
  }

  if (input.opportunityCount === 0) {
    codes.push("no_opportunities");
    messages.push("No opportunities available in context.");
  }

  if (input.approvedBriefingCount === 0) {
    codes.push("no_approved_briefings");
    messages.push("No approved Executive Briefings yet.");
  }

  if (
    input.knowledgeMemory.knowledgeConfidence != null &&
    input.knowledgeMemory.knowledgeConfidence < 40
  ) {
    codes.push("knowledge_confidence_low");
    messages.push("Knowledge confidence is low across Intelligence Domains.");
  }

  const editorialBacklog =
    input.feedbackMemory.briefingStatuses.draft +
    input.feedbackMemory.briefingStatuses.needsRevision;

  if (editorialBacklog >= 5) {
    codes.push("large_editorial_backlog");
    messages.push("Editorial backlog is large — multiple briefings need attention.");
  }

  if (!input.feedbackMemory.hasGeneratedAssets) {
    codes.push("no_reusable_assets");
    messages.push("No reusable Strategic Asset Blueprints with prompts yet.");
  }

  return {
    codes: [...new Set(codes)],
    messages: [...new Set(messages)],
  };
}

export function computeDeploymentReadinessDistribution(
  briefings: BriefingMemoryEntry[],
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const briefing of briefings) {
    const key = getDeploymentReadinessFromBriefing(briefing.status).key;
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return distribution;
}

export function partitionOpportunityQueues(
  entries: OpportunityMemoryEntry[],
  resolvePriority: (entry: OpportunityMemoryEntry) => ReturnType<
    typeof classifyOpportunityPriority
  >,
) {
  return {
    immediateAction: entries.filter(
      (entry) => resolvePriority(entry) === "immediate_action",
    ),
    highIntent: entries.filter(
      (entry) => resolvePriority(entry) === "high_intent",
    ),
    monitor: entries.filter((entry) => resolvePriority(entry) === "monitor"),
    lowPriority: entries.filter(
      (entry) => resolvePriority(entry) === "low_priority",
    ),
  };
}

export function buildDiscussionLifecycleDistribution(
  statuses: string[],
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const status of statuses) {
    const key = normalizeDiscussionLifecycleKey(status) ?? "unknown";
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return distribution;
}

export function toExecutiveContext(
  engine: BrainEngineContext,
  extras: {
    operationalMemory: OperationalMemory;
    contextWarnings: ContextWarnings;
    snapshot: AthenaBrainContext["snapshot"];
    domainMemory: DomainMemory;
    knowledgeMemory: KnowledgeMemory;
    feedbackMemory: FeedbackMemory;
  },
): Omit<AthenaBrainContext, "executiveMemory"> {
  return {
    organization: engine.organization,
    scope: engine.scope,
    businessMemory: engine.businessMemory,
    identityMemory: buildIdentityMemory(engine.businessMemory),
    domainMemory: extras.domainMemory,
    discussionMemory: engine.discussionMemory,
    opportunityMemory: engine.opportunityMemory,
    briefingMemory: engine.briefingMemory,
    blueprintMemory: engine.assetMemory,
    knowledgeMemory: extras.knowledgeMemory,
    feedbackMemory: extras.feedbackMemory,
    operationalMemory: extras.operationalMemory,
    contextWarnings: extras.contextWarnings,
    snapshot: extras.snapshot,
    contextSummary: engine.contextSummary,
    builtAt: engine.builtAt,
  };
}

export function enrichFeedbackMemory(
  feedback: FeedbackMemory,
  briefings: BriefingMemoryEntry[],
): FeedbackMemory {
  return {
    ...feedback,
    approvalCount: feedback.briefingStatuses.approved,
    revisionRequestCount: feedback.briefingStatuses.needsRevision,
    deploymentReadinessDistribution:
      computeDeploymentReadinessDistribution(briefings),
  };
}
