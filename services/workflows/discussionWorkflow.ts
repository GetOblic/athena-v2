import { generateReview } from "@/services/aiService";
import {
  createAssetBlueprintForBriefing,
  createAssetBlueprintForDiscussionAnalysis,
} from "@/services/assetBlueprints/assetBlueprintService";
import {
  formatBrainContextForPrompt,
  getAthenaBrainContextForCurrentUser,
  getAthenaBrainContextForUserId,
} from "@/services/brain/brainContextService";
import {
  assembleDiscussionAnalysisPrompt,
  assembleExecutiveBriefingPrompt,
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
import { logRegenerationDiagnostic } from "@/lib/regenerationDiagnostics";

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
}) {
  const path =
    input.opportunity && input.review
      ? "createAssetBlueprintForBriefing"
      : "createAssetBlueprintForDiscussionAnalysis";

  logRegenerationDiagnostic("BLUEPRINT_GENERATION_REQUESTED", {
    discussionId: input.discussion.id,
    path,
    hasOpportunity: Boolean(input.opportunity),
    hasReview: Boolean(input.review),
    hasGenerationBundle: Boolean(input.generationBundle),
  });

  try {
    if (input.opportunity && input.review) {
      return await createAssetBlueprintForBriefing({
        discussion: input.discussion,
        opportunity: input.opportunity,
        briefing: input.review,
        generationBundle: input.generationBundle ?? undefined,
        brainContextPrompt: input.brainContextPrompt,
      });
    }

    return await createAssetBlueprintForDiscussionAnalysis({
      discussion: input.discussion,
      analysis: input.analysis,
      generationBundle: input.generationBundle ?? undefined,
      brainContextPrompt: input.brainContextPrompt,
    });
  } catch (error) {
    console.error("Asset blueprint generation failed:", error);
    logRegenerationDiagnostic("BLUEPRINT_GENERATION_FAILED", {
      discussionId: input.discussion.id,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
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
    });
  } catch (error) {
    console.error("Strategic blueprint generation contract unavailable:", error);
    return null;
  }
}

export async function processDiscussionEndToEnd(
  discussionId: string,
  organizationId: string,
) {
  try {
    return await processDiscussionEndToEndInternal(discussionId, organizationId);
  } catch (error) {
    console.error("processDiscussionEndToEnd failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Discussion regeneration workflow failed");
  }
}

async function processDiscussionEndToEndInternal(
  discussionId: string,
  organizationId: string,
) {
  const startedAt = Date.now();
  const discussion = await getDiscussionById(discussionId, organizationId);

  if (!discussion) {
    throw new Error(`Discussion not found: ${discussionId}`);
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

  logRegenerationDiagnostic("ANALYSIS_LLM_PREPARED", {
    discussionId,
    organizationId,
    promptSource: analysisPromptSource,
    hasGenerationBundle: Boolean(analysisBundle),
    usingLegacyBrainPrompt: Boolean(legacyBrainPrompt),
  });

  if (analysisBundle) {
    try {
      const gated = await runSimplifiedQualityGateLoop({
        generate: async (refinementSuffix) => {
          const prompt = assembleDiscussionAnalysisPrompt({
            bundle: analysisBundle,
            discussion: analysisDiscussion,
            qualityRefinementSuffix: refinementSuffix,
          });
          return generateReview(prompt, {
            stage: "discussion_analysis.quality_gate",
            promptSource: analysisPromptSource,
          });
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
      });
      rawAnalysis = await generateReview(prompt, {
        stage: "discussion_analysis.fallback",
        promptSource: analysisPromptSource,
      });
      parsedAnalysis = parseAnalysis(rawAnalysis);
    }
  } else {
    const analysisPrompt = buildDiscussionAnalysisPrompt(
      analysisDiscussion,
      legacyBrainPrompt ?? "",
    );
    rawAnalysis = await generateReview(analysisPrompt, {
      stage: "discussion_analysis.legacy",
      promptSource: analysisPromptSource,
    });
    parsedAnalysis = parseAnalysis(rawAnalysis);
  }

  logRegenerationDiagnostic("ANALYSIS_LLM_COMPLETED", {
    discussionId,
    promptSource: analysisPromptSource,
    responseCharCount: rawAnalysis.length,
    opportunityDetected: parsedAnalysis.opportunity_detected,
    hasSuggestedCta: Boolean(parsedAnalysis.suggested_cta?.trim()),
  });

  const analysis = await createDiscussionAnalysis({
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
    },
  });

  if (!parsedAnalysis.opportunity_detected) {
    const blueprintBundle = await resolveStrategicBlueprintGeneration(
      organizationId,
      discussion.id,
    );
    const assetBlueprint = await generateAssetBlueprint({
      discussion,
      analysis,
      generationBundle: blueprintBundle,
      brainContextPrompt: legacyBrainPrompt ?? undefined,
    });

    return {
      discussion,
      analysis,
      opportunity: null,
      review: null,
      assetBlueprint,
      status: "analysis_completed_no_opportunity",
    };
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
    throw new Error("Analysis completed but opportunity was not saved.");
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

  logRegenerationDiagnostic("BRIEFING_LLM_PREPARED", {
    discussionId,
    opportunityId: opportunity.id,
    promptSource: briefingPromptSource,
    hasGenerationBundle: Boolean(briefingBundle),
  });

  if (briefingBundle) {
    try {
      const gated = await runSimplifiedQualityGateLoop({
        generate: async (refinementSuffix) => {
          const prompt = assembleExecutiveBriefingPrompt({
            bundle: briefingBundle,
            opportunity,
            qualityRefinementSuffix: refinementSuffix,
          });
          return generateReview(prompt, {
            stage: "executive_briefing.quality_gate",
            promptSource: briefingPromptSource,
          });
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
      });
      rawReview = await generateReview(prompt, {
        stage: "executive_briefing.fallback",
        promptSource: briefingPromptSource,
      });
      parsedReview = parseGeneratedReview(rawReview);
    }
  } else {
    rawReview = await generateReview(buildOpportunityReviewPrompt(opportunity), {
      stage: "executive_briefing.legacy",
      promptSource: briefingPromptSource,
    });
    parsedReview = parseGeneratedReview(rawReview);
  }

  logRegenerationDiagnostic("BRIEFING_LLM_COMPLETED", {
    discussionId,
    promptSource: briefingPromptSource,
    responseCharCount: rawReview.length,
    hasDeploymentAssets: Boolean(parsedReview.recommended_response?.trim()),
  });

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
    throw new Error("Opportunity created but briefing/review was not saved.");
  }

  const blueprintBundle = await resolveStrategicBlueprintGeneration(
    organizationId,
    discussion.id,
    opportunity.id,
    review.id,
  );
  const assetBlueprint = await generateAssetBlueprint({
    discussion,
    analysis,
    opportunity,
    review,
    generationBundle: blueprintBundle,
    brainContextPrompt: legacyBrainPrompt ?? undefined,
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

  return {
    discussion,
    analysis,
    opportunity,
    review,
    assetBlueprint,
    status: "review_ready",
  };
}
