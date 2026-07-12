import { NextResponse } from "next/server";
import { generateReview, resolveModelForGenerationKind } from "@/services/aiService";
import { getOpportunityById } from "@/services/opportunityService";
import { upsertReviewFromGeneration } from "@/services/reviewService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  assembleExecutiveBriefingPrompt,
  resolveGenerationBundle,
} from "@/services/brain/generationContractService";
import {
  buildOpportunityReviewPrompt,
  OPPORTUNITY_REVIEW_PROMPT_VERSION,
} from "@/services/ai/prompts/opportunityReviewPrompt";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type GeneratedReview = {
  summary: string;
  pain_points: string;
  buyer_stage: string;
  recommended_response: string;
  cta: string;
  confidence: number;
};

function parseGeneratedReview(rawText: string): GeneratedReview {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

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

export async function POST(_request: Request, context: RouteContext) {
  try {
    const startedAt = Date.now();
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const opportunity = await getOpportunityById(id, organizationId);

    if (!opportunity) {
      return NextResponse.json(
        { success: false, error: "Opportunity not found" },
        { status: 404 },
      );
    }

    const briefingBundle = await resolveGenerationBundle({
      workflowType: "executive_briefing",
      organizationId,
      discussionId: opportunity.discussion_id ?? undefined,
      opportunityId: id,
    });

    const prompt = briefingBundle
      ? assembleExecutiveBriefingPrompt({ bundle: briefingBundle, opportunity })
      : buildOpportunityReviewPrompt(opportunity);

    const rawReview = await generateReview(prompt, {
      stage: "opportunity_review",
      promptSource: "app/api/opportunities/[id]/review/route.ts",
      generationKind: "opportunity_review",
      athenaStage: "opportunity_generation",
    });
    const parsedReview = parseGeneratedReview(rawReview);
    const generationTimeMs = Date.now() - startedAt;

    const savedReview = await upsertReviewFromGeneration({
      organization_id: organizationId,
      opportunity_id: id,
      discussion_id: opportunity.discussion_id,
      status: "draft",

      summary: parsedReview.summary,
      pain_points: parsedReview.pain_points,
      buyer_stage: parsedReview.buyer_stage,
      recommended_response: parsedReview.recommended_response,
      cta: parsedReview.cta,
      confidence: parsedReview.confidence || opportunity.score || 0,

      model: resolveModelForGenerationKind("opportunity_review").model,
      prompt_version: OPPORTUNITY_REVIEW_PROMPT_VERSION,
      generation_time_ms: generationTimeMs,

      raw_json: {
        opportunity,
        raw_ai_response: rawReview,
        parsed_review: parsedReview,
      },
    });

    if (!savedReview) {
      return NextResponse.json(
        { success: false, error: "Executive Briefing generated but not saved" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      opportunityId: id,
      review: savedReview,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Athena opportunity review generation failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to generate opportunity review" },
      { status: 500 },
    );
  }
}
