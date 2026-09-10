/**
 * Pure Home domain-state derivation. No I/O, no writes, no AI.
 */

import type { HomePipelineData } from "@/lib/home/homePipeline";
import type { HomePriorityInput } from "@/lib/home/homeAttention";
import type {
  HomeCapacityData,
  HomeDomainResult,
  HomeIdentityRow,
  HomeSeoLatest,
  HomeSnapshot,
  HomeTractionData,
} from "@/services/home/homeReadService";

export type CoreFieldPresence = {
  hasVoice: boolean;
  hasKnowledge: boolean;
  hasWebsite: boolean;
};

export type DefineKind = "unknown" | "needs_setup" | "in_progress" | "ready";

export type DefineState = {
  kind: DefineKind;
  isTraining: boolean;
  greetingName: string | null;
  lastTrained: string | null;
  lastDeepScrapeAt: string | null;
  missing: CoreFieldPresence;
};

export type VisibilityKind =
  | "unknown"
  | "none"
  | "processing"
  | "ready"
  | "needs_attention";

export type VisibilityState = {
  kind: VisibilityKind;
  name: string | null;
  generationType: HomeSeoLatest["generationType"] | null;
  dateValue: string | null;
};

export type TractionKind = "unknown" | "none" | "one" | "many";

export type TractionState = {
  kind: TractionKind;
  audienceCount: number | null;
};

export type ConvertKind = "unknown" | "none" | "active";

export type ConvertCta = "open" | "unavailable";

export type ConvertState = {
  kind: ConvertKind;
  workingCount: number | null;
  readyCount: number | null;
  missingCount: number | null;
  inProgressCount: number | null;
  failedCount: number | null;
  strongCount: number | null;
  newCount: number | null;
  reviewingCount: number | null;
  followUpCount: number | null;
  cta: ConvertCta;
};

export type CapacityKind = "unknown" | "unconfigured" | "configured";

export type CapacityState =
  | { kind: "unknown" }
  | { kind: "unconfigured" }
  | {
      kind: "configured";
      listingCapacity: number;
      currentlyHeld: number;
      available: number;
      claiming: number | null;
      linked: number | null;
      remoteMissing: number | null;
    };

export function coreFieldPresence(
  row: HomeIdentityRow | null,
): CoreFieldPresence {
  return {
    hasVoice: Boolean(row?.aboutYou?.trim()),
    hasKnowledge: Boolean(row?.expertise?.trim()),
    hasWebsite: Boolean(row?.website?.trim()),
  };
}

export function hasAnyCoreField(presence: CoreFieldPresence): boolean {
  return presence.hasVoice || presence.hasKnowledge || presence.hasWebsite;
}

export function hasMissingCoreField(presence: CoreFieldPresence): boolean {
  return !presence.hasVoice || !presence.hasKnowledge || !presence.hasWebsite;
}

export function deriveDefineState(
  result: HomeDomainResult<HomeIdentityRow | null>,
): DefineState {
  if (result.status === "error") {
    return {
      kind: "unknown",
      isTraining: false,
      greetingName: null,
      lastTrained: null,
      lastDeepScrapeAt: null,
      missing: { hasVoice: false, hasKnowledge: false, hasWebsite: false },
    };
  }

  const row = result.data;
  const missing = coreFieldPresence(row);
  const greetingName = row?.greetingName?.trim() || null;
  const lastTrained = row?.brainLastUpdated ?? null;
  const lastDeepScrapeAt = row?.lastDeepScrapeAt ?? null;

  if (!row) {
    return {
      kind: "needs_setup",
      isTraining: false,
      greetingName,
      lastTrained: null,
      lastDeepScrapeAt: null,
      missing,
    };
  }

  if (row.brainStatus === "ready") {
    return {
      kind: "ready",
      isTraining: false,
      greetingName,
      lastTrained,
      lastDeepScrapeAt,
      missing,
    };
  }

  if (row.brainStatus === "processing" || hasAnyCoreField(missing)) {
    return {
      kind: "in_progress",
      isTraining: row.brainStatus === "processing",
      greetingName,
      lastTrained,
      lastDeepScrapeAt,
      missing,
    };
  }

  return {
    kind: "needs_setup",
    isTraining: false,
    greetingName,
    lastTrained,
    lastDeepScrapeAt,
    missing,
  };
}

export function deriveVisibilityState(
  result: HomeDomainResult<HomeSeoLatest | null>,
): VisibilityState {
  if (result.status === "error") {
    return {
      kind: "unknown",
      name: null,
      generationType: null,
      dateValue: null,
    };
  }

  const latest = result.data;
  if (!latest) {
    return {
      kind: "none",
      name: null,
      generationType: null,
      dateValue: null,
    };
  }

  const dateValue = latest.updatedAt || latest.createdAt || null;
  const base = {
    name: latest.name,
    generationType: latest.generationType,
    dateValue,
  };

  if (latest.status === "Ready") {
    return { kind: "ready", ...base };
  }
  if (latest.status === "Processing Failed") {
    return { kind: "needs_attention", ...base };
  }
  return { kind: "processing", ...base };
}

export function deriveTractionState(
  result: HomeDomainResult<HomeTractionData>,
): TractionState {
  if (result.status === "error") {
    return { kind: "unknown", audienceCount: null };
  }

  const audienceCount = result.data.audienceCount;
  if (audienceCount === 0) return { kind: "none", audienceCount };
  if (audienceCount === 1) return { kind: "one", audienceCount };
  return { kind: "many", audienceCount };
}

export function deriveConvertState(
  result: HomeDomainResult<HomePipelineData>,
): ConvertState {
  if (result.status === "error") {
    return {
      kind: "unknown",
      workingCount: null,
      readyCount: null,
      missingCount: null,
      inProgressCount: null,
      failedCount: null,
      strongCount: null,
      newCount: null,
      reviewingCount: null,
      followUpCount: null,
      cta: "unavailable",
    };
  }

  const data = result.data;
  if (data.workingCount === 0) {
    return {
      kind: "none",
      workingCount: 0,
      readyCount: data.readyCount,
      missingCount: data.missingCount,
      inProgressCount: data.inProgressCount,
      failedCount: data.failedCount,
      strongCount: data.strongCount,
      newCount: data.newCount,
      reviewingCount: data.reviewingCount,
      followUpCount: data.followUpCount,
      cta: "open",
    };
  }

  return {
    kind: "active",
    workingCount: data.workingCount,
    readyCount: data.readyCount,
    missingCount: data.missingCount,
    inProgressCount: data.inProgressCount,
    failedCount: data.failedCount,
    strongCount: data.strongCount,
    newCount: data.newCount,
    reviewingCount: data.reviewingCount,
    followUpCount: data.followUpCount,
    cta: "open",
  };
}

export function deriveCapacityState(
  result: HomeDomainResult<HomeCapacityData>,
): CapacityState {
  if (result.status === "error") {
    return { kind: "unknown" };
  }
  if (!result.data.configured) {
    return { kind: "unconfigured" };
  }
  return {
    kind: "configured",
    listingCapacity: result.data.listingCapacity,
    currentlyHeld: result.data.currentlyHeld,
    available: result.data.available,
    claiming: result.data.claiming,
    linked: result.data.linked,
    remoteMissing: result.data.remoteMissing,
  };
}

export function toHomePriorityInput(snapshot: HomeSnapshot): HomePriorityInput {
  const define: HomePriorityInput["define"] =
    snapshot.define.status === "error"
      ? { status: "error" }
      : snapshot.define.data == null
        ? { status: "ok", data: null }
        : {
            status: "ok",
            data: {
              brainStatus: snapshot.define.data.brainStatus,
              ...coreFieldPresence(snapshot.define.data),
            },
          };

  const visibility: HomePriorityInput["visibility"] =
    snapshot.visibility.status === "error"
      ? { status: "error" }
      : {
          status: "ok",
          data: snapshot.visibility.data
            ? { status: snapshot.visibility.data.status }
            : null,
        };

  const traction: HomePriorityInput["traction"] =
    snapshot.traction.status === "error"
      ? { status: "error" }
      : { status: "ok", data: snapshot.traction.data };

  const pipeline: HomePriorityInput["pipeline"] =
    snapshot.convert.status === "error"
      ? { status: "error" }
      : { status: "ok", data: snapshot.convert.data };

  const capacity: HomePriorityInput["capacity"] =
    snapshot.capacity.status === "error"
      ? { status: "error" }
      : { status: "ok", data: snapshot.capacity.data };

  return { define, visibility, traction, pipeline, capacity };
}

/** @deprecated Use toHomePriorityInput. */
export function toHomeAttentionInput(snapshot: HomeSnapshot): HomePriorityInput {
  return toHomePriorityInput(snapshot);
}

export function allHomeDomainsErrored(snapshot: HomeSnapshot): boolean {
  return (
    snapshot.define.status === "error" &&
    snapshot.visibility.status === "error" &&
    snapshot.traction.status === "error" &&
    snapshot.convert.status === "error" &&
    snapshot.capacity.status === "error"
  );
}
