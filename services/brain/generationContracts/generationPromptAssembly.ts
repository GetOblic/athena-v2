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
import { formatRegenerationRunStamp } from "@/lib/regenerationDiagnostics";

type PromptAssemblyOptions = {
  qualityRefinementSuffix?: string;
  /** Unique per regeneration run — prevents byte-identical OpenRouter requests. */
  regenerationRunId?: string;
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

  return [
    businessContext,
    decisionSignals,
    strategyBlock,
    formatRegenerationRunStamp(options?.regenerationRunId),
  ]
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

  return [
    businessContext,
    commercialContext,
    strategyBlock,
    formatRegenerationRunStamp(options?.regenerationRunId),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function assembleDiscussionAnalysisPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
  qualityRefinementSuffix?: string;
  regenerationRunId?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    regenerationRunId: input.regenerationRunId,
    discussion: input.discussion,
  });
  return buildDiscussionAnalysisPrompt(input.discussion, executiveContextBlock);
}

export function assembleExecutiveBriefingPrompt(input: {
  bundle: GenerationBundle;
  opportunity: Opportunity;
  qualityRefinementSuffix?: string;
  regenerationRunId?: string;
}): string {
  const executiveContextBlock = buildExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    regenerationRunId: input.regenerationRunId,
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

const PERSONA_STRATEGIC_BLUEPRINT_CONTEXT = `
=== PERSONA STRATEGIC BLUEPRINT CONTEXT ===
This source is a Persona archetype / audience segment — not an identifiable individual lead.
Address: Persona positioning, trust formation, communication style, language and cultural fit, objections, offer architecture, channel selection, experience design, visual direction, and validation of weak assumptions.
Distinguish facts, user observations, source-derived evidence, and inference.
Do not assume the Reference Website is owned by the Persona — treat it as contextual market/reference evidence only.
Do not interpret the Persona as one identifiable individual.
Identify important unknowns and propose cheap validation actions.
Avoid stereotypes and fabricated demographic or cultural certainty.
`.trim();

function withPersonaBlueprintContext(
  prompt: string,
  discussion: Record<string, unknown>,
): string {
  const platform = String(discussion.platform ?? "").trim();
  if (platform !== "persona_intelligence") {
    return prompt;
  }
  return `${prompt}\n\n${PERSONA_STRATEGIC_BLUEPRINT_CONTEXT}`;
}

export function assembleStrategicBlueprintPrompt(input: {
  bundle: GenerationBundle;
  discussion: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
  briefing?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  qualityRefinementSuffix?: string;
  regenerationRunId?: string;
}): string {
  const executiveContextBlock = buildBlueprintExecutiveContext(input.bundle, {
    qualityRefinementSuffix: input.qualityRefinementSuffix,
    regenerationRunId: input.regenerationRunId,
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
    return withPersonaBlueprintContext(
      buildAssetBlueprintFromAnalysisPrompt({
        executiveContextPrompt: executiveContextBlock,
        productionSpecsPrompt,
        discussion: input.discussion,
        analysis: input.analysis,
      }),
      input.discussion,
    );
  }

  if (!input.opportunity || !input.briefing) {
    throw new Error(
      "Strategic blueprint prompt requires opportunity and briefing when analysis is absent.",
    );
  }

  return withPersonaBlueprintContext(
    buildAssetBlueprintPrompt({
      executiveContextPrompt: executiveContextBlock,
      productionSpecsPrompt,
      discussion: input.discussion,
      opportunity: input.opportunity,
      briefing: input.briefing,
    }),
    input.discussion,
  );
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
