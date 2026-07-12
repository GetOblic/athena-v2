import { NextResponse } from "next/server";
import { generateReview, resolveModelForGenerationKind } from "@/services/aiService";
import { getCommunityById } from "@/services/communityService";
import { getLatestCommunityIntelligenceByCommunityId } from "@/services/communityIntelligenceService";
import { createProductionIntelligence } from "@/services/productionIntelligenceService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  buildProductionIntelligencePrompt,
  PRODUCTION_INTELLIGENCE_PROMPT_VERSION,
} from "@/services/ai/prompts/productionIntelligencePrompt";
import { ELEVATE_STRATEGY_PROMPT_VERSION } from "@/services/ai/prompts/elevateStrategyPrompt";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RecommendedAsset = {
  asset_type: string;
  title: string;
  post_text: string;
  creative_brief: string;
  cta: string;
  reason: string;
};

type GeneratedProductionIntelligence = {
  content_theme: string;
  target_audience: string;
  buyer_stage: string;
  core_pain_point: string;
  strategic_reason: string;
  recommended_assets: RecommendedAsset[];
  priority: number;
  confidence: number;
};

function parseProductionIntelligence(rawText: string): GeneratedProductionIntelligence {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    content_theme: String(parsed.content_theme ?? ""),
    target_audience: String(parsed.target_audience ?? ""),
    buyer_stage: String(parsed.buyer_stage ?? ""),
    core_pain_point: String(parsed.core_pain_point ?? ""),
    strategic_reason: String(parsed.strategic_reason ?? ""),
    recommended_assets: Array.isArray(parsed.recommended_assets)
      ? parsed.recommended_assets
      : [],
    priority: Number(parsed.priority ?? 0),
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

    const intelligence =
      await getLatestCommunityIntelligenceByCommunityId(id, organizationId);

    if (!intelligence) {
      return NextResponse.json(
        {
          success: false,
          error: "No community intelligence found. Generate Community Intelligence first.",
        },
        { status: 400 },
      );
    }

    const prompt = buildProductionIntelligencePrompt({
      community,
      intelligence,
    });

    const rawProductionIntelligence = await generateReview(prompt, {
      stage: "production_intelligence",
      promptSource: "app/api/communities/[id]/production-intelligence/route.ts",
      generationKind: "production_intelligence",
    });
    const parsedProductionIntelligence = parseProductionIntelligence(
      rawProductionIntelligence,
    );
    const generationTimeMs = Date.now() - startedAt;

    const savedProductionIntelligence = await createProductionIntelligence({
      organization_id: organizationId,
      community_id: id,
      source_intelligence_id: intelligence.id,

      status: "draft",

      content_theme: parsedProductionIntelligence.content_theme,
      target_audience: parsedProductionIntelligence.target_audience,
      buyer_stage: parsedProductionIntelligence.buyer_stage,
      core_pain_point: parsedProductionIntelligence.core_pain_point,
      strategic_reason: parsedProductionIntelligence.strategic_reason,

      recommended_assets: {
        assets: parsedProductionIntelligence.recommended_assets,
      },

      priority: parsedProductionIntelligence.priority,
      confidence: parsedProductionIntelligence.confidence,

      strategy_prompt_version: ELEVATE_STRATEGY_PROMPT_VERSION,
      content_prompt_version: PRODUCTION_INTELLIGENCE_PROMPT_VERSION,
      model: resolveModelForGenerationKind("production_intelligence").model,
      generation_time_ms: generationTimeMs,

      raw_json: {
        community,
        source_intelligence: intelligence,
        raw_ai_response: rawProductionIntelligence,
        parsed_content_intelligence: parsedProductionIntelligence,
      },
    });

    if (!savedProductionIntelligence) {
      return NextResponse.json(
        {
          success: false,
          error: "Content Intelligence generated but not saved",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      communityId: id,
      productionIntelligence: savedProductionIntelligence,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Athena content intelligence failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to generate Content Intelligence" },
      { status: 500 },
    );
  }
}
