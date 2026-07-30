import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createKnowledgeAsset } from "@/services/knowledgeAssetService";
import { getDiscussionById } from "@/services/discussionService";
import { getReviewById, type AthenaReview } from "@/services/reviewService";
import { getExecutiveReasoning } from "@/services/brain/executiveReasoningService";
import { getExecutiveUnderstanding } from "@/services/brain/executiveUnderstandingService";
import type { ExecutiveInitiativeSelection } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import { isPersonaIntelligenceBridge } from "@/services/personas/personaBridgeMarker";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";

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
  initiativeSelection?: ExecutiveInitiativeSelection;
}): string {
  const intelligence = input.intelligence;
  const synthesis = intelligence?.executiveDecisionSynthesis;
  const initiative = input.initiativeSelection;
  if (!intelligence) {
    return "Executive learning captured without intelligence pipeline metadata.";
  }

  const decision = synthesis?.selectedDecision;

  return [
    "Executive Learning Metadata:",
    `Platform: ${input.discussionPlatform ?? "unknown"}`,
    `Hidden problem: ${intelligence.hiddenProblem.hiddenMarketProblem}`,
    `Buyer psychology: ${intelligence.buyerPsychology.coreFear ?? "n/a"}`,
    initiative
      ? `Executive initiative: ${initiative.selectedInitiative.initiativeLabel} (${initiative.selectedInitiative.initiativeCategory}, confidence ${initiative.selectedInitiative.strategicConfidence})`
      : decision
        ? `Executive decision: ${decision.chosenStrategyLabel} (confidence ${decision.strategicConfidence})`
        : `Strategic asset: ${intelligence.assetStrategy.selectedAssetType}`,
    initiative
      ? `Business objective: ${initiative.selectedInitiative.expectedBusinessOutcome}`
      : decision
        ? `Business objective: ${decision.expectedBusinessOutcome}`
        : `Business outcome: ${intelligence.executiveRecommendation.expectedBusinessOutcome}`,
    initiative
      ? `Implementation approach: ${initiative.implementationStrategy.deploymentApproach}`
      : decision
        ? `Deployment approach: ${decision.deploymentApproach}`
        : "",
    initiative
      ? `Why this initiative: ${initiative.selectedInitiative.whyThisInitiative.slice(0, 240)}`
      : decision
        ? `Why this strategy: ${decision.whyThisStrategy.slice(0, 240)}`
        : "",
    initiative
      ? `Rejected initiatives: ${initiative.eliminated
          .slice(0, 3)
          .map((entry) => entry.candidate.label)
          .join(", ") || "none"}`
      : synthesis
        ? `Rejected strategies: ${synthesis.eliminated
            .slice(0, 3)
            .map((entry) => entry.candidate.deliverable)
            .join(", ") || "none"}`
        : "",
    initiative
      ? `Reasoning path: understanding → initiative candidates → decision matrix → elimination → executive initiative → implementation → generation`
      : `Reasoning path: reflection → possibilities → evaluation → elimination → executive decision → generation`,
    initiative
      ? `Business-before-content: ${initiative.businessBeforeContent.businessChangeOutperformsContent}`
      : "",
    `Contrarian insight: ${intelligence.contrarianThinking.assumptionChallenge}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function learnFromApprovedBriefing(
  reviewId: string,
  organizationId: string,
) {
  try {
    const review = await getReviewById(reviewId, organizationId);

    if (!review) {
      console.error(`Cannot learn from missing briefing/review: ${reviewId}`);
      return {
        learned: false,
        reason: "Approved briefing not found for learning.",
      };
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

    if (isProspectIntelligenceBridge(discussion)) {
      return {
        learned: false,
        reason:
          "Prospect Intelligence sources do not emit Discussion learning signals.",
      };
    }

    if (isPersonaIntelligenceBridge(discussion)) {
      return {
        learned: false,
        reason:
          "Persona Intelligence sources do not emit Discussion learning signals.",
      };
    }

    let executiveIntelligence:
      | Awaited<ReturnType<typeof getExecutiveReasoning>>["executiveIntelligence"]
      | undefined;
    let initiativeSelection: ExecutiveInitiativeSelection | undefined;
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

    try {
      const understanding = await getExecutiveUnderstanding({
        organizationId,
        discussionId: review.discussion_id ?? undefined,
        opportunityId: review.opportunity_id ?? undefined,
        briefingId: review.id,
      });
      initiativeSelection = understanding?.executiveInitiativeSelection;
    } catch {
      initiativeSelection = undefined;
    }

    const executiveLearningNotes = buildExecutiveLearningNotes({
      review,
      discussionPlatform: discussion?.platform ?? null,
      intelligence: executiveIntelligence,
      initiativeSelection,
    });

    const knowledgeAsset = await createKnowledgeAsset({
      organization_id: organizationId,
      title,
      category: "Institutional Knowledge",
      asset_type: "approved_briefing",
      summary: review.summary ?? null,
      content,
      community_id: discussion?.community_id ?? null,
      source_type: "athena_reviews",
      source_id: review.id,
      rating: review.confidence
        ? Math.max(1, Math.min(5, Math.round(review.confidence / 20)))
        : null,
      tags: inferTags(
        review,
        executiveIntelligence || initiativeSelection ? ["executive-learning"] : undefined,
      ),
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
  } catch (error) {
    console.error("Brain learning from approved briefing failed:", error);
    return {
      learned: false,
      reason:
        error instanceof Error ? error.message : "Brain learning failed unexpectedly.",
    };
  }
}
