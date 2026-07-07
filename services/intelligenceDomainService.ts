import { isIntelligenceDomainActive } from "@/lib/intelligenceDomainStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Community } from "@/services/communityService";
import {
    createCommunity,
    getCommunities,
    getCommunityById,
} from "@/services/communityService";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";

export type IntelligenceDomain = Community;

export type IntelligenceDomainStats = {
  discussionsAnalyzed: number;
  highIntentDiscussions: number;
  opportunitiesDetected: number;
  briefingsGenerated: number;
  assetBlueprintsGenerated: number;
  knowledgeConfidence: number | null;
};

export type CreateIntelligenceDomainInput = {
    name: string;
    description?: string | null;
    market?: string | null;
    status?: string;
};

export async function getIntelligenceDomains(): Promise<IntelligenceDomain[]> {
    return getCommunities();
}

export async function getActiveIntelligenceDomains(): Promise<IntelligenceDomain[]> {
    const domains = await getIntelligenceDomains();
    return domains.filter((domain) => isIntelligenceDomainActive(domain.status));
}

export async function getIntelligenceDomainById(
    id: string,
): Promise<IntelligenceDomain | null> {
    return getCommunityById(id);
}

export async function createIntelligenceDomain(
    input: CreateIntelligenceDomainInput,
): Promise<IntelligenceDomain | null> {
    const name = input.name.trim();

    if (!name) {
        return null;
    }

    return createCommunity({
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
  knowledgeConfidence?: number | null,
): Promise<IntelligenceDomainStats> {
  const [
    discussionsResult,
    opportunitiesResult,
    analyzedDiscussionIds,
  ] = await Promise.all([
    supabaseAdmin
      .from("discussions")
      .select("id, opportunity_score")
      .eq("community_id", communityId),
    supabaseAdmin
      .from("opportunities")
      .select("id")
      .eq("community_id", communityId),
    getAnalyzedDiscussionIds(),
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
      .in("opportunity_id", opportunityIds);
    briefingsGenerated = count ?? 0;
  }

  let assetBlueprintsGenerated = 0;
  if (discussionIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("athena_asset_blueprints")
      .select("id", { count: "exact", head: true })
      .in("discussion_id", discussionIds);
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
