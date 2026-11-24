/**
 * Deterministic shared-observation reuse.
 * Freshness is measured from the actual observation or discovery timestamp.
 * A cached product set is not evidence that a category or catalog was fully listed.
 */

import { createHash } from "node:crypto";

import { ATHENA_MONITOR_FRESHNESS } from "@/services/monitor/monitorRuntime";
import {
  MONITOR_ADAPTER_VERSION,
  MONITOR_PUBLIC_SCHEMA_VERSION,
  type MonitorSelection,
  type SharedDiscoveryCoverage,
  type SharedMonitorCategory,
  type SharedMonitorSource,
  type SharedPublicObservation,
  type SharedReusePlan,
} from "@/services/monitor/monitorTypes";

export type ProductFamilyMembership = {
  categoryId: string;
  familyId: string;
};

export type DedupedProductFamily = {
  familyId: string;
  categoryIds: string[];
};

export function dedupeProductFamilies(
  membership: readonly ProductFamilyMembership[],
): DedupedProductFamily[] {
  const byFamily = new Map<string, Set<string>>();
  for (const entry of membership) {
    const categories = byFamily.get(entry.familyId) ?? new Set<string>();
    categories.add(entry.categoryId);
    byFamily.set(entry.familyId, categories);
  }
  return [...byFamily.entries()]
    .map(([familyId, categories]) => ({
      familyId,
      categoryIds: [...categories].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}

export function publicObservationContentKey(input: {
  registeredSourceId: string;
  familyId: string;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: number;
  canonicalUrl: string;
  productName: string | null;
  priceAmount: string | null;
  currency: string | null;
  colorPatternIds: string[] | null;
  colorPatternNames: string[] | null;
  distinctVariationCount: number | null;
  sizes: string[] | null;
  lengths: string[] | null;
  imageUrl: string | null;
  observedAt: string;
  categoryIds: readonly string[];
}): string {
  const material = [
    input.registeredSourceId,
    input.familyId,
    input.adapterId,
    input.adapterVersion,
    String(input.schemaVersion),
    input.canonicalUrl,
    input.productName ?? "",
    input.priceAmount ?? "",
    input.currency ?? "",
    (input.colorPatternIds ?? []).join("\u001f"),
    (input.colorPatternNames ?? []).join("\u001f"),
    input.distinctVariationCount == null ? "" : String(input.distinctVariationCount),
    (input.sizes ?? []).join("\u001f"),
    (input.lengths ?? []).join("\u001f"),
    input.imageUrl ?? "",
    input.observedAt,
    [...input.categoryIds].sort().join("\u001f"),
  ].join("\u001e");
  return createHash("sha256").update(material).digest("hex");
}

function ageMs(now: Date, timestamp: string | null): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return now.getTime() - parsed;
}

function within(now: Date, timestamp: string | null, maxAgeMs: number): boolean {
  const age = ageMs(now, timestamp);
  return age != null && age >= 0 && age <= maxAgeMs;
}

function beforeRequest(timestamp: string, requestedAt: string | null): boolean {
  if (!requestedAt) return false;
  return Date.parse(timestamp) < Date.parse(requestedAt);
}

export function selectionScopeKeys(selection: MonitorSelection): string[] {
  if (selection.mode === "whole_catalog") return ["whole_catalog"];
  const ids = selection.categoryIds ?? [];
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export function latestCoverageForScope(
  coverage: readonly SharedDiscoveryCoverage[],
  scopeKey: string,
): SharedDiscoveryCoverage | null {
  const matches = coverage.filter((item) => item.scopeKey === scopeKey);
  const indexed = matches.map((item, index) => ({ item, index }));
  indexed.sort((left, right) => {
    const byTime = right.item.discoveredAt.localeCompare(left.item.discoveredAt);
    if (byTime !== 0) return byTime;
    return right.index - left.index;
  });
  return indexed[0]?.item ?? null;
}

function observationCompatible(
  observation: SharedPublicObservation,
  source: SharedMonitorSource,
): boolean {
  return (
    observation.sourceId === source.id &&
    observation.registeredSourceId === source.registeredSourceId &&
    observation.adapterId === source.adapterId &&
    observation.adapterVersion === source.adapterVersion &&
    observation.adapterVersion === MONITOR_ADAPTER_VERSION &&
    observation.schemaVersion === MONITOR_PUBLIC_SCHEMA_VERSION
  );
}

function observationReusable(
  observation: SharedPublicObservation,
  source: SharedMonitorSource,
  now: Date,
  forceFresh: boolean,
  freshRequestedAt: string | null,
): boolean {
  if (!observationCompatible(observation, source)) return false;
  if (forceFresh && beforeRequest(observation.observedAt, freshRequestedAt)) return false;
  if (!forceFresh && !within(now, observation.observedAt, ATHENA_MONITOR_FRESHNESS.productObservationMs)) {
    return false;
  }
  if (forceFresh && !within(now, observation.observedAt, ATHENA_MONITOR_FRESHNESS.productObservationMs)) {
    return false;
  }
  return true;
}

/**
 * Force-fresh still rejects observations older than the fresh request,
 * including observations that would otherwise sit inside the freshness window.
 * It also rejects observations that are already outside that window.
 */
export function planSharedObservationReuse(input: {
  source: SharedMonitorSource;
  selection: MonitorSelection;
  categories: readonly SharedMonitorCategory[];
  coverage: readonly SharedDiscoveryCoverage[];
  observations: readonly SharedPublicObservation[];
  now: Date;
  forceFresh?: boolean;
  freshRequestedAt?: string | null;
}): SharedReusePlan {
  const forceFresh = input.forceFresh === true;
  const freshRequestedAt = input.freshRequestedAt ?? null;
  const scopeKeys = selectionScopeKeys(input.selection);
  const exactScope = scopeKeys.length > 0;
  const selectedCategories =
    input.selection.mode === "categories"
      ? input.categories.filter((category) => scopeKeys.includes(category.categoryKey))
      : [];
  const categoryListFresh =
    input.selection.mode === "whole_catalog"
      ? within(input.now, input.source.lastDiscoveredAt, ATHENA_MONITOR_FRESHNESS.categoryDiscoveryMs) &&
        !(forceFresh && input.source.lastDiscoveredAt != null && beforeRequest(input.source.lastDiscoveredAt, freshRequestedAt))
      : selectedCategories.length === scopeKeys.length &&
        selectedCategories.length > 0 &&
        selectedCategories.every(
          (category) =>
            category.discoveryStatus === "current" &&
            within(input.now, category.discoveredAt, ATHENA_MONITOR_FRESHNESS.categoryDiscoveryMs) &&
            !(forceFresh && beforeRequest(category.discoveredAt, freshRequestedAt)),
        );

  const scopeCoverage = scopeKeys.map((scopeKey) => ({
    scopeKey,
    coverage: latestCoverageForScope(input.coverage, scopeKey),
  }));
  const statuses = scopeCoverage.map((item) => item.coverage?.status ?? "missing");
  const coverageStatus = statuses.every((status) => status === "completed")
    ? "completed"
    : statuses.some((status) => status === "partial")
      ? "partial"
      : statuses.some((status) => status === "failed")
        ? "failed"
        : statuses.some((status) => status === "missing")
          ? "missing"
          : "failed";

  const coverageFresh =
    coverageStatus === "completed" &&
    scopeCoverage.every((item) => {
      const discoveredAt = item.coverage?.discoveredAt ?? null;
      if (!item.coverage) return false;
      if (
        item.coverage.adapterVersion !== input.source.adapterVersion ||
        item.coverage.schemaVersion !== MONITOR_PUBLIC_SCHEMA_VERSION
      ) {
        return false;
      }
      if (forceFresh && discoveredAt && beforeRequest(discoveredAt, freshRequestedAt)) return false;
      return within(input.now, discoveredAt, ATHENA_MONITOR_FRESHNESS.catalogDiscoveryMs);
    });

  const familyIds =
    coverageStatus === "completed"
      ? dedupeProductFamilies(
          scopeCoverage.flatMap((item) =>
            (item.coverage?.familyIds ?? []).map((familyId) => ({
              categoryId: item.scopeKey,
              familyId,
            })),
          ),
        ).map((family) => family.familyId)
      : [];

  const eligible = input.observations.filter((observation) =>
    observationReusable(observation, input.source, input.now, forceFresh, freshRequestedAt),
  );
  const newestByFamily = new Map<string, SharedPublicObservation>();
  for (const observation of eligible) {
    const current = newestByFamily.get(observation.familyId);
    if (!current || observation.observedAt > current.observedAt) {
      newestByFamily.set(observation.familyId, observation);
    }
  }

  const knownFamilies = coverageStatus === "completed" ? familyIds : [...newestByFamily.keys()];
  const reusable = knownFamilies
    .map((familyId) => newestByFamily.get(familyId))
    .filter((observation): observation is SharedPublicObservation => observation != null)
    .map((observation) => ({
      familyId: observation.familyId,
      publicObservationId: observation.id,
      observedAt: observation.observedAt,
      reused: true as const,
    }));
  const reusableIds = new Set(reusable.map((item) => item.familyId));
  const missingOrStaleFamilyIds =
    coverageStatus === "completed"
      ? familyIds.filter((familyId) => !reusableIds.has(familyId))
      : [];

  const accessCooldown =
    input.source.accessStatus === "cooldown" &&
    input.source.retryAfter != null &&
    Date.parse(input.source.retryAfter) > input.now.getTime();

  const completeEnough =
    exactScope &&
    coverageStatus === "completed" &&
    coverageFresh &&
    missingOrStaleFamilyIds.length === 0 &&
    familyIds.length === reusable.length;

  return {
    normalizedHost: input.source.normalizedHost,
    registeredSourceId: input.source.registeredSourceId,
    forceFresh,
    categoryListFresh,
    coverageStatus,
    coverageFresh,
    exactScope,
    reusable,
    missingOrStaleFamilyIds,
    networkRequestsRequired: accessCooldown ? false : !completeEnough,
    missingProductConclusionAllowed: coverageStatus === "completed" && coverageFresh && exactScope,
    accessCooldown,
  };
}
