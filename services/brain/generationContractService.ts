import { clearExecutiveLearningCache } from "@/services/brain/executiveLearningService";
import { clearExecutiveMemoryCache } from "@/services/brain/executiveMemoryService";
import { clearExecutiveReasoningCache } from "@/services/brain/executiveReasoningService";
import {
  resolveExecutiveUnderstandingBundle,
  clearExecutiveUnderstandingCache,
} from "@/services/brain/executiveUnderstandingService";
import { buildGenerationContract } from "@/services/brain/generationContracts/contractBuilder";
import { buildReasoningPipeline } from "@/services/brain/reasoningPipeline/reasoningPipelineOrchestrator";
import {
  assertGenerationContractOrganization,
  validateGenerationContract,
} from "@/services/brain/generationContracts/contractValidation";
import type {
  GenerationBundle,
  ResolveGenerationBundleParams,
} from "@/services/brain/generationContracts/generationContractTypes";

export {
  buildGenerationContract,
  resolveWorkflowContractBuilder,
} from "@/services/brain/generationContracts/contractBuilder";

export {
  formatGenerationContractForPrompt,
  assembleExecutiveGenerationContextBlock,
} from "@/services/brain/generationContracts/contractPromptFormatting";

export {
  validateGenerationContract,
  assertValidGenerationContract,
  assertGenerationContractOrganization,
} from "@/services/brain/generationContracts/contractValidation";

export {
  assembleDiscussionAnalysisPrompt,
  assembleExecutiveBriefingPrompt,
  assembleOpportunityReviewPrompt,
  assembleStrategicBlueprintPrompt,
} from "@/services/brain/generationContracts/generationPromptAssembly";

export type {
  GenerationContract,
  GenerationBundle,
  GenerationWorkflowType,
  ResolveGenerationBundleParams,
  BuildGenerationContractParams,
} from "@/services/brain/generationContracts/generationContractTypes";

export {
  GENERATION_CONTRACT_VERSION,
  GenerationContractOrganizationRequiredError,
  GenerationContractValidationError,
} from "@/services/brain/generationContracts/generationContractTypes";

export {
  resolveExecutiveUnderstandingBundle,
  getExecutiveUnderstanding,
  clearExecutiveUnderstandingCache,
  formatExecutiveUnderstandingForPrompt,
  validateSharedExecutiveUnderstanding,
} from "@/services/brain/executiveUnderstandingService";

export {
  buildExecutiveStrategy,
  formatExecutiveStrategyForPrompt,
  formatOutputResponsibilityForPrompt,
  validateOutputDiversity,
  validateStrategyAlignment,
  validateExecutiveOutputCoherence,
  validateSharedExecutiveStrategy,
  getOutputResponsibilityForWorkflow,
} from "@/services/brain/executiveCoherenceService";

export type { ExecutiveStrategy } from "@/services/brain/executiveCoherenceService";

type CacheEntry = {
  bundle: GenerationBundle;
  expiresAt: number;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const bundleCache = new Map<string, CacheEntry>();

function buildCacheKey(params: ResolveGenerationBundleParams): string {
  return [
    params.organizationId.trim(),
    params.workflowType,
    params.domainId?.trim() ?? "",
    params.discussionId?.trim() ?? "",
    params.opportunityId?.trim() ?? "",
    params.briefingId?.trim() ?? "",
  ].join(":");
}

function readCache(key: string): GenerationBundle | null {
  const entry = bundleCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    bundleCache.delete(key);
    return null;
  }

  return entry.bundle;
}

function writeCache(key: string, bundle: GenerationBundle) {
  bundleCache.set(key, {
    bundle,
    expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
  });
}

export function clearGenerationContractCache(): void {
  bundleCache.clear();
}

export function clearGenerationPipelineCache(): void {
  bundleCache.clear();
  clearExecutiveUnderstandingCache();
  clearExecutiveMemoryCache();
  clearExecutiveLearningCache();
  clearExecutiveReasoningCache();
}

export async function resolveGenerationBundle(
  params: ResolveGenerationBundleParams & { bypassCache?: boolean },
): Promise<GenerationBundle | null> {
  assertGenerationContractOrganization(params.organizationId);

  const cacheKey = buildCacheKey(params);

  if (!params.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const understandingBundle = await resolveExecutiveUnderstandingBundle({
    organizationId: params.organizationId,
    discussionId: params.discussionId,
    opportunityId: params.opportunityId,
    briefingId: params.briefingId,
    domainId: params.domainId,
    bypassCache: params.bypassCache,
  });

  if (!understandingBundle) {
    return null;
  }

  const { brainContext, executiveReasoning, executiveUnderstanding, executiveStrategy } =
    understandingBundle;

  const generationContract = buildGenerationContract({
    workflowType: params.workflowType,
    organizationId: params.organizationId,
    brainContext,
    executiveReasoning,
  });

  const reasoningPipeline = buildReasoningPipeline({
    organizationId: params.organizationId,
    discussionId: params.discussionId ?? null,
    brainContext,
  });

  const bundle: GenerationBundle = {
    brainContext,
    executiveReasoning,
    executiveUnderstanding,
    executiveStrategy,
    generationContract,
    reasoningPipeline,
  };

  writeCache(cacheKey, bundle);
  return bundle;
}

export async function resolveValidatedGenerationBundle(
  params: ResolveGenerationBundleParams & { bypassCache?: boolean },
): Promise<GenerationBundle | null> {
  const bundle = await resolveGenerationBundle(params);
  if (!bundle) {
    return null;
  }

  const validation = validateGenerationContract({
    contract: bundle.generationContract,
    brainContext: bundle.brainContext,
    executiveReasoning: bundle.executiveReasoning,
  });

  if (!validation.valid) {
    console.warn(
      "Generation contract validation warnings:",
      validation.errors.join("; "),
    );
  }

  return bundle;
}
