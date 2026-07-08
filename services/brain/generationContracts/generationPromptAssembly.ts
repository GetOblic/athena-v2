import type { Discussion } from "@/services/discussionService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import { buildDiscussionAnalysisPrompt } from "@/services/ai/prompts/discussionAnalysisPrompt";
import { buildOpportunityReviewPrompt } from "@/services/ai/prompts/opportunityReviewPrompt";
import {
  buildAssetBlueprintFromAnalysisPrompt,
  buildAssetBlueprintPrompt,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import {
  buildStrategicBlueprintProductionContext,
  formatStrategicBlueprintProductionSpecsForPrompt,
} from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import {
  formatExecutiveAssetStandardForPrompt,
  resolveAssetStandard,
} from "@/services/brain/assetStandards/assetStandardRegistry";
import { assembleExecutiveGenerationContextBlock } from "@/services/brain/generationContracts/contractPromptFormatting";
import { formatReasoningPipelineForPrompt } from "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";

type PromptAssemblyOptions = {
  qualityRefinementSuffix?: string;
};

function buildExecutiveContext(
  bundle: GenerationBundle,
  options?: PromptAssemblyOptions,
): string {
  const pipelineBlock = formatReasoningPipelineForPrompt(bundle.reasoningPipeline);
  const strategyBlock = assembleExecutiveGenerationContextBlock({
    executiveStrategy: bundle.executiveStrategy,
    generationContract: bundle.generationContract,
    executiveUnderstanding: bundle.executiveUnderstanding,
    qualityRefinementSuffix: options?.qualityRefinementSuffix,
  });

  return [pipelineBlock, strategyBlock].filter(Boolean).join("\n\n").trim();
}

export function assembleDiscussionAnalysisPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
  qualityRefinementSuffix?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, input);
  return buildDiscussionAnalysisPrompt(input.discussion, executiveContextBlock);
}

export function assembleExecutiveBriefingPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
  qualityRefinementSuffix?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, input);
  const basePrompt = buildOpportunityReviewPrompt(input.opportunity);
  return `${basePrompt.trim()}\n\n=== ATHENA EXECUTIVE GENERATION CONTEXT ===\n${executiveContextBlock}`;
}

export function assembleOpportunityReviewPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
  qualityRefinementSuffix?: string;
}): string {
  return assembleExecutiveBriefingPrompt(input);
}

export function assembleStrategicBlueprintPrompt(input: {
  bundle: GenerationBundle;
  discussion: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
  briefing?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  qualityRefinementSuffix?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, input);

  const productionContext = buildStrategicBlueprintProductionContext(
    input.bundle.executiveUnderstanding,
    input.bundle.executiveStrategy,
  );
  const productionSpecsPrompt =
    formatStrategicBlueprintProductionSpecsForPrompt(productionContext);
  const assetStandard = resolveAssetStandard(productionContext.preferredAssetType);
  const assetStandardPrompt = formatExecutiveAssetStandardForPrompt(assetStandard);

  if (input.analysis) {
    return buildAssetBlueprintFromAnalysisPrompt({
      executiveContextPrompt: executiveContextBlock,
      productionSpecsPrompt,
      assetStandardPrompt,
      discussion: input.discussion,
      analysis: input.analysis,
    });
  }

  if (!input.opportunity || !input.briefing) {
    throw new Error(
      "Strategic blueprint prompt requires opportunity and briefing when analysis is absent.",
    );
  }

  return buildAssetBlueprintPrompt({
    executiveContextPrompt: executiveContextBlock,
    productionSpecsPrompt,
    assetStandardPrompt,
    discussion: input.discussion,
    opportunity: input.opportunity,
    briefing: input.briefing,
  });
}

export type DiscussionAnalysisPromptInput = {
  bundle: GenerationBundle;
  discussion: Discussion;
  qualityRefinementSuffix?: string;
};

export type ExecutiveBriefingPromptInput = {
  bundle: GenerationBundle;
  opportunity: Opportunity;
  qualityRefinementSuffix?: string;
};

export type StrategicBlueprintPromptInput = {
  bundle: GenerationBundle;
  discussion: Discussion | Record<string, unknown>;
  opportunity?: Opportunity | Record<string, unknown>;
  briefing?: AthenaReview | Record<string, unknown>;
  analysis?: DiscussionAnalysis | Record<string, unknown>;
  qualityRefinementSuffix?: string;
};
