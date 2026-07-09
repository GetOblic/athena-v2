import { NextResponse } from "next/server";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  logRegenerationDiagnostic,
  hasBlueprintDebugMarker,
  RegenerationBlueprintError,
} from "@/lib/regenerationDiagnostics";
import {
  getReasoningProfileForGeneration,
  resolveReasoningAttachment,
} from "@/lib/reasoningProfiles";
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

    logRegenerationDiagnostic("REGENERATE START", {
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

    const fallbackUsed = Boolean(
      result.assetBlueprint &&
        !hasBlueprintDebugMarker(result.assetBlueprint.notes),
    );
    const generatedAt =
      result.assetBlueprint?.updated_at ??
      result.assetBlueprint?.created_at ??
      result.analysis?.created_at ??
      null;

    const model = process.env.OPENROUTER_MODEL ?? "";
    const analysisReasoning = resolveReasoningAttachment({
      model,
      profile: getReasoningProfileForGeneration("discussion_analysis"),
    });
    const briefingReasoning = resolveReasoningAttachment({
      model,
      profile: getReasoningProfileForGeneration("executive_briefing"),
    });
    const blueprintReasoning = resolveReasoningAttachment({
      model,
      profile: getReasoningProfileForGeneration("strategic_blueprint"),
    });

    logRegenerationDiagnostic("REGENERATE END", {
      discussionId: id,
      organizationId,
      model: model || "(OPENROUTER_MODEL not set)",
      status: result.status,
      previousAnalysisId: existingAnalysis?.id ?? null,
      analysisId: result.analysis?.id ?? null,
      analysisCreatedAt: result.analysis?.created_at ?? null,
      analysisWasNewInsert:
        Boolean(result.analysis?.id) &&
        result.analysis?.id !== existingAnalysis?.id,
      deploymentAssetsGenerated: Boolean(result.analysis?.suggested_cta?.trim()),
      blueprintId: result.assetBlueprint?.id ?? null,
      blueprintTitle: result.assetBlueprint?.asset_title ?? null,
      blueprintUpdatedAt: result.assetBlueprint?.updated_at ?? null,
      fallbackUsed,
      blueprintHasDebugMarker: hasBlueprintDebugMarker(
        result.assetBlueprint?.notes,
      ),
      regenerated: Boolean(result.assetBlueprint && !fallbackUsed),
      ...(process.env.NODE_ENV === "development"
        ? {
            llmCallsExecuted: true,
            reasoningProfiles: {
              discussion_analysis: {
                profile: getReasoningProfileForGeneration("discussion_analysis"),
                attached: analysisReasoning.attach,
                effort: analysisReasoning.effort,
              },
              executive_briefing: {
                profile: getReasoningProfileForGeneration("executive_briefing"),
                attached: briefingReasoning.attach,
                effort: briefingReasoning.effort,
              },
              strategic_blueprint: {
                profile: getReasoningProfileForGeneration("strategic_blueprint"),
                attached: blueprintReasoning.attach,
                effort: blueprintReasoning.effort,
              },
            },
            deploymentAssetOutputs: [
              "community_reply",
              "private_message",
              "social_post",
              "follow_up_reply",
              "cta",
            ],
          }
        : {}),
    });

    if (!result.analysis) {
      return NextResponse.json(
        {
          success: false,
          discussionId: id,
          regenerated: false,
          error: "Discussion analysis was not saved.",
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!result.assetBlueprint || fallbackUsed) {
      return NextResponse.json(
        {
          success: false,
          discussionId: id,
          regenerated: false,
          analysisId: result.analysis.id,
          blueprintId: result.assetBlueprint?.id ?? null,
          blueprintTitle: result.assetBlueprint?.asset_title ?? null,
          generatedAt,
          fallbackUsed,
          error: fallbackUsed
            ? "Strategic blueprint regeneration returned stale content instead of fresh LLM output."
            : "Strategic blueprint was not generated.",
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = {
      success: true as const,
      discussionId: id,
      regenerated: true,
      analysisId: result.analysis.id,
      blueprintId: result.assetBlueprint.id,
      blueprintTitle: result.assetBlueprint.asset_title,
      generatedAt,
      fallbackUsed: false,
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
          regenerated: true,
          analysisId: result.analysis.id,
          blueprintId: result.assetBlueprint.id,
          blueprintTitle: result.assetBlueprint.asset_title,
          generatedAt,
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
    logRegenerationDiagnostic("REGENERATE END", {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (error instanceof RegenerationBlueprintError) {
      return NextResponse.json(
        {
          success: false,
          regenerated: false,
          error: error.message,
          preservedBlueprintId: error.preservedBlueprintId ?? null,
          fallbackUsed: false,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: false,
        regenerated: false,
        error: error instanceof Error ? error.message : "Regeneration failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
