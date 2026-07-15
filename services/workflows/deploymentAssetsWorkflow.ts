import { generateReview, resolveModelForStage } from "@/services/aiService";
import type { Discussion } from "@/services/discussionService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import { updateDiscussionAnalysisDeploymentFields } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import { updateOpportunityFromAnalysis } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import { updateReviewFromGeneration } from "@/services/reviewService";
import {
  assembleDeploymentAssetsPrompt,
  resolveGenerationBundle,
} from "@/services/brain/generationContractService";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import {
  hashContent,
  logPersistedRegenerationOutput,
} from "@/lib/regenerationDiagnostics";
import {
  logProspectDeploymentAssetStability,
  toProspectDeploymentAssetDiagnostics,
  IncompleteProspectDeploymentAssetsError,
} from "@/lib/prospectDeploymentAssetContract";
import {
  finalizeProspectDeploymentAssetsWithLinkedInRepair,
  ProspectLinkedInLengthContractError,
  repairedLinkedInAssetsAreNonEmpty,
} from "@/lib/prospectLinkedInAssetRepair";
import {
  logDeploymentAssetPromptSanitization,
  sanitizeDeploymentAssetGenerationInput,
} from "@/lib/sanitizeDeploymentAssetGenerationInput";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";

export type GeneratedDeploymentAssets = {
  suggested_cta: string;
  recommended_response: string;
  cta: string;
};

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

/**
 * Discussion-compatible parser. For Prospect Intelligence, prefer
 * unwrapProspectDeploymentAssetResponse + completeness validation.
 */
export function parseDeploymentAssetsResponse(
  rawText: string,
): GeneratedDeploymentAssets {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText)) as Record<string, unknown>;
    const suggestedCta = String(parsed.suggested_cta ?? "").trim();
    const recommendedResponse = String(
      parsed.recommended_response ?? suggestedCta,
    ).trim();
    const cta = String(parsed.cta ?? "").trim();

    return {
      suggested_cta: suggestedCta,
      recommended_response: recommendedResponse,
      cta,
    };
  } catch {
    const trimmed = rawText.trim();
    return {
      suggested_cta: trimmed,
      recommended_response: trimmed,
      cta: "",
    };
  }
}

async function resolveDeploymentAssetsGenerationBundle(input: {
  organizationId: string;
  discussionId: string;
  opportunityId?: string;
  briefingId?: string;
}): Promise<GenerationBundle | null> {
  try {
    return await resolveGenerationBundle({
      workflowType: "deployment_asset",
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      opportunityId: input.opportunityId,
      briefingId: input.briefingId,
      bypassCache: true,
    });
  } catch (error) {
    console.error("Deployment assets generation contract unavailable:", error);
    return null;
  }
}

export async function generateDeploymentAssets(input: {
  discussion: Discussion;
  analysis: DiscussionAnalysis | Record<string, unknown>;
  opportunity?: Opportunity | null;
  briefing?: AthenaReview | null;
  regenerationRunId?: string;
  discussionId: string;
  organizationId: string;
  explicitRegeneration?: boolean;
  /** Optional durable-job trigger for sanitization diagnostics. */
  triggerType?: string | null;
}): Promise<{
  assets: GeneratedDeploymentAssets;
  rawResponse: string;
  model: string;
}> {
  const isProspect = isProspectIntelligenceBridge(input.discussion);

  // Always sanitize prompt inputs so prior generated copy cannot contaminate
  // Deployment Assets regeneration (partial refresh or full pipeline).
  const sanitized = sanitizeDeploymentAssetGenerationInput({
    analysis: input.analysis as Record<string, unknown>,
    opportunity: (input.opportunity ?? null) as Record<string, unknown> | null,
    briefing: (input.briefing ?? null) as Record<string, unknown> | null,
  });

  logDeploymentAssetPromptSanitization({
    sourceType: isProspect ? "prospect" : "discussion",
    discussionId: input.discussionId,
    organizationId: input.organizationId,
    triggerType: input.triggerType ?? null,
    regenerationRunId: input.regenerationRunId ?? null,
    removedFields: sanitized.removedFields,
  });

  const bundle = await resolveDeploymentAssetsGenerationBundle({
    organizationId: input.organizationId,
    discussionId: input.discussionId,
    opportunityId: input.opportunity?.id,
    briefingId: input.briefing?.id,
  });

  if (!bundle) {
    throw new Error("Deployment assets generation bundle unavailable.");
  }

  const prompt = assembleDeploymentAssetsPrompt({
    bundle,
    discussion: input.discussion,
    analysis: sanitized.analysis,
    opportunity: sanitized.opportunity ?? undefined,
    briefing: sanitized.briefing ?? undefined,
    regenerationRunId: input.regenerationRunId,
  });

  const rawResponse = await generateReview(prompt, {
    stage: "deployment_assets.generation",
    promptSource:
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts::assembleDeploymentAssetsPrompt",
    generationKind: input.opportunity ? "executive_briefing" : "discussion_analysis",
    athenaStage: "deployment_assets",
    regenerationRunId: input.regenerationRunId,
    discussionId: input.discussionId,
    explicitRegeneration: input.explicitRegeneration,
  });

  if (isProspect) {
    // Parse → structure validate → LinkedIn ≤200 repair → revalidate.
    const unwrapped = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: rawResponse,
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
      sourceType: "prospect",
    });
    const diagnostics = toProspectDeploymentAssetDiagnostics(unwrapped);

    logProspectDeploymentAssetStability("deployment_assets_unwrapped", {
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId ?? null,
      ...diagnostics,
    });

    if (!unwrapped.isComplete) {
      if (
        unwrapped.failureReason === "linkedin_asset_exceeds_200_characters"
      ) {
        throw new ProspectLinkedInLengthContractError(
          "Prospect LinkedIn Deployment Assets exceed the 200-character limit after repair.",
        );
      }
      throw new IncompleteProspectDeploymentAssetsError(
        unwrapped.failureReason === "incomplete_canonical_set"
          ? "Prospect Deployment Assets incomplete."
          : "Prospect Deployment Assets invalid or malformed.",
        diagnostics,
      );
    }

    if (!repairedLinkedInAssetsAreNonEmpty(unwrapped.suggestedCta)) {
      throw new ProspectLinkedInLengthContractError(
        "Prospect LinkedIn Deployment Assets are empty after length repair.",
      );
    }

    return {
      assets: {
        suggested_cta: unwrapped.suggestedCta,
        recommended_response: unwrapped.recommendedResponse,
        cta: unwrapped.cta,
      },
      rawResponse,
      model: resolveModelForStage("deployment_assets").model,
    };
  }

  return {
    assets: parseDeploymentAssetsResponse(rawResponse),
    rawResponse,
    model: resolveModelForStage("deployment_assets").model,
  };
}

export async function persistDeploymentAssets(input: {
  organizationId: string;
  discussionId: string;
  analysis: DiscussionAnalysis;
  opportunity?: Opportunity | null;
  review?: AthenaReview | null;
  assets: GeneratedDeploymentAssets;
  rawResponse: string;
  model: string;
  regenerationRunId?: string;
}): Promise<{
  analysis: DiscussionAnalysis;
  opportunity?: Opportunity | null;
  review?: AthenaReview | null;
}> {
  const analysisRawJson = {
    ...(input.analysis.raw_json ?? {}),
    deployment_assets: {
      model: input.model,
      raw_ai_response: input.rawResponse,
      regeneration_run_id: input.regenerationRunId ?? null,
      generated_at: new Date().toISOString(),
    },
  };

  const updatedAnalysis = await updateDiscussionAnalysisDeploymentFields(
    input.analysis.id,
    input.organizationId,
    {
      suggested_cta: input.assets.suggested_cta,
      raw_json: analysisRawJson,
    },
  );

  if (!updatedAnalysis) {
    throw new Error("Failed to persist deployment assets on analysis.");
  }

  logPersistedRegenerationOutput({
    regenerationRunId: input.regenerationRunId,
    discussionId: input.discussionId,
    organizationId: input.organizationId,
    stage: "deployment_assets",
    persistedHash: hashContent(updatedAnalysis.suggested_cta),
    recordId: updatedAnalysis.id,
  });

  let updatedOpportunity = input.opportunity ?? null;
  if (updatedOpportunity) {
    updatedOpportunity = await updateOpportunityFromAnalysis(
      updatedOpportunity.id,
      input.organizationId,
      {
        organization_id: input.organizationId,
        discussion_id: updatedOpportunity.discussion_id,
        community_id: updatedOpportunity.community_id,
        user_id: updatedOpportunity.user_id,
        status: updatedOpportunity.status,
        score: updatedOpportunity.score,
        urgency: updatedOpportunity.urgency,
        intent: updatedOpportunity.intent,
        risk_level: updatedOpportunity.risk_level,
        title: updatedOpportunity.title,
        reason: updatedOpportunity.reason,
        recommended_action: updatedOpportunity.recommended_action,
        suggested_cta: input.assets.suggested_cta,
        ai_summary: updatedOpportunity.ai_summary,
        ai_recommendation: updatedOpportunity.ai_recommendation,
        raw_json: updatedOpportunity.raw_json,
      },
      updatedOpportunity.status,
    );
  }

  let updatedReview = input.review ?? null;
  if (updatedReview) {
    updatedReview = await updateReviewFromGeneration(
      updatedReview.id,
      input.organizationId,
      {
        organization_id: input.organizationId,
        opportunity_id: updatedReview.opportunity_id,
        discussion_id: updatedReview.discussion_id,
        user_id: updatedReview.user_id,
        status: updatedReview.status,
        summary: updatedReview.summary,
        pain_points: updatedReview.pain_points,
        buyer_stage: updatedReview.buyer_stage,
        recommended_response: input.assets.recommended_response,
        cta: input.assets.cta,
        confidence: updatedReview.confidence,
        model: updatedReview.model,
        prompt_version: updatedReview.prompt_version,
        generation_time_ms: updatedReview.generation_time_ms,
        raw_json: {
          ...(updatedReview.raw_json ?? {}),
          deployment_assets: {
            model: input.model,
            raw_ai_response: input.rawResponse,
            regeneration_run_id: input.regenerationRunId ?? null,
            generated_at: new Date().toISOString(),
          },
        },
      },
      updatedReview.status,
    );
  }

  return {
    analysis: updatedAnalysis,
    opportunity: updatedOpportunity,
    review: updatedReview,
  };
}
