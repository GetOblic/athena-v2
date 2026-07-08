import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import {
  buildExecutiveMemory,
  ExecutiveMemoryOrganizationRequiredError,
} from "@/services/brain/executiveMemoryBuilder";
import type {
  BuildExecutiveMemoryParams,
  ExecutiveMemory,
  ExecutiveMemorySourceContext,
} from "@/services/brain/executiveMemoryTypes";

export {
  buildExecutiveMemory,
  ExecutiveMemoryOrganizationRequiredError,
} from "@/services/brain/executiveMemoryBuilder";

export type {
  BuildExecutiveMemoryParams,
  ExecutiveMemory,
  MemoryMetadata,
  BusinessKnowledge,
  MarketKnowledge,
  AudienceKnowledge,
  PainPointKnowledgeEntry,
  BuyingSignalKnowledgeEntry,
  TerminologyKnowledgeEntry,
  CompetitorKnowledgeEntry,
  DecisionKnowledge,
  ContentKnowledge,
  PatternKnowledge,
  PerformanceKnowledge,
} from "@/services/brain/executiveMemoryTypes";

export {
  EXECUTIVE_MEMORY_VERSION,
  MAX_EXECUTIVE_MEMORY_ANALYSES,
} from "@/services/brain/executiveMemoryTypes";

type CacheEntry = {
  memory: ExecutiveMemory;
  expiresAt: number;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const memoryCache = new Map<string, CacheEntry>();

function buildCacheKey(params: BuildExecutiveMemoryParams): string {
  return [
    params.organizationId.trim(),
    params.domainId?.trim() ?? "",
    params.discussionId?.trim() ?? "",
  ].join(":");
}

function readCache(key: string): ExecutiveMemory | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.memory;
}

function writeCache(key: string, memory: ExecutiveMemory) {
  memoryCache.set(key, {
    memory,
    expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
  });
}

export function clearExecutiveMemoryCache(): void {
  memoryCache.clear();
}

export async function getExecutiveMemory(
  params: BuildExecutiveMemoryParams & {
    sourceContext?: ExecutiveMemorySourceContext;
    bypassCache?: boolean;
  },
): Promise<ExecutiveMemory> {
  if (!params.organizationId?.trim()) {
    throw new ExecutiveMemoryOrganizationRequiredError();
  }

  const cacheKey = buildCacheKey(params);

  if (!params.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const memory = await buildExecutiveMemory(params);
  writeCache(cacheKey, memory);
  return memory;
}
