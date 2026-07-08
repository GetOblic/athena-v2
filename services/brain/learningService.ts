import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createKnowledgeAsset } from "@/services/knowledgeAssetService";
import { getDiscussionById } from "@/services/discussionService";
import { getReviewById, type AthenaReview } from "@/services/reviewService";
import { getExecutiveReasoning } from "@/services/brain/executiveReasoningService";

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

function inferTags(review: AthenaReview, executiveNotes?: string[]): string[] {
  const tagSet = new Set<string>();

  if (review.buyer_stage) tagSet.add(review.buyer_stage.toLowerCase());
  if (review.opportunity_id) tagSet.add("opportunity-linked");
  if (review.discussion_id) tagSet.add("discussion-linked");
  if (review.cta) tagSet.add("cta");
  if (review.recommended_response) tagSet.add("reply");
  if (executiveNotes?.length) tagSet.add("executive-learning");

  return Array.from(tagSet);
}

function buildExecutiveLearningNotes(input: {
  review: AthenaReview;
  discussionPlatform?: string | null;
  intelligence?: Awaited<ReturnType<typeof getExecutiveReasoning>>["executiveIntelligence"];
}): string {
  const intelligence = input.intelligence;
  if (!intelligence) {
    return "Executive learning captured without intelligence pipeline metadata.";
  }

  return [
    "Executive Learning Metadata:",
    `Platform: ${input.discussionPlatform ?? "unknown"}`,
    `Hidden problem: ${intelligence.hiddenProblem.hiddenMarketProblem}`,
    `Buyer psychology: ${intelligence.buyerPsychology.coreFear ?? "n/a"}`,
    `Strategic asset: ${intelligence.assetStrategy.selectedAssetType}`,
    `Business outcome: ${intelligence.executiveRecommendation.expectedBusinessOutcome}`,
    `Reasoning path: market → hidden problem → psychology → differentiation → contrarian → asset strategy`,
    `Contrarian insight: ${intelligence.contrarianThinking.assumptionChallenge}`,
  ].join("\n");
}

export async function learnFromApprovedBriefing(
  reviewId: string,
  organizationId: string,
) {
  const review = await getReviewById(reviewId, organizationId);

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
    review.summary?.slice(0, 90) || `Approved Briefing ${review.id}`;

  const discussion = review.discussion_id
    ? await getDiscussionById(review.discussion_id, organizationId)
    : null;

  let executiveIntelligence:
    | Awaited<ReturnType<typeof getExecutiveReasoning>>["executiveIntelligence"]
    | undefined;
  try {
    const reasoning = await getExecutiveReasoning({
      organizationId,
      discussionId: review.discussion_id ?? undefined,
      opportunityId: review.opportunity_id ?? undefined,
      briefingId: review.id,
    });
    executiveIntelligence = reasoning.executiveIntelligence;
  } catch {
    executiveIntelligence = undefined;
  }

  const executiveLearningNotes = buildExecutiveLearningNotes({
    review,
    discussionPlatform: discussion?.platform ?? null,
    intelligence: executiveIntelligence,
  });

  const knowledgeAsset = await createKnowledgeAsset({
    organization_id: organizationId,
    title,
    category: "Institutional Knowledge",
    asset_type: "approved_briefing",
    summary: review.summary ?? null,
    content,
    community_id: discussion?.community_id ?? null,
    user_id: discussion?.user_id ?? null,
    source_type: "athena_reviews",
    source_id: review.id,
    rating: review.confidence
      ? Math.max(1, Math.min(5, Math.round(review.confidence / 20)))
      : null,
    tags: inferTags(review, executiveIntelligence ? ["executive-learning"] : undefined),
    notes: [
      "Automatically captured by Athena Brain after briefing approval.",
      executiveLearningNotes,
    ].join("\n\n"),
  });

  const links: {
    knowledge_asset_id: string;
    linked_type: string;
    linked_id: string;
    relationship: string;
  }[] = [];

  if (review.discussion_id) {
    links.push({
      knowledge_asset_id: knowledgeAsset.id,
      linked_type: "discussions",
      linked_id: review.discussion_id,
      relationship: "learned_from_discussion",
    });
  }

  if (review.opportunity_id) {
    links.push({
      knowledge_asset_id: knowledgeAsset.id,
      linked_type: "opportunities",
      linked_id: review.opportunity_id,
      relationship: "learned_from_opportunity",
    });
  }

  links.push({
    knowledge_asset_id: knowledgeAsset.id,
    linked_type: "athena_reviews",
    linked_id: review.id,
    relationship: "learned_from_approved_briefing",
  });

  if (links.length > 0) {
    const { error } = await supabaseAdmin.from("knowledge_asset_links").insert(
      links.map((link) => ({
        ...link,
        organization_id: organizationId,
      })),
    );

    if (error) {
      throw new Error(`Failed to create knowledge asset links: ${error.message}`);
    }
  }

  return {
    learned: true,
    knowledgeAssetId: knowledgeAsset.id,
  };
}
