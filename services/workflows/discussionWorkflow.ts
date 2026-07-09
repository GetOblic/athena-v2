import { generateReview } from "@/services/aiService";
import type { AthenaGenerationKind } from "@/lib/reasoningProfiles";
import {
  createAssetBlueprintForBriefing,
  createAssetBlueprintForDiscussionAnalysis,
  type BlueprintGenerationOutcome,
} from "@/services/assetBlueprints/assetBlueprintService";
import {
  formatBrainContextForPrompt,
  getAthenaBrainContextForCurrentUser,
  getAthenaBrainContextForUserId,
} from "@/services/brain/brainContextService";
import {
  assembleDiscussionAnalysisPrompt,
  assembleExecutiveBriefingPrompt,
  clearGenerationPipelineCache,
  resolveGenerationBundle,
} from "@/services/brain/generationContractService";
import {
  validateExecutiveOutputCoherence,
  extractAdvisoryFields,
  extractDeploymentFields,
} from "@/services/brain/executiveCoherenceService";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import { buildDiscussionAnalysisPrompt } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { buildOpportunityReviewPrompt } from "@/services/ai/prompts/opportunityReviewPrompt";
import { ELEVATE_STRATEGY_PROMPT_VERSION } from "@/services/ai/prompts/elevateStrategyPrompt";
import { DISCUSSION_ANALYSIS_PROMPT_VERSION } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { OPPORTUNITY_REVIEW_PROMPT_VERSION } from "@/services/ai/prompts/opportunityReviewPrompt";
import { buildAnalysisThreadBody } from "@/lib/discussionContent";
import { createDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionUpdatesByDiscussionId } from "@/services/discussionUpdateService";
import { getDiscussionById } from "@/services/discussionService";
import { upsertOpportunityFromAnalysis } from "@/services/opportunityService";
import { upsertReviewFromGeneration } from "@/services/reviewService";
import { computeCompositeOpportunityScoreFromAnalysis } from "@/services/brain/executiveIntelligenceHelpers";
import { runSimplifiedQualityGateLoop } from "@/services/brain/reasoningPipeline/simplifiedQualityGate";
import {
  appendRegenerationRunStamp,
  hashContent,
  logPersistedRegenerationOutput,
  logRegenerationEvent,
  logRegenerationForensic,
} from "@/lib/regenerationDiagnostics";

export type RegenerationRunContext = {
  regenerationRunId: string;
  explicitRegeneration?: boolean;
};

export type DiscussionEndToEndResult = {
  success: boolean;
  partial?: boolean;
  warning?: string;
  error?: string;
  discussionId: string;
  analysisId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  blueprintId?: string | null;
  blueprintGenerated: boolean;
  blueprintError?: string;
  status?: string;
};

function workflowFailure(
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

function workflowSuccess(input: {
  discussionId: string;
  analysisId: string;
  opportunityId?: string | null;
  reviewId?: string | null;
  blueprintOutcome: BlueprintGenerationOutcome;
  status: string;
  explicitRegeneration?: boolean;
}): DiscussionEndToEndResult {
  if (
    input.explicitRegeneration &&
    (input.blueprintOutcome.preservedPrevious ||
      input.blueprintOutcome.fallbackUsed)
  ) {
    return workflowFailure(
      input.discussionId,
      input.blueprintOutcome.blueprintError ??
        "Strategic Blueprint regeneration failed.",
    );
  }

  const blueprintGenerated = input.blueprintOutcome.blueprintGenerated;
  const partial = !blueprintGenerated;

  if (partial && input.explicitRegeneration) {
    return workflowFailure(
      input.discussionId,
      input.blueprintOutcome.blueprintError ??
        "Strategic Blueprint regeneration failed.",
    );
  }

  if (partial) {
    return {
      success: true,
      partial: true,
      warning: input.blueprintOutcome.preservedPrevious
        ? "Strategic Blueprint could not be regenerated, previous valid blueprint was preserved."
        : input.blueprintOutcome.blueprintError ??
          "Strategic Blueprint could not be regenerated.",
      discussionId: input.discussionId,
      analysisId: input.analysisId,
      opportunityId: input.opportunityId ?? null,
      reviewId: input.reviewId ?? null,
      blueprintId: input.blueprintOutcome.blueprint?.id ?? null,
      blueprintGenerated: false,
      blueprintError: input.blueprintOutcome.blueprintError,
      status: input.status,
    };
  }

  return {
    success: true,
    discussionId: input.discussionId,
    analysisId: input.analysisId,
    opportunityId: input.opportunityId ?? null,
    reviewId: input.reviewId ?? null,
    blueprintId: input.blueprintOutcome.blueprint?.id ?? null,
    blueprintGenerated: true,
    status: input.status,
  };
}

function analysisReviewText(parsed: GeneratedDiscussionAnalysis): string {
  return [
    parsed.summary,
    parsed.opportunity_reason,
    parsed.recommended_action,
    parsed.suggested_cta,
    parsed.opportunity_title,
  ].join("\n");
}

function briefingReviewText(parsed: GeneratedReview): string {
  return [parsed.summary, parsed.recommended_response, parsed.cta, parsed.pain_points].join(
    "\n",
  );
}

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
  try {
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
  } catch (error) {
    console.error("Discussion analysis JSON parse failed:", error);
    return {
      summary: rawText.slice(0, 2000),
      sentiment: "neutral",
      intent: "none",
      buyer_stage: "unaware",
      pain_points: "",
      opportunity_detected: false,
      opportunity_title: "",
      opportunity_reason: "",
      recommended_action: "",
      suggested_cta: "",
      risk_level: "low",
      confidence: 0,
    };
  }
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
  opportunity?: Awaited<ReturnType<typeof upsertOpportunityFromAnalysis>> | null;
  review?: Awaited<ReturnType<typeof upsertReviewFromGeneration>> | null;
  generationBundle?: GenerationBundle | null;
  brainContextPrompt?: string;
  regenerationRunId?: string;
  explicitRegeneration?: boolean;
}): Promise<BlueprintGenerationOutcome> {
  try {
    if (input.opportunity && input.review) {
      return await createAssetBlueprintForBriefing({
        discussion: input.discussion,
        opportunity: input.opportunity,
        briefing: input.review,
        generationBundle: input.generationBundle ?? undefined,
        brainContextPrompt: input.brainContextPrompt,
        regenerationRunId: input.regenerationRunId,
        explicitRegeneration: input.explicitRegeneration,
      });
    }

    return await createAssetBlueprintForDiscussionAnalysis({
      discussion: input.discussion,
      analysis: input.analysis,
      generationBundle: input.generationBundle ?? undefined,
      brainContextPrompt: input.brainContextPrompt,
      regenerationRunId: input.regenerationRunId,
      explicitRegeneration: input.explicitRegeneration,
    });
  } catch (error) {
    console.error("generateAssetBlueprint failed:", error);
    return {
      blueprint: null,
      blueprintGenerated: false,
      blueprintError:
        error instanceof Error
          ? error.message
          : "Strategic blueprint generation failed",
      parseFailed: true,
      preservedPrevious: false,
      fallbackUsed: false,
    };
  }
}

async function resolveDiscussionAnalysisGeneration(
  discussionId: string,
  organizationId: string,
  userId: string | null | undefined,
): Promise<{
  bundle: GenerationBundle | null;
  legacyBrainPrompt: string | null;
}> {
  try {
    const bundle = await resolveGenerationBundle({
      workflowType: "discussion_analysis",
      organizationId,
      discussionId,
      bypassCache: true,
    });

    if (bundle) {
      return { bundle, legacyBrainPrompt: null };
    }
  } catch (error) {
    console.error(
      "Generation contract unavailable for discussion analysis, using legacy brain context:",
      error,
    );
  }

  const legacyContext = userId
    ? await getAthenaBrainContextForUserId(userId, organizationId)
    : await getAthenaBrainContextForCurrentUser();

  return {
    bundle: null,
    legacyBrainPrompt: formatBrainContextForPrompt(legacyContext),
  };
}

async function resolveExecutiveBriefingGeneration(
  organizationId: string,
  discussionId: string,
  opportunityId: string,
): Promise<GenerationBundle | null> {
  try {
    return await resolveGenerationBundle({
      workflowType: "executive_briefing",
      organizationId,
      discussionId,
      opportunityId,
      bypassCache: true,
    });
  } catch (error) {
    console.error("Executive briefing generation contract unavailable:", error);
    return null;
  }
}

async function resolveStrategicBlueprintGeneration(
  organizationId: string,
  discussionId: string,
  opportunityId?: string,
  briefingId?: string,
): Promise<GenerationBundle | null> {
  try {
    return await resolveGenerationBundle({
      workflowType: "strategic_blueprint",
      organizationId,
      discussionId,
      opportunityId,
      briefingId,
      bypassCache: true,
    });
  } catch (error) {
    console.error("Strategic blueprint generation contract unavailable:", error);
    return null;
  }
}

export async function processDiscussionEndToEnd(
  discussionId: string,
  organizationId: string,
  runContext?: RegenerationRunContext,
): Promise<DiscussionEndToEndResult> {
  try {
    return await processDiscussionEndToEndInternal(
      discussionId,
      organizationId,
      runContext,
    );
  } catch (error) {
    console.error("processDiscussionEndToEnd failed:", error);
    return workflowFailure(
      discussionId,
      "Regeneration failed. Please check logs.",
    );
  }
}

async function processDiscussionEndToEndInternal(
  discussionId: string,
  organizationId: string,
  runContext?: RegenerationRunContext,
): Promise<DiscussionEndToEndResult> {
  clearGenerationPipelineCache();

  const startedAt = Date.now();
  const regenerationRunId = runContext?.regenerationRunId;
  const explicitRegeneration = Boolean(runContext?.explicitRegeneration);

  logRegenerationEvent("REGENERATION_STARTED", {
    discussionId,
    organizationId,
    regenerationRunId: regenerationRunId ?? null,
    explicitRegeneration,
  });

  const buildLlmMeta = (
    stage: string,
    promptSource: string,
    generationKind: AthenaGenerationKind,
  ) => ({
    stage,
    promptSource,
    generationKind,
    regenerationRunId,
    discussionId,
    explicitRegeneration,
  });
  const discussion = await getDiscussionById(discussionId, organizationId);

  if (!discussion) {
    return workflowFailure(discussionId, "Discussion not found");
  }

  const { bundle: analysisBundle, legacyBrainPrompt } =
    await resolveDiscussionAnalysisGeneration(
      discussionId,
      organizationId,
      discussion.user_id,
    );

  const threadUpdates = await getDiscussionUpdatesByDiscussionId(
    discussionId,
    organizationId,
  );
  const analysisDiscussion = {
    ...discussion,
    body: buildAnalysisThreadBody(discussion, threadUpdates),
  };

  let parsedAnalysis: GeneratedDiscussionAnalysis;
  let rawAnalysis: string;

  const analysisPromptSource = analysisBundle
    ? "services/brain/generationContracts/generationPromptAssembly.ts::assembleDiscussionAnalysisPrompt"
    : "services/ai/prompts/discussionAnalysisPrompt.ts::buildDiscussionAnalysisPrompt";

  try {
    if (analysisBundle) {
      try {
        const gated = await runSimplifiedQualityGateLoop({
          generate: async (refinementSuffix) => {
            const prompt = assembleDiscussionAnalysisPrompt({
              bundle: analysisBundle,
              discussion: analysisDiscussion,
              qualityRefinementSuffix: refinementSuffix,
              regenerationRunId,
            });
            logRegenerationForensic("PROMPT_ASSEMBLED", {
              stage: "discussion_analysis",
              regenerationRunId: regenerationRunId ?? null,
              promptHash: hashContent(prompt),
            });
            return generateReview(
              prompt,
              buildLlmMeta(
                "discussion_analysis.quality_gate",
                analysisPromptSource,
                "discussion_analysis",
              ),
            );
          },
          parse: parseAnalysis,
          validate: (_parsed, text) => ({
            valid: text.trim().length > 0,
            errors: text.trim() ? [] : ["Analysis output is empty."],
          }),
          toReviewText: analysisReviewText,
        });
        parsedAnalysis = gated.parsed;
        rawAnalysis = gated.raw;
      } catch (error) {
        console.error(
          "Discussion analysis quality gate failed, using single generation:",
          error,
        );
        const prompt = assembleDiscussionAnalysisPrompt({
          bundle: analysisBundle,
          discussion: analysisDiscussion,
          regenerationRunId,
        });
        logRegenerationForensic("PROMPT_ASSEMBLED", {
          stage: "discussion_analysis.fallback",
          regenerationRunId: regenerationRunId ?? null,
          promptHash: hashContent(prompt),
        });
        rawAnalysis = await generateReview(
          prompt,
          buildLlmMeta(
            "discussion_analysis.fallback",
            analysisPromptSource,
            "discussion_analysis",
          ),
        );
        parsedAnalysis = parseAnalysis(rawAnalysis);
      }
    } else {
      const analysisPrompt = appendRegenerationRunStamp(
        buildDiscussionAnalysisPrompt(
          analysisDiscussion,
          legacyBrainPrompt ?? "",
        ),
        regenerationRunId,
      );
      rawAnalysis = await generateReview(
        analysisPrompt,
        buildLlmMeta(
          "discussion_analysis.legacy",
          analysisPromptSource,
          "discussion_analysis",
        ),
      );
      parsedAnalysis = parseAnalysis(rawAnalysis);
    }
  } catch (error) {
    console.error("Discussion analysis generation failed:", error);
    return workflowFailure(
      discussionId,
      "Discussion analysis generation failed.",
    );
  }

  let analysis;
  try {
    analysis = await createDiscussionAnalysis({
      organization_id: organizationId,
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
        regeneration_run_id: regenerationRunId ?? null,
      },
    });

    logPersistedRegenerationOutput({
      regenerationRunId,
      discussionId,
      organizationId,
      stage: "analysis",
      persistedHash: hashContent(analysis.summary),
      recordId: analysis.id,
    });

    logPersistedRegenerationOutput({
      regenerationRunId,
      discussionId,
      organizationId,
      stage: "deployment_assets",
      persistedHash: hashContent(analysis.suggested_cta),
      recordId: analysis.id,
    });

    logRegenerationForensic("EXECUTIVE_INTELLIGENCE_REGENERATED", {
      regenerationRunId: regenerationRunId ?? null,
      discussionId,
      analysisId: analysis.id,
      summaryHash: hashContent(analysis.summary),
    });
    logRegenerationForensic("DEPLOYMENT_ASSETS_REGENERATED", {
      regenerationRunId: regenerationRunId ?? null,
      discussionId,
      analysisId: analysis.id,
      deploymentAssetsHash: hashContent(analysis.suggested_cta),
    });
  } catch (error) {
    console.error("Discussion analysis save failed:", error);
    return workflowFailure(discussionId, "Discussion analysis was not saved.");
  }

  if (!parsedAnalysis.opportunity_detected) {
    const blueprintBundle = await resolveStrategicBlueprintGeneration(
      organizationId,
      discussion.id,
    );
    const blueprintOutcome = await generateAssetBlueprint({
      discussion,
      analysis,
      generationBundle: blueprintBundle,
      brainContextPrompt: legacyBrainPrompt ?? undefined,
      regenerationRunId,
      explicitRegeneration,
    });

    return workflowSuccess({
      discussionId,
      analysisId: analysis.id,
      blueprintOutcome,
      status: "analysis_completed_no_opportunity",
      explicitRegeneration,
    });
  }

  const opportunityScore = computeCompositeOpportunityScoreFromAnalysis({
    reasoning: analysisBundle?.executiveReasoning?.executiveIntelligence,
    aiConfidence: parsedAnalysis.confidence || discussion.opportunity_score || 0,
  });

  const opportunityTitle =
    parsedAnalysis.opportunity_title ||
    analysisBundle?.executiveUnderstanding?.executiveInitiativeSelection
      ?.selectedInitiative?.initiativeLabel ||
    analysisBundle?.executiveUnderstanding?.executiveSummary?.headline ||
    analysisBundle?.executiveReasoning?.executiveIntelligence
      ?.suggestedOpportunityTitle ||
    discussion.title;

  const opportunity = await upsertOpportunityFromAnalysis({
    organization_id: organizationId,
    discussion_id: discussion.id,
    user_id: discussion.user_id ?? null,
    community_id: discussion.community_id,
    status: "draft",
    score: opportunityScore,
    urgency: parsedAnalysis.risk_level,
    intent: parsedAnalysis.intent,
    risk_level: parsedAnalysis.risk_level,
    title: opportunityTitle,
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
    return {
      success: true,
      partial: true,
      warning: "Analysis regenerated but opportunity was not saved.",
      discussionId,
      analysisId: analysis.id,
      blueprintGenerated: false,
      status: "analysis_completed_opportunity_unsaved",
    };
  }

  const reviewStartedAt = Date.now();
  const briefingBundle = await resolveExecutiveBriefingGeneration(
    organizationId,
    discussion.id,
    opportunity.id,
  );

  let parsedReview: GeneratedReview;
  let rawReview: string;

  const briefingPromptSource = briefingBundle
    ? "services/brain/generationContracts/generationPromptAssembly.ts::assembleExecutiveBriefingPrompt"
    : "services/ai/prompts/opportunityReviewPrompt.ts::buildOpportunityReviewPrompt";

  try {
    if (briefingBundle) {
      try {
        const gated = await runSimplifiedQualityGateLoop({
          generate: async (refinementSuffix) => {
            const prompt = assembleExecutiveBriefingPrompt({
              bundle: briefingBundle,
              opportunity,
              qualityRefinementSuffix: refinementSuffix,
              regenerationRunId,
            });
            return generateReview(
              prompt,
              buildLlmMeta(
                "executive_briefing.quality_gate",
                briefingPromptSource,
                "executive_briefing",
              ),
            );
          },
          parse: parseGeneratedReview,
          validate: (_parsed, text) => ({
            valid: text.trim().length > 0,
            errors: text.trim() ? [] : ["Briefing output is empty."],
          }),
          toReviewText: briefingReviewText,
        });
        parsedReview = gated.parsed;
        rawReview = gated.raw;
      } catch (error) {
        console.error(
          "Executive briefing quality gate failed, using single generation:",
          error,
        );
        const prompt = assembleExecutiveBriefingPrompt({
          bundle: briefingBundle,
          opportunity,
          regenerationRunId,
        });
        rawReview = await generateReview(
          prompt,
          buildLlmMeta(
            "executive_briefing.fallback",
            briefingPromptSource,
            "executive_briefing",
          ),
        );
        parsedReview = parseGeneratedReview(rawReview);
      }
    } else {
      rawReview = await generateReview(
        appendRegenerationRunStamp(
          buildOpportunityReviewPrompt(opportunity),
          regenerationRunId,
        ),
        buildLlmMeta(
          "executive_briefing.legacy",
          briefingPromptSource,
          "executive_briefing",
        ),
      );
      parsedReview = parseGeneratedReview(rawReview);
    }
  } catch (error) {
    console.error("Executive briefing generation failed:", error);
    return workflowFailure(
      discussionId,
      "Analysis and opportunity regenerated but briefing generation failed.",
    );
  }

  const review = await upsertReviewFromGeneration({
    organization_id: organizationId,
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
    return {
      success: true,
      partial: true,
      warning: "Analysis and opportunity regenerated but briefing was not saved.",
      discussionId,
      analysisId: analysis.id,
      opportunityId: opportunity.id,
      blueprintGenerated: false,
      status: "briefing_save_failed",
    };
  }

  const blueprintBundle = await resolveStrategicBlueprintGeneration(
    organizationId,
    discussion.id,
    opportunity.id,
    review.id,
  );
  const blueprintOutcome = await generateAssetBlueprint({
    discussion,
    analysis,
    opportunity,
    review,
    generationBundle: blueprintBundle,
    brainContextPrompt: legacyBrainPrompt ?? undefined,
    regenerationRunId,
    explicitRegeneration,
  });

  if (analysisBundle && briefingBundle) {
    try {
      const coherence = validateExecutiveOutputCoherence({
        strategies: [analysisBundle.executiveStrategy, briefingBundle.executiveStrategy],
        outputs: [
          {
            type: "discussion_analysis",
            text: extractAdvisoryFields(parsedAnalysis as unknown as Record<string, unknown>),
          },
          {
            type: "executive_briefing",
            text: extractAdvisoryFields(parsedReview as unknown as Record<string, unknown>),
          },
          {
            type: "deployment_asset",
            text: extractDeploymentFields(parsedReview.recommended_response),
          },
        ],
      });

      if (coherence.warnings.length > 0 || coherence.errors.length > 0) {
        console.warn("Executive output coherence check:", {
          errors: coherence.errors,
          warnings: coherence.warnings,
        });
      }
    } catch (error) {
      console.error("Executive output coherence check failed:", error);
    }
  }

  return workflowSuccess({
    discussionId,
    analysisId: analysis.id,
    opportunityId: opportunity.id,
    reviewId: review.id,
    blueprintOutcome,
    status: "review_ready",
    explicitRegeneration,
  });
}
