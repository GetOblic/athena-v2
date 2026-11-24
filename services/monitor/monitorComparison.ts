/**
 * Deterministic comparison between two Monitor executions.
 * Missing products require explicit completed discovery evidence for the same scope.
 * A completed job status without that evidence does not prove the catalog was listed.
 * Different criterion identities are not reported as product changes.
 * Different currencies are not reported as price changes.
 */

import { criteriaDeepEqual, criteriaIdentityEqual } from "@/services/monitor/monitorCriterion";
import { selectionsEqual } from "@/services/monitor/monitorConfig";
import { priceCents } from "@/services/monitor/monitorObservation";
import type {
  MonitorConfiguration,
  MonitorJob,
  MonitorObservation,
  MonitorSourceCoverage,
} from "@/services/monitor/monitorTypes";

export type MonitorVariationChange = {
  familyId: string;
  colorPatternIds: string[];
};

export type MonitorPriceChange = {
  familyId: string;
  from: string;
  to: string;
  currency: string;
};

export type MonitorPriceSkipped = {
  familyId: string;
  reason: "currency_mismatch" | "unknown_price";
};

export type MonitorSourceComparison = {
  sourceId: string;
  comparable: boolean;
  reason: string | null;
  newlyObserved: string[];
  thresholdCrossedUp: string[];
  thresholdCrossedDown: string[];
  variationsAdded: MonitorVariationChange[];
  variationsRemoved: MonitorVariationChange[];
  priceChanges: MonitorPriceChange[];
  priceComparisonSkipped: MonitorPriceSkipped[];
  unchanged: string[];
  notFound: string[];
};

export type MonitorComparison = {
  compatible: boolean;
  criterionCompatible: boolean;
  thresholdComparison: boolean;
  reason: string | null;
  sources: MonitorSourceComparison[];
};

export type MonitorExecutionView = {
  job: Pick<MonitorJob, "status" | "configurationSnapshot" | "sourceCoverage">;
  observations: readonly MonitorObservation[];
};

function sorted(ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function emptySource(sourceId: string, reason: string): MonitorSourceComparison {
  return {
    sourceId,
    comparable: false,
    reason,
    newlyObserved: [],
    thresholdCrossedUp: [],
    thresholdCrossedDown: [],
    variationsAdded: [],
    variationsRemoved: [],
    priceChanges: [],
    priceComparisonSkipped: [],
    unchanged: [],
    notFound: [],
  };
}

function hasCompletedDiscoveryEvidence(coverage: MonitorSourceCoverage | null): boolean {
  return (
    coverage?.discoveryStatus === "completed" &&
    typeof coverage.discoveryCoverageId === "string" &&
    coverage.discoveryCoverageId.trim().length > 0 &&
    (coverage.failedFamilyIds?.length ?? 0) === 0
  );
}

function coverageFor(
  coverage: readonly MonitorSourceCoverage[],
  sourceId: string,
): MonitorSourceCoverage | null {
  return coverage.find((source) => source.sourceId === sourceId) ?? null;
}

function sourceById(configuration: MonitorConfiguration, sourceId: string) {
  return configuration.sources.find((source) => source.sourceId === sourceId) ?? null;
}

function incomparabilityReason(
  baseline: MonitorExecutionView,
  current: MonitorExecutionView,
  sourceId: string,
): string | null {
  const baselineSource = sourceById(baseline.job.configurationSnapshot, sourceId);
  const currentSource = sourceById(current.job.configurationSnapshot, sourceId);
  if (!baselineSource || !currentSource) return "source_not_in_both_configurations";
  if (!selectionsEqual(baselineSource.selection, currentSource.selection)) {
    return "scope_changed";
  }
  const baselineCoverage = coverageFor(baseline.job.sourceCoverage, sourceId);
  const currentCoverage = coverageFor(current.job.sourceCoverage, sourceId);
  const statuses = [baselineCoverage?.status, currentCoverage?.status];
  if (statuses.some((status) => status == null)) return "coverage_incomplete";
  if (baseline.job.status === "cancelled" || current.job.status === "cancelled") {
    return "job_cancelled";
  }
  if (statuses.some((status) => status === "blocked") || baseline.job.status === "blocked" || current.job.status === "blocked") {
    return "source_blocked";
  }
  if (statuses.some((status) => status === "failed") || baseline.job.status === "failed" || current.job.status === "failed") {
    return "source_failed";
  }
  if (statuses.some((status) => status === "cancelled")) return "job_cancelled";
  // Missing, partial, and failed discovery all fail closed.
  // A completed job status is not evidence that the catalog was fully listed.
  if (!hasCompletedDiscoveryEvidence(baselineCoverage) || !hasCompletedDiscoveryEvidence(currentCoverage)) {
    return "coverage_incomplete";
  }
  const baselineScope = baselineCoverage?.discoveryScopeKey;
  const currentScope = currentCoverage?.discoveryScopeKey;
  if (baselineScope && currentScope && baselineScope !== currentScope) {
    return "scope_changed";
  }
  if (statuses.some((status) => status !== "completed")) return "coverage_incomplete";
  return null;
}

function colorSet(observation: MonitorObservation): string[] | null {
  return observation.payload.colorPatternIds;
}

function setDifference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return sorted(left.filter((item) => !rightSet.has(item)));
}

function compareSource(
  sourceId: string,
  baseline: MonitorExecutionView,
  current: MonitorExecutionView,
  thresholdComparison: boolean,
): MonitorSourceComparison {
  const reason = incomparabilityReason(baseline, current, sourceId);
  if (reason) return emptySource(sourceId, reason);

  const baselineRows = new Map(
    baseline.observations
      .filter((observation) => observation.sourceId === sourceId)
      .map((observation) => [observation.familyId, observation]),
  );
  const currentRows = new Map(
    current.observations
      .filter((observation) => observation.sourceId === sourceId)
      .map((observation) => [observation.familyId, observation]),
  );

  const newlyObserved: string[] = [];
  const thresholdCrossedUp: string[] = [];
  const thresholdCrossedDown: string[] = [];
  const variationsAdded: MonitorVariationChange[] = [];
  const variationsRemoved: MonitorVariationChange[] = [];
  const priceChanges: MonitorPriceChange[] = [];
  const priceComparisonSkipped: MonitorPriceSkipped[] = [];
  const unchanged: string[] = [];
  const notFound: string[] = [];

  for (const familyId of baselineRows.keys()) {
    if (!currentRows.has(familyId)) notFound.push(familyId);
  }

  for (const [familyId, currentObservation] of currentRows) {
    const previous = baselineRows.get(familyId);
    if (!previous) {
      newlyObserved.push(familyId);
      continue;
    }

    if (
      previous.publicObservationId &&
      previous.publicObservationId === currentObservation.publicObservationId
    ) {
      unchanged.push(familyId);
      continue;
    }

    let changed = false;
    let currencyMismatch = false;
    if (thresholdComparison && previous.thresholdMatch !== currentObservation.thresholdMatch) {
      changed = true;
      if (currentObservation.thresholdMatch === true && previous.thresholdMatch !== true) {
        thresholdCrossedUp.push(familyId);
      }
      if (previous.thresholdMatch === true && currentObservation.thresholdMatch !== true) {
        thresholdCrossedDown.push(familyId);
      }
    }

    const previousColors = colorSet(previous);
    const currentColors = colorSet(currentObservation);
    if (previousColors && currentColors) {
      const added = setDifference(currentColors, previousColors);
      const removed = setDifference(previousColors, currentColors);
      if (added.length > 0) {
        changed = true;
        variationsAdded.push({ familyId, colorPatternIds: added });
      }
      if (removed.length > 0) {
        changed = true;
        variationsRemoved.push({ familyId, colorPatternIds: removed });
      }
    }

    const previousPrice = previous.payload.price;
    const currentPrice = currentObservation.payload.price;
    if (!previousPrice.amount || !currentPrice.amount || !previousPrice.currency || !currentPrice.currency) {
      priceComparisonSkipped.push({ familyId, reason: "unknown_price" });
    } else if (previousPrice.currency !== currentPrice.currency) {
      currencyMismatch = true;
      priceComparisonSkipped.push({ familyId, reason: "currency_mismatch" });
    } else {
      const fromCents = priceCents(previousPrice.amount);
      const toCents = priceCents(currentPrice.amount);
      if (fromCents == null || toCents == null) {
        priceComparisonSkipped.push({ familyId, reason: "unknown_price" });
      } else if (fromCents !== toCents) {
        changed = true;
        priceChanges.push({
          familyId,
          from: previousPrice.amount,
          to: currentPrice.amount,
          currency: currentPrice.currency,
        });
      }
    }

    if (!changed && !currencyMismatch) unchanged.push(familyId);
  }

  return {
    sourceId,
    comparable: true,
    reason: null,
    newlyObserved: sorted(newlyObserved),
    thresholdCrossedUp: sorted(thresholdCrossedUp),
    thresholdCrossedDown: sorted(thresholdCrossedDown),
    variationsAdded,
    variationsRemoved,
    priceChanges,
    priceComparisonSkipped,
    unchanged: sorted(unchanged),
    notFound: sorted(notFound),
  };
}

export function compareMonitorExecutions(
  baseline: MonitorExecutionView,
  current: MonitorExecutionView,
): MonitorComparison {
  const baselineCriterion = baseline.job.configurationSnapshot.criterion;
  const currentCriterion = current.job.configurationSnapshot.criterion;
  const sourceIds = sorted(
    new Set([
      ...baseline.job.configurationSnapshot.sources.map((source) => source.sourceId),
      ...current.job.configurationSnapshot.sources.map((source) => source.sourceId),
    ]),
  );

  if (!criteriaIdentityEqual(baselineCriterion, currentCriterion)) {
    return {
      compatible: false,
      criterionCompatible: false,
      thresholdComparison: false,
      reason: "criterion_changed",
      sources: sourceIds.map((sourceId) => emptySource(sourceId, "criterion_changed")),
    };
  }

  const thresholdComparison = criteriaDeepEqual(baselineCriterion, currentCriterion);
  const sources = sourceIds.map((sourceId) =>
    compareSource(sourceId, baseline, current, thresholdComparison),
  );
  return {
    compatible: sources.some((source) => source.comparable),
    criterionCompatible: true,
    thresholdComparison,
    reason: thresholdComparison ? null : "threshold_differs",
    sources,
  };
}

export function refilterStoredObservations<T extends {
  id: string;
  sourceId: string;
  familyId: string;
  thresholdMatch: boolean | null;
  payload: { distinctVariationCount: number | null };
}>(
  observations: readonly T[],
  minimum: number,
  match: (distinctVariationCount: number | null, minimum: number) => boolean | null,
): Array<{
  observationId: string;
  sourceId: string;
  familyId: string;
  distinctVariationCount: number | null;
  storedThresholdMatch: boolean | null;
  thresholdMatch: boolean | null;
}> {
  return observations.map((observation) => ({
    observationId: observation.id,
    sourceId: observation.sourceId,
    familyId: observation.familyId,
    distinctVariationCount: observation.payload.distinctVariationCount,
    storedThresholdMatch: observation.thresholdMatch,
    thresholdMatch: match(observation.payload.distinctVariationCount, minimum),
  }));
}
