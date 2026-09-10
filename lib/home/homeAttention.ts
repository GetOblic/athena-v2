/**
 * Deterministic Home next-action priorities. No I/O, no writes, no AI.
 */

import type { HomePipelineData } from "@/lib/home/homePipeline";
import type { HomeCapacityData } from "@/services/home/homeReadService";
import type { HomeDomainResult } from "@/services/home/homeReadService";

export const HOME_PRIORITY_LIMIT = 5;

export type HomePriorityId =
  | "trainAthena"
  | "reviewReadyOpportunities"
  | "advanceStrongProspects"
  | "workingItemsNeedingAttention"
  | "failedIntelligence"
  | "missingIntelligence"
  | "emptyPipelineAvailableCapacity"
  | "capacityFull"
  | "heldWithoutReadyIntelligence"
  | "completeDefinition"
  | "reviewFailedVisibility"
  | "establishVisibility"
  | "defineFirstAudience";

export type HomePriorityAccent =
  | "blocker"
  | "ready"
  | "strong"
  | "attention"
  | "danger"
  | "missing"
  | "capacity"
  | "define"
  | "visibility"
  | "traction";

export type HomePriorityHref =
  | "/identity"
  | "/seo"
  | "/personas"
  | "/prospects"
  | "/prospects/find"
  | `/prospects/${string}`;

export type HomePriorityItem = {
  id: HomePriorityId;
  href: HomePriorityHref;
  count: number | null;
  accent: HomePriorityAccent;
};

export type HomeAttentionDefineData = {
  brainStatus: string | null;
  hasVoice: boolean;
  hasKnowledge: boolean;
  hasWebsite: boolean;
};

export type HomePriorityInput = {
  define: HomeDomainResult<HomeAttentionDefineData | null>;
  visibility: HomeDomainResult<{ status: string } | null>;
  traction: HomeDomainResult<{ audienceCount: number }>;
  pipeline: HomeDomainResult<HomePipelineData>;
  capacity: HomeDomainResult<HomeCapacityData>;
};

/** @deprecated Use HomePriorityInput. */
export type HomeAttentionInput = HomePriorityInput;

/** @deprecated Use HomePriorityItem. */
export type HomeAttentionItem = HomePriorityItem;

/** @deprecated Use HomePriorityId. */
export type HomeAttentionId = HomePriorityId;

/** @deprecated Use HomePriorityHref. */
export type HomeAttentionHref = HomePriorityHref;

/** @deprecated Use HomePriorityItem["accent"] domain grouping is no longer used. */
export type HomeAttentionDomain =
  | "define"
  | "visibility"
  | "traction"
  | "convert";

const OPERATIONAL_PRIORITY_IDS = new Set<HomePriorityId>([
  "reviewReadyOpportunities",
  "advanceStrongProspects",
  "workingItemsNeedingAttention",
  "failedIntelligence",
  "missingIntelligence",
  "emptyPipelineAvailableCapacity",
  "capacityFull",
  "heldWithoutReadyIntelligence",
]);

function missingCore(data: HomeAttentionDefineData): boolean {
  return !data.hasVoice || !data.hasKnowledge || !data.hasWebsite;
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}

function isIdSubset(
  inner: readonly string[],
  outer: ReadonlySet<string> | readonly string[],
): boolean {
  if (inner.length === 0) return true;
  const set = outer instanceof Set ? outer : new Set(outer);
  return inner.every((id) => set.has(id));
}

export function prospectPriorityHref(ids: readonly string[]): HomePriorityHref {
  if (ids.length === 1) {
    return `/prospects/${ids[0]}`;
  }
  return "/prospects";
}

function pushLimited(
  items: HomePriorityItem[],
  item: HomePriorityItem,
): void {
  if (items.length >= HOME_PRIORITY_LIMIT) return;
  items.push(item);
}

export function buildHomePriorities(input: HomePriorityInput): HomePriorityItem[] {
  const items: HomePriorityItem[] = [];

  if (input.define.status === "ok") {
    const data = input.define.data;
    if (
      data == null ||
      (data.brainStatus !== "ready" && data.brainStatus !== "processing")
    ) {
      pushLimited(items, {
        id: "trainAthena",
        href: "/identity",
        count: null,
        accent: "blocker",
      });
    }
  }

  const pipeline =
    input.pipeline.status === "ok" ? input.pipeline.data : null;
  const capacity =
    input.capacity.status === "ok" ? input.capacity.data : null;

  let emittedReadyWork = false;
  const coveredIds = new Set<string>();

  if (pipeline && pipeline.readyCount >= 1) {
    const readyIsStrongSet = sameIdSet(
      pipeline.readyIds,
      pipeline.strongNotProgressingIds,
    );
    if (readyIsStrongSet && pipeline.strongNotProgressingCount >= 1) {
      pushLimited(items, {
        id: "advanceStrongProspects",
        href: prospectPriorityHref(pipeline.strongNotProgressingIds),
        count: pipeline.strongNotProgressingCount,
        accent: "strong",
      });
      emittedReadyWork = true;
      for (const id of pipeline.strongNotProgressingIds) coveredIds.add(id);
    } else {
      pushLimited(items, {
        id: "reviewReadyOpportunities",
        href: prospectPriorityHref(pipeline.readyIds),
        count: pipeline.readyCount,
        accent: "ready",
      });
      emittedReadyWork = true;
      for (const id of pipeline.readyIds) coveredIds.add(id);
    }
  }

  if (pipeline && pipeline.workingAttentionCount >= 1) {
    if (!isIdSubset(pipeline.workingAttentionIds, coveredIds)) {
      pushLimited(items, {
        id: "workingItemsNeedingAttention",
        href: prospectPriorityHref(pipeline.workingAttentionIds),
        count: pipeline.workingAttentionCount,
        accent: "attention",
      });
      for (const id of pipeline.workingAttentionIds) coveredIds.add(id);
    }
  }

  if (pipeline && pipeline.failedCount >= 1) {
    pushLimited(items, {
      id: "failedIntelligence",
      href: prospectPriorityHref(pipeline.failedIds),
      count: pipeline.failedCount,
      accent: "danger",
    });
    for (const id of pipeline.failedIds) coveredIds.add(id);
  }

  if (pipeline && pipeline.missingCount >= 1 && !emittedReadyWork) {
    pushLimited(items, {
      id: "missingIntelligence",
      href: prospectPriorityHref(pipeline.missingIds),
      count: pipeline.missingCount,
      accent: "missing",
    });
    for (const id of pipeline.missingIds) coveredIds.add(id);
  }

  if (
    pipeline &&
    capacity?.configured &&
    capacity.available > 0 &&
    pipeline.workingCount === 0
  ) {
    pushLimited(items, {
      id: "emptyPipelineAvailableCapacity",
      href: "/prospects/find",
      count: capacity.available,
      accent: "capacity",
    });
  }

  if (
    capacity?.configured &&
    capacity.available === 0 &&
    capacity.currentlyHeld >= capacity.listingCapacity
  ) {
    pushLimited(items, {
      id: "capacityFull",
      href: "/prospects",
      count: capacity.currentlyHeld,
      accent: "capacity",
    });
  }

  if (pipeline && pipeline.heldWithoutReadyCount >= 1) {
    if (!isIdSubset(pipeline.heldWithoutReadyIds, coveredIds)) {
      pushLimited(items, {
        id: "heldWithoutReadyIntelligence",
        href: prospectPriorityHref(pipeline.heldWithoutReadyIds),
        count: pipeline.heldWithoutReadyCount,
        accent: "capacity",
      });
    }
  }

  if (input.define.status === "ok") {
    const data = input.define.data;
    if (data?.brainStatus === "ready" && missingCore(data)) {
      pushLimited(items, {
        id: "completeDefinition",
        href: "/identity",
        count: null,
        accent: "define",
      });
    }
  }

  if (
    input.visibility.status === "ok" &&
    input.visibility.data?.status === "Processing Failed"
  ) {
    pushLimited(items, {
      id: "reviewFailedVisibility",
      href: "/seo",
      count: null,
      accent: "danger",
    });
  }

  const hasOperationalPriority = items.some((item) =>
    OPERATIONAL_PRIORITY_IDS.has(item.id),
  );

  if (
    input.visibility.status === "ok" &&
    input.visibility.data == null &&
    !hasOperationalPriority
  ) {
    pushLimited(items, {
      id: "establishVisibility",
      href: "/seo",
      count: null,
      accent: "visibility",
    });
  }

  if (
    input.traction.status === "ok" &&
    input.traction.data.audienceCount === 0 &&
    !hasOperationalPriority
  ) {
    pushLimited(items, {
      id: "defineFirstAudience",
      href: "/personas",
      count: null,
      accent: "traction",
    });
  }

  return items.slice(0, HOME_PRIORITY_LIMIT);
}

/** @deprecated Use buildHomePriorities. */
export function buildHomeAttention(
  input: HomePriorityInput,
): HomePriorityItem[] {
  return buildHomePriorities(input);
}
