import { isIntelligenceDomainActive } from "@/lib/intelligenceDomainStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Community } from "@/services/communityService";
import {
  createCommunity,
  getCommunities,
  getCommunityById,
} from "@/services/communityService";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import {
  getCommunityIntelligenceHistory,
  type CommunityIntelligence,
} from "@/services/communityIntelligenceService";

export type IntelligenceDomain = Community;

export type IntelligenceDomainStats = {
  discussionsAnalyzed: number;
  highIntentDiscussions: number;
  opportunitiesDetected: number;
  briefingsGenerated: number;
  assetBlueprintsGenerated: number;
  knowledgeConfidence: number | null;
};

export type DomainHealth = {
  statusLabel: string;
  isActive: boolean;
  knowledgeConfidence: number | null;
  confidenceDelta: number | null;
  healthLabel: string;
  healthTone: "strong" | "building" | "learning";
};

export type DomainLearningEvent = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
};

export type CreateIntelligenceDomainInput = {
  organization_id: string;
  name: string;
  description?: string | null;
  market?: string | null;
  status?: string;
};

export async function getIntelligenceDomains(
  organizationId: string,
): Promise<IntelligenceDomain[]> {
  return getCommunities(organizationId);
}

export async function getActiveIntelligenceDomains(
  organizationId: string,
): Promise<IntelligenceDomain[]> {
  const domains = await getIntelligenceDomains(organizationId);
  return domains.filter((domain) => isIntelligenceDomainActive(domain.status));
}

export async function getIntelligenceDomainById(
  id: string,
  organizationId: string,
): Promise<IntelligenceDomain | null> {
  return getCommunityById(id, organizationId);
}

export async function createIntelligenceDomain(
  input: CreateIntelligenceDomainInput,
): Promise<IntelligenceDomain | null> {
  const name = input.name.trim();

  if (!name) {
    return null;
  }

  return createCommunity({
    organization_id: input.organization_id,
    group_name: name,
    notes: input.description ?? null,
    niche: input.market ?? null,
    status: input.status ?? "active",
  });
}

export function getIntelligenceDomainName(domain: IntelligenceDomain): string {
  return domain.group_name;
}

export async function getIntelligenceDomainStats(
  communityId: string,
  organizationId: string,
  knowledgeConfidence?: number | null,
): Promise<IntelligenceDomainStats> {
  const [discussionsResult, opportunitiesResult, analyzedDiscussionIds] =
    await Promise.all([
      supabaseAdmin
        .from("discussions")
        .select("id, opportunity_score")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("opportunities")
        .select("id")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId),
      getAnalyzedDiscussionIds(organizationId),
    ]);

  const discussions = discussionsResult.data ?? [];
  const discussionIds = discussions.map((discussion) => discussion.id);
  const opportunityIds = (opportunitiesResult.data ?? []).map((row) => row.id);

  const discussionsAnalyzed = discussions.filter((discussion) =>
    analyzedDiscussionIds.has(discussion.id),
  ).length;
  const highIntentDiscussions = discussions.filter(
    (discussion) =>
      analyzedDiscussionIds.has(discussion.id) &&
      (discussion.opportunity_score ?? 0) >= 65,
  ).length;

  let briefingsGenerated = 0;
  if (opportunityIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("athena_reviews")
      .select("id", { count: "exact", head: true })
      .in("opportunity_id", opportunityIds)
      .eq("organization_id", organizationId);
    briefingsGenerated = count ?? 0;
  }

  let assetBlueprintsGenerated = 0;
  if (discussionIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("athena_asset_blueprints")
      .select("id", { count: "exact", head: true })
      .in("discussion_id", discussionIds)
      .eq("organization_id", organizationId);
    assetBlueprintsGenerated = count ?? 0;
  }

  return {
    discussionsAnalyzed,
    highIntentDiscussions,
    opportunitiesDetected: opportunityIds.length,
    briefingsGenerated,
    assetBlueprintsGenerated,
    knowledgeConfidence: knowledgeConfidence ?? null,
  };
}

export function getDomainHealth(input: {
  domain: IntelligenceDomain;
  stats: IntelligenceDomainStats;
  intelligenceHistory: CommunityIntelligence[];
}): DomainHealth {
  const isActive = isIntelligenceDomainActive(input.domain.status);
  const latest = input.intelligenceHistory[0] ?? null;
  const previous = input.intelligenceHistory[1] ?? null;
  const knowledgeConfidence =
    latest?.confidence ?? input.stats.knowledgeConfidence;
  const confidenceDelta =
    latest?.confidence != null && previous?.confidence != null
      ? latest.confidence - previous.confidence
      : null;

  let healthLabel = "Learning";
  let healthTone: DomainHealth["healthTone"] = "learning";

  if ((knowledgeConfidence ?? 0) >= 70 && input.stats.discussionsAnalyzed >= 3) {
    healthLabel = "Strong";
    healthTone = "strong";
  } else if (
    input.stats.discussionsAnalyzed > 0 ||
    (knowledgeConfidence ?? 0) > 0
  ) {
    healthLabel = "Building";
    healthTone = "building";
  }

  return {
    statusLabel: isActive ? "Active" : "Inactive",
    isActive,
    knowledgeConfidence,
    confidenceDelta,
    healthLabel,
    healthTone,
  };
}

export async function getDomainLearningTimeline(
  communityId: string,
  organizationId: string,
): Promise<DomainLearningEvent[]> {
  const [intelligenceHistory, analysesResult, opportunitiesResult] =
    await Promise.all([
      getCommunityIntelligenceHistory(communityId, organizationId, 5),
      supabaseAdmin
        .from("athena_discussion_analysis")
        .select("id, created_at, summary, confidence, opportunity_detected")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("opportunities")
        .select("id, created_at, title, score")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const events: DomainLearningEvent[] = [];

  for (const record of intelligenceHistory) {
    events.push({
      id: `intel-${record.id}`,
      title: "Domain intelligence refreshed",
      detail:
        record.executive_summary?.slice(0, 140) ||
        "Athena updated its understanding of this market.",
      timestamp: record.created_at,
    });
  }

  for (const analysis of analysesResult.data ?? []) {
    events.push({
      id: `analysis-${analysis.id}`,
      title: analysis.opportunity_detected
        ? "Opportunity signal detected"
        : "Discussion analyzed",
      detail:
        analysis.summary?.slice(0, 140) ||
        `Confidence ${analysis.confidence ?? 0}%`,
      timestamp: analysis.created_at,
    });
  }

  for (const opportunity of opportunitiesResult.data ?? []) {
    events.push({
      id: `opp-${opportunity.id}`,
      title: "Opportunity captured",
      detail: `${opportunity.title} · score ${opportunity.score}`,
      timestamp: opportunity.created_at,
    });
  }

  return events
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 8);
}
