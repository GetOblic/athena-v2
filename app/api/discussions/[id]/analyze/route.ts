import { NextResponse } from "next/server";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  logRegenerationDiagnostic,
  hasBlueprintDebugMarker,
} from "@/lib/regenerationDiagnostics";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";
import { DISCUSSION_ANALYSIS_PROMPT_VERSION } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { ASSET_BLUEPRINT_PROMPT_VERSION } from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const existingAnalysis = await getLatestDiscussionAnalysis(id, organizationId);

    logRegenerationDiagnostic("REGENERATE STARTED", {
      discussionId: id,
      organizationId,
      existingAnalysisLoaded: Boolean(existingAnalysis),
      existingAnalysisId: existingAnalysis?.id ?? null,
      existingAnalysisCreatedAt: existingAnalysis?.created_at ?? null,
      existingAnalysisPromptVersion:
        existingAnalysis?.analysis_prompt_version ?? null,
      expectedAnalysisPromptVersion: DISCUSSION_ANALYSIS_PROMPT_VERSION,
      expectedBlueprintPromptVersion: ASSET_BLUEPRINT_PROMPT_VERSION,
    });

    const discussion = await getDiscussionById(id, organizationId);

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const result = await processDiscussionEndToEnd(id, organizationId);

    logRegenerationDiagnostic("REGENERATE COMPLETED", {
      discussionId: id,
      organizationId,
      model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
      status: result.status,
      previousAnalysisId: existingAnalysis?.id ?? null,
      newAnalysisId: result.analysis?.id ?? null,
      updatedAnalysisId: null,
      newAnalysisCreatedAt: result.analysis?.created_at ?? null,
      newAnalysisPromptVersion: result.analysis?.analysis_prompt_version ?? null,
      analysisWasNewInsert:
        Boolean(result.analysis?.id) &&
        result.analysis?.id !== existingAnalysis?.id,
      deploymentAssetsRegenerated: Boolean(
        result.analysis?.suggested_cta?.trim(),
      ),
      blueprintId: result.assetBlueprint?.id ?? null,
      blueprintAssetTitle: result.assetBlueprint?.asset_title ?? null,
      blueprintCreatedAt: result.assetBlueprint?.created_at ?? null,
      blueprintUpdatedAt: result.assetBlueprint?.updated_at ?? null,
      newBlueprintInserted:
        Boolean(result.assetBlueprint?.created_at) &&
        result.assetBlueprint?.created_at === result.assetBlueprint?.updated_at,
      fallbackBlueprintUsed: Boolean(
        result.assetBlueprint &&
          !hasBlueprintDebugMarker(result.assetBlueprint.notes),
      ),
      blueprintHasDebugMarker: hasBlueprintDebugMarker(
        result.assetBlueprint?.notes,
      ),
      blueprintPromptVersion:
        (result.assetBlueprint?.raw_json as { prompt_version?: string } | null)
          ?.prompt_version ?? null,
    });

    const payload = {
      success: true as const,
      discussionId: id,
      message: "Discussion intelligence regenerated successfully",
      analysis: result.analysis,
      opportunity: result.opportunity,
      review: result.review,
      assetBlueprint: result.assetBlueprint,
      status: result.status,
    };

    try {
      JSON.stringify(payload);
    } catch (serializeError) {
      console.error("Regenerate intelligence failed", serializeError);
      return NextResponse.json(
        {
          success: true,
          discussionId: id,
          message: "Discussion intelligence regenerated successfully",
          status: result.status,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Regenerate intelligence failed", error);
    logRegenerationDiagnostic("REGENERATE FAILED", {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Regeneration failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
