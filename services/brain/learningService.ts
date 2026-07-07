import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createKnowledgeAsset } from "@/services/knowledgeAssetService";
import { getReviewById, type AthenaReview } from "@/services/reviewService";

function compactText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildKnowledgeAssetContent(review: AthenaReview) {
  const sections = [
    ["Executive Summary", review.summary],
    ["Pain Points", review.pain_points],
    ["Buyer Stage", review.buyer_stage],
    ["Recommended Response", review.recommended_response],
    ["CTA", review.cta],
  ];

  return sections
    .map(([label, value]) => {
      const text = compactText(value);
      return text ? `## ${label}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function inferTags(review: AthenaReview): string[] {
  const tagSet = new Set<string>();

  if (review.buyer_stage) tagSet.add(review.buyer_stage.toLowerCase());
  if (review.opportunity_id) tagSet.add("opportunity-linked");
  if (review.discussion_id) tagSet.add("discussion-linked");
  if (review.cta) tagSet.add("cta");
  if (review.recommended_response) tagSet.add("reply");

  return Array.from(tagSet);
}

export async function learnFromApprovedBriefing(reviewId: string) {
  const review = await getReviewById(reviewId);

  if (!review) {
    throw new Error(`Cannot learn from missing briefing/review: ${reviewId}`);
  }

  const content = buildKnowledgeAssetContent(review);

  if (!content) {
    return {
      learned: false,
      reason: "Approved briefing has no reusable content.",
    };
  }

  const title =
    review.summary?.slice(0, 90) ||
    `Approved Briefing ${review.id}`;

  const knowledgeAsset = await createKnowledgeAsset({
    title,
    category: "Institutional Knowledge",
    asset_type: "approved_briefing",
    summary: review.summary ?? null,
    content,
    community_id: review.community_id ?? null,
    source_type: "athena_reviews",
    source_id: review.id,
    rating: review.confidence ? Math.max(1, Math.min(5, Math.round(review.confidence / 20))) : null,
    tags: inferTags(review),
    notes: "Automatically captured by Athena Brain after briefing approval.",
  });

  const links = [
    review.discussion_id
      ? {
          knowledge_asset_id: knowledgeAsset.id,
          linked_type: "discussions",
          linked_id: review.discussion_id,
          relationship: "learned_from_discussion",
        }
      : null,
    review.opportunity_id
      ? {
          knowledge_asset_id: knowledgeAsset.id,
          linked_type: "opportunities",
          linked_id: review.opportunity_id,
          relationship: "learned_from_opportunity",
        }
      : null,
    {
      knowledge_asset_id: knowledgeAsset.id,
      linked_type: "athena_reviews",
      linked_id: review.id,
      relationship: "learned_from_approved_briefing",
    },
  ].filter(Boolean);

  if (links.length > 0) {
    const { error } = await supabaseAdmin
      .from("knowledge_asset_links")
      .insert(links);

    if (error) {
      throw new Error(`Failed to create knowledge asset links: ${error.message}`);
    }
  }

  return {
    learned: true,
    knowledgeAssetId: knowledgeAsset.id,
  };
}
