import { formatDomainHealthState } from "@/lib/domainHealthDisplay";
import { isIntelligenceDomainActive } from "@/lib/intelligenceDomainStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Community } from "@/services/communityService";
import {
  createCommunity,
  deleteCommunity,
  getCommunities,
  getCommunityById,
  getCommunityDiscussionCount,
  updateCommunity,
} from "@/services/communityService";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import { getDiscussionIdsByCommunityId } from "@/services/discussionService";
import {
  getCommunityIntelligenceHistory,
  type CommunityIntelligence,
} from "@/services/communityIntelligenceService";

export type IntelligenceDomain = Community;

export type IntelligenceDomainStats = {
  discussionsCaptured: number;
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

export type DomainLearningEventKind =
  | "import"
  | "analysis"
  | "regeneration"
  | "update"
  | "opportunity"
  | "briefing"
  | "blueprint"
  | "intelligence";

export type DomainLearningEvent = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  kind: DomainLearningEventKind;
};

export type UpdateIntelligenceDomainInput = {
  name?: string;
  description?: string | null;
  market?: string | null;
  status?: string;
  priority?: number;
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

export async function getIntelligenceDomainDiscussionCounts(
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("discussions")
    .select("community_id")
    .eq("organization_id", organizationId)
    .not("community_id", "is", null);

  if (error) {
    console.error("Error fetching domain discussion counts:", error);
    return new Map();
  }

  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    if (!row.community_id) {
      continue;
    }

    counts.set(row.community_id, (counts.get(row.community_id) ?? 0) + 1);
  }

  return counts;
}

export async function updateIntelligenceDomain(
  id: string,
  organizationId: string,
  input: UpdateIntelligenceDomainInput,
): Promise<IntelligenceDomain | null> {
  const payload: Parameters<typeof updateCommunity>[2] = {};

  if (input.name !== undefined) {
    payload.group_name = input.name;
  }
  if (input.description !== undefined) {
    payload.notes = input.description;
  }
  if (input.market !== undefined) {
    payload.niche = input.market;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
  }
  if (input.priority !== undefined) {
    payload.priority = input.priority;
  }

  return updateCommunity(id, organizationId, payload);
}

export async function deleteIntelligenceDomain(
  id: string,
  organizationId: string,
): Promise<{ success: boolean; softDeleted: boolean }> {
  return deleteCommunity(id, organizationId);
}

export async function getIntelligenceDomainDiscussionCount(
  id: string,
  organizationId: string,
): Promise<number> {
  return getCommunityDiscussionCount(id, organizationId);
}

export async function getIntelligenceDomainStats(
  communityId: string,
  organizationId: string,
  knowledgeConfidence?: number | null,
): Promise<IntelligenceDomainStats> {
  const [discussionsResult, analyzedDiscussionIds] = await Promise.all([
      supabaseAdmin
        .from("discussions")
        .select("id, opportunity_score")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId),
      getAnalyzedDiscussionIds(organizationId),
    ]);

  const discussions = discussionsResult.data ?? [];
  const discussionIds = discussions.map((discussion) => discussion.id);

  let opportunityIds: string[] = [];
  if (discussionIds.length > 0) {
    const { data: opportunitiesByDiscussion } = await supabaseAdmin
      .from("opportunities")
      .select("id")
      .eq("organization_id", organizationId)
      .in("discussion_id", discussionIds);

    opportunityIds = (opportunitiesByDiscussion ?? []).map((row) => row.id);
  }

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
    discussionsCaptured: discussions.length,
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

  let healthLabel = formatDomainHealthState({
    knowledgeConfidence,
    discussionsAnalyzed: input.stats.discussionsAnalyzed,
  });
  let healthTone: DomainHealth["healthTone"] = "learning";

  if (healthLabel === "Mature") {
    healthTone = "strong";
  } else if (healthLabel === "Building" || healthLabel === "Confident") {
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
  const discussionIds = await getDiscussionIdsByCommunityId(
    communityId,
    organizationId,
  );

  const [
    intelligenceHistory,
    discussionsResult,
    analysesResult,
    opportunitiesResult,
    updatesResult,
    briefingsResult,
    blueprintsResult,
  ] = await Promise.all([
    getCommunityIntelligenceHistory(communityId, organizationId, 5),
    supabaseAdmin
      .from("discussions")
      .select("id, title, created_at")
      .eq("community_id", communityId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
    discussionIds.length > 0
      ? supabaseAdmin
          .from("athena_discussion_analysis")
          .select(
            "id, discussion_id, created_at, summary, confidence, opportunity_detected",
          )
          .in("discussion_id", discussionIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    discussionIds.length > 0
      ? supabaseAdmin
          .from("opportunities")
          .select("id, created_at, title, score")
          .in("discussion_id", discussionIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    discussionIds.length > 0
      ? supabaseAdmin
          .from("athena_discussion_updates")
          .select("id, discussion_id, created_at, body")
          .in("discussion_id", discussionIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    discussionIds.length > 0
      ? supabaseAdmin
          .from("athena_reviews")
          .select("id, created_at, summary")
          .in("discussion_id", discussionIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    discussionIds.length > 0
      ? supabaseAdmin
          .from("athena_asset_blueprints")
          .select("id, created_at, asset_title")
          .in("discussion_id", discussionIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const events: DomainLearningEvent[] = [];
  const discussionTitles = new Map(
    (discussionsResult.data ?? []).map((discussion) => [
      discussion.id,
      discussion.title,
    ]),
  );

  for (const record of intelligenceHistory) {
    events.push({
      id: `intel-${record.id}`,
      title: "Domain intelligence refreshed",
      detail:
        record.executive_summary?.slice(0, 140) ||
        "Athena updated its understanding of this market.",
      timestamp: record.created_at,
      kind: "intelligence",
    });
  }

  for (const discussion of discussionsResult.data ?? []) {
    events.push({
      id: `import-${discussion.id}`,
      title: "Discussion imported",
      detail: discussion.title,
      timestamp: discussion.created_at,
      kind: "import",
    });
  }

  const analysisCountByDiscussion = new Map<string, number>();
  const analyses = [...(analysesResult.data ?? [])].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const analysis of analyses) {
    const previousCount =
      analysisCountByDiscussion.get(analysis.discussion_id) ?? 0;
    analysisCountByDiscussion.set(analysis.discussion_id, previousCount + 1);

    const discussionTitle =
      discussionTitles.get(analysis.discussion_id) ?? "Discussion";

    events.push({
      id: `analysis-${analysis.id}`,
      title:
        previousCount === 0 ? "Discussion analyzed" : "AI analysis regenerated",
      detail:
        analysis.summary?.slice(0, 140) ||
        `${discussionTitle} · confidence ${analysis.confidence ?? 0}%`,
      timestamp: analysis.created_at,
      kind: previousCount === 0 ? "analysis" : "regeneration",
    });
  }

  for (const update of updatesResult.data ?? []) {
    events.push({
      id: `update-${update.id}`,
      title: "Discussion updated",
      detail: update.body.slice(0, 140),
      timestamp: update.created_at,
      kind: "update",
    });
  }

  for (const opportunity of opportunitiesResult.data ?? []) {
    events.push({
      id: `opp-${opportunity.id}`,
      title: "Opportunity detected",
      detail: `${opportunity.title} · score ${opportunity.score}`,
      timestamp: opportunity.created_at,
      kind: "opportunity",
    });
  }

  for (const briefing of briefingsResult.data ?? []) {
    events.push({
      id: `briefing-${briefing.id}`,
      title: "Briefing generated",
      detail:
        briefing.summary?.slice(0, 140) ||
        "Executive briefing created for this domain.",
      timestamp: briefing.created_at,
      kind: "briefing",
    });
  }

  for (const blueprint of blueprintsResult.data ?? []) {
    events.push({
      id: `blueprint-${blueprint.id}`,
      title: "Asset blueprint created",
      detail: blueprint.asset_title || "Strategic asset blueprint ready.",
      timestamp: blueprint.created_at,
      kind: "blueprint",
    });
  }

  return events
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 8);
}
