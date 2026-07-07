import { NextResponse } from "next/server";
import { generateReview } from "@/services/aiService";
import { getCommunityById } from "@/services/communityService";
import { createCommunityIntelligence } from "@/services/communityIntelligenceService";
import { getRecentDiscussionAnalysesByCommunityId } from "@/services/discussionAnalysisService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  buildCommunityIntelligencePrompt,
  COMMUNITY_INTELLIGENCE_PROMPT_VERSION,
} from "@/services/ai/prompts/communityIntelligencePrompt";
import { ELEVATE_STRATEGY_PROMPT_VERSION } from "@/services/ai/prompts/elevateStrategyPrompt";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type GeneratedCommunityIntelligence = {
  executive_summary: string;
  market_trends: string;
  recurring_pain_points: string;
  recurring_objections: string;
  recurring_questions: string;
  buyer_stage_distribution: string;
  high_value_opportunities: string;
  recommended_campaigns: string;
  recommended_content: string;
  recommended_lead_magnets: string;
  recommended_webinars: string;
  strategic_recommendations: string;
  confidence: number;
};

function parseCommunityIntelligence(rawText: string): GeneratedCommunityIntelligence {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    executive_summary: String(parsed.executive_summary ?? ""),
    market_trends: String(parsed.market_trends ?? ""),
    recurring_pain_points: String(parsed.recurring_pain_points ?? ""),
    recurring_objections: String(parsed.recurring_objections ?? ""),
    recurring_questions: String(parsed.recurring_questions ?? ""),
    buyer_stage_distribution: String(parsed.buyer_stage_distribution ?? ""),
    high_value_opportunities: String(parsed.high_value_opportunities ?? ""),
    recommended_campaigns: String(parsed.recommended_campaigns ?? ""),
    recommended_content: String(parsed.recommended_content ?? ""),
    recommended_lead_magnets: String(parsed.recommended_lead_magnets ?? ""),
    recommended_webinars: String(parsed.recommended_webinars ?? ""),
    strategic_recommendations: String(parsed.strategic_recommendations ?? ""),
    confidence: Number(parsed.confidence ?? 0),
  };
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const startedAt = Date.now();
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const community = await getCommunityById(id, organizationId);

    if (!community) {
      return NextResponse.json(
        { success: false, error: "Community not found" },
        { status: 404 },
      );
    }

    const analyses = await getRecentDiscussionAnalysesByCommunityId(
      id,
      organizationId,
      100,
    );

    if (analyses.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No discussion analyses found for this community",
        },
        { status: 400 },
      );
    }

    const prompt = buildCommunityIntelligencePrompt({
      community,
      analyses,
    });

    const rawIntelligence = await generateReview(prompt);
    const parsedIntelligence = parseCommunityIntelligence(rawIntelligence);
    const generationTimeMs = Date.now() - startedAt;

    const savedIntelligence = await createCommunityIntelligence({
      organization_id: organizationId,
      community_id: id,
      status: "draft",

      executive_summary: parsedIntelligence.executive_summary,
      market_trends: parsedIntelligence.market_trends,
      recurring_pain_points: parsedIntelligence.recurring_pain_points,
      recurring_objections: parsedIntelligence.recurring_objections,
      recurring_questions: parsedIntelligence.recurring_questions,
      buyer_stage_distribution: parsedIntelligence.buyer_stage_distribution,
      high_value_opportunities: parsedIntelligence.high_value_opportunities,
      recommended_campaigns: parsedIntelligence.recommended_campaigns,
      recommended_content: parsedIntelligence.recommended_content,
      recommended_lead_magnets: parsedIntelligence.recommended_lead_magnets,
      recommended_webinars: parsedIntelligence.recommended_webinars,
      strategic_recommendations: parsedIntelligence.strategic_recommendations,
      confidence: parsedIntelligence.confidence,

      strategy_prompt_version: ELEVATE_STRATEGY_PROMPT_VERSION,
      analysis_prompt_version: COMMUNITY_INTELLIGENCE_PROMPT_VERSION,
      model: process.env.OPENROUTER_MODEL ?? null,
      generation_time_ms: generationTimeMs,

      raw_json: {
        community,
        analyses,
        raw_ai_response: rawIntelligence,
        parsed_intelligence: parsedIntelligence,
      },
    });

    if (!savedIntelligence) {
      return NextResponse.json(
        { success: false, error: "Community intelligence generated but not saved" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      communityId: id,
      intelligence: savedIntelligence,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Athena community intelligence failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to generate community intelligence" },
      { status: 500 },
    );
  }
}
