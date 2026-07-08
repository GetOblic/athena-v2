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
import { assembleExecutiveGenerationContextBlock } from "@/services/brain/generationContracts/contractPromptFormatting";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";

export function assembleDiscussionAnalysisPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
}): string {
  const executiveContextBlock = assembleExecutiveGenerationContextBlock({
    executiveUnderstanding: input.bundle.executiveUnderstanding,
    generationContract: input.bundle.generationContract,
  });

  return buildDiscussionAnalysisPrompt(input.discussion, executiveContextBlock);
}

export function assembleExecutiveBriefingPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
}): string {
  const executiveContextBlock = assembleExecutiveGenerationContextBlock({
    executiveUnderstanding: input.bundle.executiveUnderstanding,
    generationContract: input.bundle.generationContract,
  });

  const basePrompt = buildOpportunityReviewPrompt(input.opportunity);
  return `${basePrompt.trim()}\n\n=== ATHENA EXECUTIVE GENERATION CONTEXT ===\n${executiveContextBlock}`;
}

export function assembleOpportunityReviewPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
}): string {
  return assembleExecutiveBriefingPrompt(input);
}

export function assembleStrategicBlueprintPrompt(input: {
  bundle: GenerationBundle;
  discussion: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
  briefing?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
}): string {
  const executiveContextBlock = assembleExecutiveGenerationContextBlock({
    executiveUnderstanding: input.bundle.executiveUnderstanding,
    generationContract: input.bundle.generationContract,
  });

  const productionContext = buildStrategicBlueprintProductionContext(
    input.bundle.executiveUnderstanding,
  );
  const productionSpecsPrompt =
    formatStrategicBlueprintProductionSpecsForPrompt(productionContext);

  if (input.analysis) {
    return buildAssetBlueprintFromAnalysisPrompt({
      executiveContextPrompt: executiveContextBlock,
      productionSpecsPrompt,
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
    discussion: input.discussion,
    opportunity: input.opportunity,
    briefing: input.briefing,
  });
}

export type DiscussionAnalysisPromptInput = {
  bundle: GenerationBundle;
  discussion: Discussion;
};

export type ExecutiveBriefingPromptInput = {
  bundle: GenerationBundle;
  opportunity: Opportunity;
};

export type StrategicBlueprintPromptInput = {
  bundle: GenerationBundle;
  discussion: Discussion | Record<string, unknown>;
  opportunity?: Opportunity | Record<string, unknown>;
  briefing?: AthenaReview | Record<string, unknown>;
  analysis?: DiscussionAnalysis | Record<string, unknown>;
};
