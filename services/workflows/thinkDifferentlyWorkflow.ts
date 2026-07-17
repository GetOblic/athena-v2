/**
 * Think Differently — Deployment-coherent partial pipeline.
 *
 * Existing Analysis + Opportunity + Briefing (unchanged)
 * → new Strategic Blueprint (think_differently)
 * → new Deployment Assets from that blueprint (think_differently)
 * → new Executive Intelligence Version (forceNewVersion)
 *
 * Does NOT call processDiscussionEndToEnd or regenerate upstream intelligence.
 */

import { createRegenerationRunId } from "@/lib/regenerationDiagnostics";
import {
  createAssetBlueprintForBriefing,
  createAssetBlueprintForDiscussionAnalysis,
  type AthenaAssetBlueprint,
} from "@/services/assetBlueprints/assetBlueprintService";
import { resolveGenerationBundle } from "@/services/brain/generationContractService";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import { publishExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import {
  generateDeploymentAssets,
  persistDeploymentAssets,
} from "@/services/workflows/deploymentAssetsWorkflow";

async function resolveThinkDifferentlyBlueprintBundle(input: {
  organizationId: string;
  discussionId: string;
  opportunityId?: string | null;
  briefingId?: string | null;
}): Promise<GenerationBundle | undefined> {
  try {
    const bundle = await resolveGenerationBundle({
      workflowType: "strategic_blueprint",
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      opportunityId: input.opportunityId ?? undefined,
      briefingId: input.briefingId ?? undefined,
      bypassCache: true,
    });
    return bundle ?? undefined;
  } catch (error) {
    console.error(
      "[thinkDifferentlyWorkflow] blueprint generation bundle unavailable:",
      error,
    );
    return undefined;
  }
}

export type ThinkDifferentlyWorkflowResult = {
  success: boolean;
  publishedVersionId?: string | null;
  blueprintId?: string | null;
  analysisId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  error?: string;
  status?: string;
};

function blueprintToPromptRecord(
  blueprint: AthenaAssetBlueprint,
): Record<string, unknown> {
  return {
    id: blueprint.id,
    discussion_id: blueprint.discussion_id,
    opportunity_id: blueprint.opportunity_id,
    briefing_id: blueprint.briefing_id,
    image_prompt: blueprint.image_prompt,
    social_prompt: blueprint.social_prompt,
    pdf_prompt: blueprint.pdf_prompt,
    asset_title: blueprint.asset_title,
    asset_type: blueprint.asset_type,
    business_goal: blueprint.business_goal,
    target_audience: blueprint.target_audience,
    priority: blueprint.priority,
    estimated_reuse: blueprint.estimated_reuse,
    notes: blueprint.notes,
    raw_json: blueprint.raw_json,
  };
}

export async function processThinkDifferentlyWorkflow(input: {
  discussionId: string;
  organizationId: string;
  regenerationRunId?: string | null;
}): Promise<ThinkDifferentlyWorkflowResult> {
  const regenerationRunId =
    input.regenerationRunId?.trim() || createRegenerationRunId();
  const startedAt = Date.now();

  try {
    const discussion = await getDiscussionById(
      input.discussionId,
      input.organizationId,
    );
    if (!discussion) {
      return {
        success: false,
        error: "Discussion not found.",
        status: "not_found",
      };
    }

    const analysis = await getLatestDiscussionAnalysis(
      input.discussionId,
      input.organizationId,
    );
    if (!analysis) {
      return {
        success: false,
        error:
          "Think Differently requires existing Discussion Analysis. Run Generate Intelligence first.",
        status: "missing_analysis",
      };
    }

    const opportunity = await getOpportunityByDiscussionId(
      input.discussionId,
      input.organizationId,
    );
    const briefing = opportunity
      ? await getLatestReviewByOpportunityId(
          opportunity.id,
          input.organizationId,
        )
      : null;

    const generationBundle = await resolveThinkDifferentlyBlueprintBundle({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      opportunityId: opportunity?.id ?? null,
      briefingId: briefing?.id ?? null,
    });

    // 1) Generate + persist new Strategic Blueprint (think_differently).
    const blueprintOutcome =
      opportunity && briefing
        ? await createAssetBlueprintForBriefing({
            discussion,
            opportunity,
            briefing,
            generationBundle,
            regenerationRunId,
            explicitRegeneration: true,
            generationMode: "think_differently",
          })
        : await createAssetBlueprintForDiscussionAnalysis({
            discussion,
            analysis,
            generationBundle,
            regenerationRunId,
            explicitRegeneration: true,
            generationMode: "think_differently",
          });

    if (!blueprintOutcome.blueprintGenerated || !blueprintOutcome.blueprint) {
      return {
        success: false,
        error:
          blueprintOutcome.blueprintError ??
          "Think Differently Strategic Blueprint generation failed.",
        status: "blueprint_failed",
        analysisId: analysis.id,
        opportunityId: opportunity?.id ?? null,
        reviewId: briefing?.id ?? null,
      };
    }

    const newBlueprint = blueprintOutcome.blueprint;
    const strategicBlueprintRecord = blueprintToPromptRecord(newBlueprint);

    // 2) Generate Deployment Assets from the NEW blueprint (in-memory), not the prior Standard blueprint.
    let generatedAssets;
    try {
      generatedAssets = await generateDeploymentAssets({
        discussion,
        analysis,
        opportunity,
        briefing,
        regenerationRunId,
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        explicitRegeneration: true,
        generationMode: "think_differently",
        strategicBlueprint: strategicBlueprintRecord,
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Think Differently Deployment Assets generation failed.",
        status: "deployment_assets_failed",
        blueprintId: newBlueprint.id,
        analysisId: analysis.id,
        opportunityId: opportunity?.id ?? null,
        reviewId: briefing?.id ?? null,
      };
    }

    // 3) Persist Deployment Assets only after successful generation/validation.
    const persisted = await persistDeploymentAssets({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      analysis,
      opportunity,
      review: briefing,
      assets: generatedAssets.assets,
      rawResponse: generatedAssets.rawResponse,
      model: generatedAssets.model,
      regenerationRunId,
      generationMode: "think_differently",
    });

    // 4) Publish new EV only after both stages succeed.
    const published = await publishExecutiveIntelligenceVersion({
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId,
      generationDurationMs: Date.now() - startedAt,
      analysisId: persisted.analysis.id,
      opportunityId: persisted.opportunity?.id ?? opportunity?.id ?? null,
      reviewId: persisted.review?.id ?? briefing?.id ?? null,
      blueprintId: newBlueprint.id,
      requireProspectCompleteness: isProspectIntelligenceBridge(discussion),
      forceNewVersion: true,
      generationMode: "think_differently",
    });

    if (!published) {
      return {
        success: false,
        error: "Think Differently version publication failed.",
        status: "publish_failed",
        blueprintId: newBlueprint.id,
        analysisId: persisted.analysis.id,
        opportunityId: persisted.opportunity?.id ?? null,
        reviewId: persisted.review?.id ?? null,
      };
    }

    return {
      success: true,
      publishedVersionId: published.id,
      blueprintId: newBlueprint.id,
      analysisId: persisted.analysis.id,
      opportunityId: persisted.opportunity?.id ?? null,
      reviewId: persisted.review?.id ?? null,
      status: "completed",
    };
  } catch (error) {
    console.error("[thinkDifferentlyWorkflow] failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Think Differently workflow failed.",
      status: "failed",
    };
  }
}
