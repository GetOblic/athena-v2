/**
 * Partial asset-family refresh: Deployment Assets (Gemini) or Strategic Blueprint (Claude).
 * Carry-forward base is the latest published Executive Version snapshot.
 */

import { resolveGenerationBundle } from "@/services/brain/generationContractService";
import {
  createAssetBlueprintForBriefing,
  createAssetBlueprintForDiscussionAnalysis,
} from "@/services/assetBlueprints/assetBlueprintService";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import {
  createPartialRefreshPublicationOptions,
  getCurrentExecutiveVersion,
  publishPartialRefreshExecutiveVersion,
} from "@/services/executiveVersions/executiveVersionService";
import type { ExecutiveIntelligencePayload } from "@/services/executiveVersions/executiveVersionTypes";
import type { AthenaPartialRefreshTriggerType } from "@/services/generationJobs/generationJobTypes";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";
import {
  generateDeploymentAssets,
  persistDeploymentAssets,
} from "@/services/workflows/deploymentAssetsWorkflow";
import type { DiscussionEndToEndResult } from "@/services/workflows/discussionWorkflow";
import {
  IncompleteProspectDeploymentAssetsError,
  logProspectDeploymentAssetStability,
  validateProspectDeploymentAssetPayload,
} from "@/lib/prospectDeploymentAssetContract";
import { ProspectLinkedInLengthContractError } from "@/lib/prospectLinkedInAssetRepair";

function failure(
  discussionId: string,
  error: string,
): DiscussionEndToEndResult {
  return {
    success: false,
    error,
    discussionId,
    blueprintGenerated: false,
  };
}

function analysisFromSourceForPrompt(
  source: ExecutiveIntelligencePayload,
  liveAnalysis: NonNullable<
    Awaited<ReturnType<typeof getLatestDiscussionAnalysis>>
  >,
) {
  // Prompt context uses live row identity with advisory fields from the EV snapshot.
  return {
    ...liveAnalysis,
    summary: source.analysis.summary,
    sentiment: source.analysis.sentiment,
    intent: source.analysis.intent,
    buyer_stage: source.analysis.buyer_stage,
    pain_points: source.analysis.pain_points,
    opportunity_detected: source.analysis.opportunity_detected,
    opportunity_title: source.analysis.opportunity_title,
    opportunity_reason: source.analysis.opportunity_reason,
    recommended_action: source.analysis.recommended_action,
    risk_level: source.analysis.risk_level,
    confidence: source.analysis.confidence,
    suggested_cta: source.analysis.suggested_cta,
    raw_json: source.analysis.raw_json,
  };
}

export async function processPartialAssetRefresh(input: {
  discussionId: string;
  organizationId: string;
  triggerType: AthenaPartialRefreshTriggerType;
  regenerationRunId: string;
}): Promise<DiscussionEndToEndResult> {
  const startedAt = Date.now();
  const discussion = await getDiscussionById(
    input.discussionId,
    input.organizationId,
  );
  if (!discussion) {
    return failure(input.discussionId, "Discussion not found.");
  }

  const isProspect = isProspectIntelligenceBridge(discussion);
  const sourceVersion = await getCurrentExecutiveVersion(
    input.discussionId,
    input.organizationId,
  );
  if (!sourceVersion?.intelligence?.analysis) {
    return failure(
      input.discussionId,
      "No published Executive Version available for carry-forward.",
    );
  }

  const sourceIntel = sourceVersion.intelligence;

  if (input.triggerType === "deployment_assets_refresh") {
    return runDeploymentPartialRefresh({
      discussion,
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
      sourceVersion,
      sourceIntel,
      isProspect,
      startedAt,
    });
  }

  return runStrategicPartialRefresh({
    discussion,
    discussionId: input.discussionId,
    organizationId: input.organizationId,
    regenerationRunId: input.regenerationRunId,
    sourceVersion,
    sourceIntel,
    isProspect,
    startedAt,
  });
}

async function runDeploymentPartialRefresh(input: {
  discussion: NonNullable<Awaited<ReturnType<typeof getDiscussionById>>>;
  discussionId: string;
  organizationId: string;
  regenerationRunId: string;
  sourceVersion: NonNullable<
    Awaited<ReturnType<typeof getCurrentExecutiveVersion>>
  >;
  sourceIntel: ExecutiveIntelligencePayload;
  isProspect: boolean;
  startedAt: number;
}): Promise<DiscussionEndToEndResult> {
  const liveAnalysis = await getLatestDiscussionAnalysis(
    input.discussionId,
    input.organizationId,
  );
  if (!liveAnalysis || liveAnalysis.id !== input.sourceIntel.analysis.id) {
    return failure(
      input.discussionId,
      "Live analysis does not match the published Executive Version.",
    );
  }

  const liveOpportunity = await getOpportunityByDiscussionId(
    input.discussionId,
    input.organizationId,
  );
  const liveBriefing =
    liveOpportunity &&
    input.sourceIntel.opportunity &&
    liveOpportunity.id === input.sourceIntel.opportunity.id
      ? await getLatestReviewByOpportunityId(
          liveOpportunity.id,
          input.organizationId,
        )
      : null;

  const promptAnalysis = analysisFromSourceForPrompt(
    input.sourceIntel,
    liveAnalysis,
  );

  try {
    const { assets, rawResponse, model } = await generateDeploymentAssets({
      discussion: input.discussion,
      analysis: promptAnalysis,
      opportunity: liveOpportunity ?? undefined,
      briefing: liveBriefing ?? undefined,
      regenerationRunId: input.regenerationRunId,
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      explicitRegeneration: true,
      triggerType: "deployment_assets_refresh",
    });

    const persisted = await persistDeploymentAssets({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      analysis: liveAnalysis,
      opportunity: liveOpportunity ?? undefined,
      review: liveBriefing ?? undefined,
      assets,
      rawResponse,
      model,
      regenerationRunId: input.regenerationRunId,
    });

    const validation = validateProspectDeploymentAssetPayload(
      persisted.analysis.suggested_cta,
    );
    if (input.isProspect && !validation.isComplete) {
      if (
        validation.failureReason === "linkedin_asset_exceeds_200_characters"
      ) {
        throw new ProspectLinkedInLengthContractError(
          "Prospect LinkedIn Deployment Assets exceed the 200-character limit after repair.",
        );
      }
      throw new IncompleteProspectDeploymentAssetsError(
        "Prospect Deployment Assets incomplete.",
        {
          rawCharacterCount: validation.rawCharacterCount,
          unwrappedCharacterCount: validation.unwrappedCharacterCount,
          parsedAssetCount: validation.parsedKeys.length,
          parsedCanonicalKeys: validation.parsedKeys,
          missingCanonicalKeys: validation.missingKeys,
          validationResult: validation.isComplete
            ? "complete"
            : validation.parsedKeys.length === 0
              ? "invalid"
              : "incomplete",
          failureReason: validation.failureReason,
        },
      );
    }

    if (!input.sourceIntel.blueprint?.id && input.isProspect) {
      return failure(
        input.discussionId,
        "Carried Strategic Blueprint is missing; cannot publish Prospect Deployment refresh.",
      );
    }

    const assembled: ExecutiveIntelligencePayload = {
      analysis: {
        ...input.sourceIntel.analysis,
        suggested_cta: persisted.analysis.suggested_cta,
        raw_json: persisted.analysis.raw_json,
        updated_at: persisted.analysis.updated_at,
      },
      opportunity: input.sourceIntel.opportunity
        ? {
            ...input.sourceIntel.opportunity,
            suggested_cta:
              persisted.opportunity?.suggested_cta ??
              input.sourceIntel.opportunity.suggested_cta,
            updated_at:
              persisted.opportunity?.updated_at ??
              input.sourceIntel.opportunity.updated_at,
          }
        : null,
      briefing: input.sourceIntel.briefing
        ? {
            ...input.sourceIntel.briefing,
            recommended_response:
              persisted.review?.recommended_response ??
              input.sourceIntel.briefing.recommended_response,
            cta: persisted.review?.cta ?? input.sourceIntel.briefing.cta,
            updated_at:
              persisted.review?.updated_at ??
              input.sourceIntel.briefing.updated_at,
          }
        : null,
      blueprint: input.sourceIntel.blueprint,
    };

    const published = await publishPartialRefreshExecutiveVersion(
      createPartialRefreshPublicationOptions({
        sourceExecutiveVersion: input.sourceVersion,
        assembledIntelligence: assembled,
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        regenerationRunId: input.regenerationRunId,
        generationDurationMs: Date.now() - input.startedAt,
        requireProspectCompleteness: input.isProspect,
      }),
    );

    logProspectDeploymentAssetStability("executive_version_published", {
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
      executiveVersionId: published.id,
      blueprintId: published.blueprint_id,
      triggerType: "deployment_assets_refresh",
    });

    return {
      success: true,
      discussionId: input.discussionId,
      analysisId: assembled.analysis.id,
      opportunityId: assembled.opportunity?.id ?? null,
      reviewId: assembled.briefing?.id ?? null,
      blueprintId: assembled.blueprint?.id ?? null,
      blueprintGenerated: false,
      status: "deployment_assets_refresh_completed",
      publishedVersionId: published.id,
    };
  } catch (error) {
    console.error("[PARTIAL_REFRESH] deployment_assets_refresh failed", error);
    if (
      error instanceof IncompleteProspectDeploymentAssetsError ||
      error instanceof ProspectLinkedInLengthContractError
    ) {
      return failure(input.discussionId, error.message);
    }
    return failure(
      input.discussionId,
      error instanceof Error
        ? error.message
        : "Deployment Assets refresh failed.",
    );
  }
}

async function runStrategicPartialRefresh(input: {
  discussion: NonNullable<Awaited<ReturnType<typeof getDiscussionById>>>;
  discussionId: string;
  organizationId: string;
  regenerationRunId: string;
  sourceVersion: NonNullable<
    Awaited<ReturnType<typeof getCurrentExecutiveVersion>>
  >;
  sourceIntel: ExecutiveIntelligencePayload;
  isProspect: boolean;
  startedAt: number;
}): Promise<DiscussionEndToEndResult> {
  const carriedCta = input.sourceIntel.analysis.suggested_cta ?? "";
  if (input.isProspect) {
    const validation = validateProspectDeploymentAssetPayload(carriedCta);
    if (!validation.isComplete) {
      return failure(
        input.discussionId,
        "Carried Deployment Assets are incomplete; cannot publish Strategic refresh.",
      );
    }
  }

  const liveAnalysis = await getLatestDiscussionAnalysis(
    input.discussionId,
    input.organizationId,
  );
  if (!liveAnalysis || liveAnalysis.id !== input.sourceIntel.analysis.id) {
    return failure(
      input.discussionId,
      "Live analysis does not match the published Executive Version.",
    );
  }

  const promptAnalysis = analysisFromSourceForPrompt(
    input.sourceIntel,
    liveAnalysis,
  );

  const liveOpportunity =
    input.sourceIntel.opportunity != null
      ? await getOpportunityByDiscussionId(
          input.discussionId,
          input.organizationId,
        )
      : null;
  const liveBriefing =
    liveOpportunity && input.sourceIntel.briefing
      ? await getLatestReviewByOpportunityId(
          liveOpportunity.id,
          input.organizationId,
        )
      : null;

  try {
    let blueprintOutcome;
    if (liveOpportunity && liveBriefing) {
      const bundle = await resolveGenerationBundle({
        workflowType: "strategic_blueprint",
        organizationId: input.organizationId,
        discussionId: input.discussionId,
        opportunityId: liveOpportunity.id,
        briefingId: liveBriefing.id,
        bypassCache: true,
      }).catch(() => null);

      blueprintOutcome = await createAssetBlueprintForBriefing({
        discussion: input.discussion,
        opportunity: liveOpportunity,
        briefing: liveBriefing,
        generationBundle: bundle ?? undefined,
        regenerationRunId: input.regenerationRunId,
        explicitRegeneration: true,
      });
    } else {
      const bundle = await resolveGenerationBundle({
        workflowType: "strategic_blueprint",
        organizationId: input.organizationId,
        discussionId: input.discussionId,
        bypassCache: true,
      }).catch(() => null);

      blueprintOutcome = await createAssetBlueprintForDiscussionAnalysis({
        discussion: input.discussion,
        analysis: promptAnalysis,
        generationBundle: bundle ?? undefined,
        regenerationRunId: input.regenerationRunId,
        explicitRegeneration: true,
      });
    }

    if (
      !blueprintOutcome.blueprintGenerated ||
      !blueprintOutcome.blueprint?.id ||
      blueprintOutcome.preservedPrevious ||
      blueprintOutcome.fallbackUsed
    ) {
      return failure(
        input.discussionId,
        blueprintOutcome.blueprintError ??
          "Strategic Blueprint regeneration failed.",
      );
    }

    const assembled: ExecutiveIntelligencePayload = {
      analysis: input.sourceIntel.analysis,
      opportunity: input.sourceIntel.opportunity,
      briefing: input.sourceIntel.briefing,
      blueprint: blueprintOutcome.blueprint,
    };

    const published = await publishPartialRefreshExecutiveVersion(
      createPartialRefreshPublicationOptions({
        sourceExecutiveVersion: input.sourceVersion,
        assembledIntelligence: assembled,
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        regenerationRunId: input.regenerationRunId,
        generationDurationMs: Date.now() - input.startedAt,
        requireProspectCompleteness: input.isProspect,
      }),
    );

    logProspectDeploymentAssetStability("executive_version_published", {
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
      executiveVersionId: published.id,
      blueprintId: published.blueprint_id,
      triggerType: "strategic_assets_refresh",
    });

    return {
      success: true,
      discussionId: input.discussionId,
      analysisId: assembled.analysis.id,
      opportunityId: assembled.opportunity?.id ?? null,
      reviewId: assembled.briefing?.id ?? null,
      blueprintId: assembled.blueprint?.id ?? null,
      blueprintGenerated: true,
      status: "strategic_assets_refresh_completed",
      publishedVersionId: published.id,
    };
  } catch (error) {
    console.error("[PARTIAL_REFRESH] strategic_assets_refresh failed", error);
    return failure(
      input.discussionId,
      error instanceof Error
        ? error.message
        : "Strategic Assets refresh failed.",
    );
  }
}
