import { NextResponse } from "next/server";
import { generateReview } from "@/services/aiService";
import {
  formatBrainContextForPrompt,
  getAthenaBrainContextForCurrentUser,
} from "@/services/brain/brainContextService";
import { getDiscussionById } from "@/services/discussionService";
import { createDiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  buildDiscussionAnalysisPrompt,
  DISCUSSION_ANALYSIS_PROMPT_VERSION,
} from "@/services/ai/prompts/discussionAnalysisPrompt";
import { ELEVATE_STRATEGY_PROMPT_VERSION } from "@/services/ai/prompts/elevateStrategyPrompt";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

function parseAnalysis(rawText: string): GeneratedDiscussionAnalysis {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

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

export async function POST(_request: Request, context: RouteContext) {
  try {
    const startedAt = Date.now();
    const { id } = await context.params;

    const discussion = await getDiscussionById(id);

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const brainContext = await getAthenaBrainContextForCurrentUser();
    const brainContextPrompt = formatBrainContextForPrompt(brainContext);

    const prompt = buildDiscussionAnalysisPrompt(
      discussion,
      brainContextPrompt,
    );
    const rawAnalysis = await generateReview(prompt);
    const parsedAnalysis = parseAnalysis(rawAnalysis);
    const generationTimeMs = Date.now() - startedAt;

    const savedAnalysis = await createDiscussionAnalysis({
      discussion_id: discussion.id,
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
      generation_time_ms: generationTimeMs,

      raw_json: {
        discussion,
        raw_ai_response: rawAnalysis,
        parsed_analysis: parsedAnalysis,
      },
    });

    return NextResponse.json({
      success: true,
      discussionId: id,
      analysis: savedAnalysis,
    });
  } catch (error) {
    console.error("Athena discussion analysis failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to analyze discussion" },
      { status: 500 },
    );
  }
}
