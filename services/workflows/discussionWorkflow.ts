import { generateReview } from "@/services/aiService";
import {
  createAssetBlueprintForBriefing,
  createAssetBlueprintForDiscussionAnalysis,
} from "@/services/assetBlueprints/assetBlueprintService";
import {
  formatBrainContextForPrompt,
  getAthenaBrainContextForCurrentUser,
  getAthenaBrainContextForUserId,
} from "@/services/brain/brainContextService";
import {
  buildDiscussionAnalysisPrompt,
  DISCUSSION_ANALYSIS_PROMPT_VERSION,
} from "@/services/ai/prompts/discussionAnalysisPrompt";
import {
  buildOpportunityReviewPrompt,
  OPPORTUNITY_REVIEW_PROMPT_VERSION,
} from "@/services/ai/prompts/opportunityReviewPrompt";
import { ELEVATE_STRATEGY_PROMPT_VERSION } from "@/services/ai/prompts/elevateStrategyPrompt";
import { createDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import { createOpportunity } from "@/services/opportunityService";
import { createReview } from "@/services/reviewService";

type GeneratedDiscussionAnalysis = {
  summary: string;
  sentiment: string;
  intent: string;
  buyer_stage: string;
  pain_points: string;
  opportunity_detected: boolean;
  opportunity_title: string;
  opportunity_reason: string;
  recommended_action: string;
  suggested_cta: string;
  risk_level: string;
  confidence: number;
};

type GeneratedReview = {
  summary: string;
  pain_points: string;
  buyer_stage: string;
  recommended_response: string;
  cta: string;
  confidence: number;
};

function stripJsonFence(rawText: string) {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseAnalysis(rawText: string): GeneratedDiscussionAnalysis {
  const parsed = JSON.parse(stripJsonFence(rawText));

  return {
    summary: String(parsed.summary ?? ""),
    sentiment: String(parsed.sentiment ?? "neutral"),
    intent: String(parsed.intent ?? "none"),
    buyer_stage: String(parsed.buyer_stage ?? "unaware"),
    pain_points: String(parsed.pain_points ?? ""),
    opportunity_detected: Boolean(parsed.opportunity_detected ?? false),
    opportunity_title: String(parsed.opportunity_title ?? ""),
    opportunity_reason: String(parsed.opportunity_reason ?? ""),
    recommended_action: String(parsed.recommended_action ?? ""),
    suggested_cta: String(parsed.suggested_cta ?? ""),
    risk_level: String(parsed.risk_level ?? "low"),
    confidence: Number(parsed.confidence ?? 0),
  };
}

function parseGeneratedReview(rawText: string): GeneratedReview {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));

    return {
      summary: String(parsed.summary ?? ""),
      pain_points: String(parsed.pain_points ?? ""),
      buyer_stage: String(parsed.buyer_stage ?? ""),
      recommended_response: String(parsed.recommended_response ?? ""),
      cta: String(parsed.cta ?? ""),
      confidence: Number(parsed.confidence ?? 0),
    };
  } catch {
    return {
      summary: rawText,
      pain_points: "",
      buyer_stage: "",
      recommended_response: "",
      cta: "",
      confidence: 0,
    };
  }
}

async function generateAssetBlueprint(input: {
  discussion: NonNullable<Awaited<ReturnType<typeof getDiscussionById>>>;
  analysis: Awaited<ReturnType<typeof createDiscussionAnalysis>>;
  opportunity?: Awaited<ReturnType<typeof createOpportunity>> | null;
  review?: Awaited<ReturnType<typeof createReview>> | null;
  brainContextPrompt: string;
}) {
  try {
    if (input.opportunity && input.review) {
      return await createAssetBlueprintForBriefing({
        discussion: input.discussion,
        opportunity: input.opportunity,
        briefing: input.review,
        brainContextPrompt: input.brainContextPrompt,
      });
    }

    return await createAssetBlueprintForDiscussionAnalysis({
      discussion: input.discussion,
      analysis: input.analysis,
      brainContextPrompt: input.brainContextPrompt,
    });
  } catch (error) {
    console.error("Asset blueprint generation failed:", error);
    return null;
  }
}

export async function processDiscussionEndToEnd(discussionId: string) {
  const startedAt = Date.now();
  const discussion = await getDiscussionById(discussionId);

  if (!discussion) {
    throw new Error(`Discussion not found: ${discussionId}`);
  }

  const brainContext = discussion.user_id
    ? await getAthenaBrainContextForUserId(discussion.user_id)
    : await getAthenaBrainContextForCurrentUser();

  const brainContextPrompt = formatBrainContextForPrompt(brainContext);

  const analysisPrompt = buildDiscussionAnalysisPrompt(
    discussion,
    brainContextPrompt,
  );

  const rawAnalysis = await generateReview(analysisPrompt);
  const parsedAnalysis = parseAnalysis(rawAnalysis);

  const analysis = await createDiscussionAnalysis({
    discussion_id: discussion.id,
    user_id: discussion.user_id ?? null,
    community_id: discussion.community_id,
    status: "draft",
    summary: parsedAnalysis.summary,
    sentiment: parsedAnalysis.sentiment,
    intent: parsedAnalysis.intent,
    buyer_stage: parsedAnalysis.buyer_stage,
    pain_points: parsedAnalysis.pain_points,
    opportunity_detected: parsedAnalysis.opportunity_detected,
    opportunity_title: parsedAnalysis.opportunity_title,
    opportunity_reason: parsedAnalysis.opportunity_reason,
    recommended_action: parsedAnalysis.recommended_action,
    suggested_cta: parsedAnalysis.suggested_cta,
    risk_level: parsedAnalysis.risk_level,
    confidence: parsedAnalysis.confidence,
    strategy_key: "elevate",
    strategy_prompt_version: ELEVATE_STRATEGY_PROMPT_VERSION,
    analysis_prompt_version: DISCUSSION_ANALYSIS_PROMPT_VERSION,
    model: process.env.OPENROUTER_MODEL ?? null,
    generation_time_ms: Date.now() - startedAt,
    raw_json: {
      discussion,
      raw_ai_response: rawAnalysis,
      parsed_analysis: parsedAnalysis,
      workflow: "discussion_end_to_end_v1",
    },
  });

  if (!parsedAnalysis.opportunity_detected) {
    const assetBlueprint = await generateAssetBlueprint({
      discussion,
      analysis,
      brainContextPrompt,
    });

    return {
      discussion,
      analysis,
      opportunity: null,
      review: null,
      assetBlueprint,
      status: "analysis_completed_no_opportunity",
    };
  }

  const opportunity = await createOpportunity({
    discussion_id: discussion.id,
    user_id: discussion.user_id ?? null,
    community_id: discussion.community_id,
    status: "draft",
    score: parsedAnalysis.confidence || discussion.opportunity_score || 0,
    urgency: parsedAnalysis.risk_level,
    intent: parsedAnalysis.intent,
    risk_level: parsedAnalysis.risk_level,
    title: parsedAnalysis.opportunity_title || discussion.title,
    reason: parsedAnalysis.opportunity_reason,
    recommended_action: parsedAnalysis.recommended_action,
    suggested_cta: parsedAnalysis.suggested_cta,
    ai_summary: parsedAnalysis.summary,
    ai_recommendation: parsedAnalysis.recommended_action,
    raw_json: {
      source_analysis_id: analysis.id,
      parsed_analysis: parsedAnalysis,
      workflow: "discussion_end_to_end_v1",
    },
  });

  if (!opportunity) {
    throw new Error("Analysis completed but opportunity was not saved.");
  }

  const reviewStartedAt = Date.now();
  const reviewPrompt = buildOpportunityReviewPrompt(opportunity);
  const rawReview = await generateReview(reviewPrompt);
  const parsedReview = parseGeneratedReview(rawReview);

  const review = await createReview({
    opportunity_id: opportunity.id,
    discussion_id: discussion.id,
    user_id: discussion.user_id ?? null,
    status: "draft",
    summary: parsedReview.summary,
    pain_points: parsedReview.pain_points,
    buyer_stage: parsedReview.buyer_stage,
    recommended_response: parsedReview.recommended_response,
    cta: parsedReview.cta,
    confidence: parsedReview.confidence || opportunity.score || 0,
    model: process.env.OPENROUTER_MODEL ?? null,
    prompt_version: OPPORTUNITY_REVIEW_PROMPT_VERSION,
    generation_time_ms: Date.now() - reviewStartedAt,
    raw_json: {
      opportunity,
      raw_ai_response: rawReview,
      parsed_review: parsedReview,
      workflow: "discussion_end_to_end_v1",
    },
  });

  if (!review) {
    throw new Error("Opportunity created but briefing/review was not saved.");
  }

  const assetBlueprint = await generateAssetBlueprint({
    discussion,
    analysis,
    opportunity,
    review,
    brainContextPrompt,
  });

  return {
    discussion,
    analysis,
    opportunity,
    review,
    assetBlueprint,
    status: "review_ready",
  };
}
