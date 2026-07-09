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
  formatStrategicBlueprintProductionSpecsCompactForPrompt,
} from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import { formatStructuredBusinessContext } from "@/services/brain/generationContracts/businessContextBlock";
import { assembleExecutiveGenerationContextBlock } from "@/services/brain/generationContracts/contractPromptFormatting";
import {
  formatReasoningPipelineCompactForPrompt,
  formatReasoningContextForBlueprintSelection,
} from "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";

type PromptAssemblyOptions = {
  qualityRefinementSuffix?: string;
};

function buildExecutiveContext(
  bundle: GenerationBundle,
  options?: PromptAssemblyOptions & {
    discussion?: {
      title?: string | null;
      body?: string | null;
      content?: string | null;
    };
    analysis?: Record<string, unknown>;
    opportunity?: Record<string, unknown>;
  },
): string {
  const businessContext = formatStructuredBusinessContext({
    bundle,
    discussion: options?.discussion,
    analysis: options?.analysis,
    opportunity: options?.opportunity,
  });
  const decisionSignals = formatReasoningPipelineCompactForPrompt(
    bundle.reasoningPipeline,
  );
  const strategyBlock = assembleExecutiveGenerationContextBlock({
    executiveStrategy: bundle.executiveStrategy,
    generationContract: bundle.generationContract,
    qualityRefinementSuffix: options?.qualityRefinementSuffix,
    compact: true,
  });

  return [businessContext, decisionSignals, strategyBlock]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildBlueprintExecutiveContext(
  bundle: GenerationBundle,
  options?: PromptAssemblyOptions & {
    discussion?: {
      title?: string | null;
      body?: string | null;
      content?: string | null;
    };
    analysis?: Record<string, unknown>;
    opportunity?: Record<string, unknown>;
  },
): string {
  const businessContext = formatStructuredBusinessContext({
    bundle,
    discussion: options?.discussion,
    analysis: options?.analysis,
    opportunity: options?.opportunity,
  });
  const commercialContext = formatReasoningContextForBlueprintSelection(
    bundle.reasoningPipeline,
  );
  const strategyBlock = assembleExecutiveGenerationContextBlock({
    executiveStrategy: bundle.executiveStrategy,
    generationContract: bundle.generationContract,
    qualityRefinementSuffix: options?.qualityRefinementSuffix,
    blueprintMode: true,
  });

  return [businessContext, commercialContext, strategyBlock]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function assembleDiscussionAnalysisPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
  qualityRefinementSuffix?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    discussion: input.discussion,
  });
  return buildDiscussionAnalysisPrompt(input.discussion, executiveContextBlock);
}

export function assembleExecutiveBriefingPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
  qualityRefinementSuffix?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    opportunity: input.opportunity as unknown as Record<string, unknown>,
  });
  const taskPrompt = buildOpportunityReviewPrompt(input.opportunity);
  return `${executiveContextBlock}\n\n${taskPrompt}`.trim();
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
  const executiveContextBlock = buildBlueprintExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    discussion: input.discussion,
    analysis: input.analysis,
    opportunity: input.opportunity,
  });

  const productionContext = buildStrategicBlueprintProductionContext(
    input.bundle.executiveUnderstanding,
    input.bundle.executiveStrategy,
  );
  const productionSpecsPrompt =
    formatStrategicBlueprintProductionSpecsCompactForPrompt(productionContext, {
      blueprintSelection: true,
    });

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
