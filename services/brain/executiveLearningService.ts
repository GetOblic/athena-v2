import type { ExecutiveMemory } from "@/services/brain/executiveMemoryTypes";
import {
  buildExecutiveLearning,
  ExecutiveLearningOrganizationRequiredError,
} from "@/services/brain/executiveLearningBuilder";
import type {
  BuildExecutiveLearningParams,
  ExecutiveLearningSummary,
} from "@/services/brain/executiveLearningTypes";

export {
  buildExecutiveLearning,
  ExecutiveLearningOrganizationRequiredError,
} from "@/services/brain/executiveLearningBuilder";

export type {
  BuildExecutiveLearningParams,
  ExecutiveLearningSummary,
  ExecutiveLearningEvent,
  DecisionLearning,
  DiscussionLearning,
  BriefingLearning,
  SalesLearning,
  MarketLearning,
  MarketEvidenceEntry,
  RefreshLearning,
  PatternLearning,
  PromotionCandidate,
  LearningMetadata,
  PromotionReadiness,
} from "@/services/brain/executiveLearningTypes";

export { EXECUTIVE_LEARNING_VERSION } from "@/services/brain/executiveLearningTypes";

export { computePromotionReadiness } from "@/services/brain/executiveLearningHelpers";

type CacheEntry = {
  learning: ExecutiveLearningSummary;
  expiresAt: number;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const learningCache = new Map<string, CacheEntry>();

function buildCacheKey(params: BuildExecutiveLearningParams): string {
  return [
    params.organizationId.trim(),
    params.domainId?.trim() ?? "",
    params.discussionId?.trim() ?? "",
    params.opportunityId?.trim() ?? "",
    params.briefingId?.trim() ?? "",
  ].join(":");
}

function readCache(key: string): ExecutiveLearningSummary | null {
  const entry = learningCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    learningCache.delete(key);
    return null;
  }

  return entry.learning;
}

function writeCache(key: string, learning: ExecutiveLearningSummary) {
  learningCache.set(key, {
    learning,
    expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
  });
}

export function clearExecutiveLearningCache(): void {
  learningCache.clear();
}

export async function getExecutiveLearning(
  params: BuildExecutiveLearningParams & {
    sourceMemory?: ExecutiveMemory;
    bypassCache?: boolean;
  },
): Promise<ExecutiveLearningSummary> {
  if (!params.organizationId?.trim()) {
    throw new ExecutiveLearningOrganizationRequiredError();
  }

  const cacheKey = buildCacheKey(params);

  if (!params.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const learning = await buildExecutiveLearning(params);
  writeCache(cacheKey, learning);
  return learning;
}
