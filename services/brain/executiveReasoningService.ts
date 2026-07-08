import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import {
  buildExecutiveReasoning,
  ExecutiveReasoningOrganizationRequiredError,
} from "@/services/brain/executiveReasoningBuilder";
import type {
  BuildExecutiveReasoningParams,
  ExecutiveReasoning,
  ExecutiveReasoningSourceContext,
} from "@/services/brain/executiveReasoningTypes";

export {
  buildExecutiveReasoning,
  ExecutiveReasoningOrganizationRequiredError,
} from "@/services/brain/executiveReasoningBuilder";

export type {
  BuildExecutiveReasoningParams,
  ExecutiveReasoning,
  ExecutiveReasoningSourceContext,
  StrategicAssessment,
  BusinessAssessment,
  MarketAssessment,
  OpportunityAssessment,
  PriorityAssessment,
  RiskAssessment,
  RecommendedDirection,
  ReasoningMetadata,
  RecommendedDirectionKey,
} from "@/services/brain/executiveReasoningTypes";

export {
  EXECUTIVE_REASONING_VERSION,
  REASONING_PRIORITY_THRESHOLDS,
} from "@/services/brain/executiveReasoningTypes";

export {
  buildDiscussionAnalysisBrainPrompt,
  formatExecutiveReasoningForPrompt,
  formatIdentityFromBrainContext,
} from "@/services/brain/executiveReasoningHelpers";

type CacheEntry = {
  reasoning: ExecutiveReasoning;
  expiresAt: number;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const reasoningCache = new Map<string, CacheEntry>();

function buildCacheKey(params: BuildExecutiveReasoningParams): string {
  return [
    params.organizationId.trim(),
    params.domainId?.trim() ?? "",
    params.discussionId?.trim() ?? "",
    params.opportunityId?.trim() ?? "",
    params.briefingId?.trim() ?? "",
  ].join(":");
}

function readCache(key: string): ExecutiveReasoning | null {
  const entry = reasoningCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    reasoningCache.delete(key);
    return null;
  }

  return entry.reasoning;
}

function writeCache(key: string, reasoning: ExecutiveReasoning) {
  reasoningCache.set(key, {
    reasoning,
    expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
  });
}

export function clearExecutiveReasoningCache(): void {
  reasoningCache.clear();
}

export async function getExecutiveReasoning(
  params: BuildExecutiveReasoningParams & {
    sourceContext?: ExecutiveReasoningSourceContext;
    bypassCache?: boolean;
  },
): Promise<ExecutiveReasoning> {
  if (!params.organizationId?.trim()) {
    throw new ExecutiveReasoningOrganizationRequiredError();
  }

  const cacheKey = buildCacheKey(params);

  if (!params.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const reasoning = await buildExecutiveReasoning(params);
  writeCache(cacheKey, reasoning);
  return reasoning;
}

export async function attachExecutiveReasoning(
  context: ExecutiveReasoningSourceContext,
): Promise<AthenaBrainContext> {
  const executiveReasoning = await getExecutiveReasoning({
    organizationId: context.organization.id,
    sourceContext: context,
  });

  return {
    ...context,
    executiveReasoning,
  };
}
