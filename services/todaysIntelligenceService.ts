import { classifyDiscussionQueue } from "@/lib/discussionStatus";
import { classifyOpportunityPriority } from "@/lib/opportunityPriority";
import { normalizeBriefingStatus } from "@/lib/briefingStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import { getDiscussions } from "@/services/discussionService";
import { getCanonicalOpportunities } from "@/services/opportunityService";
import { getCanonicalReviews } from "@/services/reviewService";

export type TodaysIntelligence = {
  newDiscussions: number;
  immediateActionOpportunities: number;
  briefingsAwaitingApproval: number;
  reusableAssetsCreated: number;
  highestOpportunity: {
    id: string;
    title: string;
    score: number;
  } | null;
  knowledgeConfidence: number | null;
  knowledgeConfidenceDelta: number | null;
};

async function getKnowledgeConfidenceSnapshot(
  organizationId: string,
): Promise<{
  current: number | null;
  delta: number | null;
}> {
  const { data, error } = await supabaseAdmin
    .from("athena_community_intelligence")
    .select("confidence, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (error || !data || data.length === 0) {
    return { current: null, delta: null };
  }

  const current = data[0]?.confidence ?? null;
  const previous = data[1]?.confidence ?? null;

  if (current == null) {
    return { current: null, delta: null };
  }

  if (previous == null) {
    return { current, delta: null };
  }

  return {
    current,
    delta: current - previous,
  };
}

export async function getTodaysIntelligence(
  organizationId: string,
): Promise<TodaysIntelligence> {
  const [
    discussions,
    analyzedDiscussionIds,
    opportunities,
    reviews,
    assetsResult,
    confidenceSnapshot,
  ] = await Promise.all([
    getDiscussions(organizationId),
    getAnalyzedDiscussionIds(organizationId),
    getCanonicalOpportunities(organizationId),
    getCanonicalReviews(organizationId),
    supabaseAdmin
      .from("athena_asset_blueprints")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    getKnowledgeConfidenceSnapshot(organizationId),
  ]);

  const assetsCount = assetsResult.count ?? 0;

  const newDiscussions = discussions.filter((discussion) => {
    const hasAnalysis = analyzedDiscussionIds.has(discussion.id);
    return classifyDiscussionQueue(hasAnalysis, discussion.status) === "new";
  }).length;

  const immediateActionOpportunities = opportunities.filter(
    (opportunity) =>
      classifyOpportunityPriority(opportunity) === "immediate_action",
  ).length;

  const briefingsAwaitingApproval = reviews.filter((review) => {
    const status = normalizeBriefingStatus(review.status);
    return status === "draft" || status === "needs_revision";
  }).length;

  const highestOpportunity = [...opportunities].sort(
    (a, b) => b.score - a.score,
  )[0];

  return {
    newDiscussions,
    immediateActionOpportunities,
    briefingsAwaitingApproval,
    reusableAssetsCreated: assetsCount,
    highestOpportunity: highestOpportunity
      ? {
          id: highestOpportunity.id,
          title: highestOpportunity.title,
          score: highestOpportunity.score,
        }
      : null,
    knowledgeConfidence: confidenceSnapshot.current,
    knowledgeConfidenceDelta: confidenceSnapshot.delta,
  };
}
