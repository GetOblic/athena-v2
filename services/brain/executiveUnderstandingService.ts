import { buildBrainContext } from "@/services/brain/executiveContextBuilder";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingBuilder";
import type {
  ExecutiveUnderstanding,
  ExecutiveUnderstandingBundle,
  ResolveExecutiveUnderstandingParams,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import { ExecutiveUnderstandingOrganizationRequiredError } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export {
  buildExecutiveUnderstanding,
  ExecutiveUnderstandingOrganizationRequiredError,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingBuilder";

export type {
  ExecutiveUnderstanding,
  ExecutiveUnderstandingBundle,
  ResolveExecutiveUnderstandingParams,
  BuildExecutiveUnderstandingParams,
  ExecutiveSummary,
  BusinessUnderstanding,
  MarketUnderstanding,
  StrategicUnderstanding,
  OpportunityUnderstanding,
  RiskUnderstanding,
  PriorityUnderstanding,
  SupportingEvidence,
  UnderstandingMetadata,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export {
  formatExecutiveUnderstandingForPrompt,
  validateSharedExecutiveUnderstanding,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingHelpers";

export { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

type CacheEntry = {
  bundle: ExecutiveUnderstandingBundle;
  expiresAt: number;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const understandingCache = new Map<string, CacheEntry>();

function buildCacheKey(params: ResolveExecutiveUnderstandingParams): string {
  return [
    params.organizationId.trim(),
    params.domainId?.trim() ?? "",
    params.discussionId?.trim() ?? "",
    params.opportunityId?.trim() ?? "",
    params.briefingId?.trim() ?? "",
  ].join(":");
}

function readCache(key: string): ExecutiveUnderstandingBundle | null {
  const entry = understandingCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    understandingCache.delete(key);
    return null;
  }

  return entry.bundle;
}

function writeCache(key: string, bundle: ExecutiveUnderstandingBundle) {
  understandingCache.set(key, {
    bundle,
    expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
  });
}

export function clearExecutiveUnderstandingCache(): void {
  understandingCache.clear();
}

function assertOrganizationId(organizationId: string | null | undefined): asserts organizationId is string {
  if (!organizationId?.trim()) {
    throw new ExecutiveUnderstandingOrganizationRequiredError();
  }
}

export async function resolveExecutiveUnderstandingBundle(
  params: ResolveExecutiveUnderstandingParams & { bypassCache?: boolean },
): Promise<ExecutiveUnderstandingBundle | null> {
  assertOrganizationId(params.organizationId);

  const cacheKey = buildCacheKey(params);

  if (!params.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const brainContext = await buildBrainContext({
    organizationId: params.organizationId,
    discussionId: params.discussionId,
    opportunityId: params.opportunityId,
    briefingId: params.briefingId,
    domainId: params.domainId,
  });

  if (!brainContext) {
    return null;
  }

  const executiveReasoning = brainContext.executiveReasoning;
  const executiveUnderstanding = buildExecutiveUnderstanding({
    organizationId: params.organizationId,
    discussionId: params.discussionId,
    brainContext,
    executiveReasoning,
  });

  const executiveStrategy = buildExecutiveStrategyFromUnderstanding({
    organizationId: params.organizationId,
    discussionId: params.discussionId,
    executiveUnderstanding,
  });

  const bundle = {
    brainContext,
    executiveReasoning,
    executiveUnderstanding,
    executiveStrategy,
  };

  writeCache(cacheKey, bundle);
  return bundle;
}

export async function getExecutiveUnderstanding(
  params: ResolveExecutiveUnderstandingParams & { bypassCache?: boolean },
): Promise<ExecutiveUnderstanding | null> {
  const bundle = await resolveExecutiveUnderstandingBundle(params);
  return bundle?.executiveUnderstanding ?? null;
}
