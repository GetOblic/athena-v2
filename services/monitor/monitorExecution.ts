/**
 * Execution planning for a future Monitor worker.
 * Blocked sources are recorded without a network request.
 * No batch plan contains scraping code or a fetch client.
 */

import type {
  MonitorConfiguration,
  MonitorExecutionCursor,
  MonitorJob,
  MonitorProgress,
  MonitorSourceCoverage,
  MonitorTerminalStatus,
} from "@/services/monitor/monitorTypes";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import { ATHENA_MONITOR_WORKER_DEFAULTS } from "@/services/monitor/monitorRuntime";

const OPEN_COVERAGE = new Set(["pending", "discovering", "extracting"]);

export type MonitorLeaseState = "ok" | "STALE_CLAIM" | "BATCH_DEADLINE" | "EXECUTION_DEADLINE";

/**
 * Overall deadline wins over the batch bound, and the batch bound wins over the lease.
 * An expired batch is resumable. An expired overall deadline is not.
 */
export function classifyMonitorLease(input: {
  now: number;
  claimExpiresAt: string | null;
  batchDeadlineAt: string | null;
  executionDeadlineAt: string | null;
}): MonitorLeaseState {
  if (input.executionDeadlineAt && Date.parse(input.executionDeadlineAt) <= input.now) {
    return "EXECUTION_DEADLINE";
  }
  if (input.batchDeadlineAt && Date.parse(input.batchDeadlineAt) <= input.now) {
    return "BATCH_DEADLINE";
  }
  if (!input.claimExpiresAt || Date.parse(input.claimExpiresAt) <= input.now) {
    return "STALE_CLAIM";
  }
  return "ok";
}

function optionalCount(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

export function assertMonitorProgress(progress: MonitorProgress): void {
  const values = [
    progress.familiesDiscovered,
    progress.familiesAnalyzed,
    progress.familiesPersisted,
  ];
  const optional = [
    progress.categoriesSelected,
    progress.familiesExtracted,
    progress.familiesReused,
    progress.familiesMatching,
    progress.familiesFailed,
  ];
  if (progress.version !== 1 || values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  if (optional.some((value) => !optionalCount(value))) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  if (progress.phase != null && progress.phase !== "discover" && progress.phase !== "extract") {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
}

export function assertMonitorCursor(
  configuration: MonitorConfiguration,
  cursor: MonitorExecutionCursor,
): void {
  if (cursor.version !== 1 || !Array.isArray(cursor.sources)) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  for (const source of cursor.sources) {
    if (!configuration.sources.some((item) => item.sourceId === source.sourceId)) {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
    if (source.phase !== "discover" && source.phase !== "extract") {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
    if (!Number.isInteger(source.nextIndex) || source.nextIndex < 0) {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
    if (source.familyUrls && (typeof source.familyUrls !== "object" || Array.isArray(source.familyUrls))) {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
    if (source.familyCategories && (typeof source.familyCategories !== "object" || Array.isArray(source.familyCategories))) {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
  }
}

export function emptyMonitorProgress(): MonitorProgress {
  return {
    version: 1,
    familiesDiscovered: 0,
    familiesAnalyzed: 0,
    familiesPersisted: 0,
    currentSourceId: null,
    phase: null,
    categoriesSelected: 0,
    familiesExtracted: 0,
    familiesReused: 0,
    familiesMatching: 0,
    familiesFailed: 0,
    updatedAt: null,
  };
}

/**
 * A completed source must show finished discovery and must not drop failed families.
 * Historical rows without discovery evidence are incomplete.
 */
export function completedSourceIsAccounted(source: MonitorSourceCoverage): boolean {
  if (source.status !== "completed") return false;
  if (source.discoveryStatus !== "completed") return false;
  if (!source.discoveryCoverageId || source.discoveryCoverageId.trim().length === 0) return false;
  if ((source.failedFamilyIds?.length ?? 0) > 0) return false;
  if ((source.familiesFailed ?? 0) > 0) return false;
  if (
    typeof source.familiesDiscovered === "number" &&
    source.familiesAnalyzed < source.familiesDiscovered
  ) {
    return false;
  }
  return true;
}

/**
 * 1 means every required source is fully accounted for.
 * Discovery that is still open, or extraction that has not caught up, stays below 1.
 */
export function monitorReportedCompletion(input: {
  progress: MonitorProgress;
  sourceCoverage: readonly MonitorSourceCoverage[];
}): { ratio: number; discoveryComplete: boolean; extractionComplete: boolean } {
  const required = input.sourceCoverage.filter((source) => source.status !== "blocked");
  const discoveryComplete =
    required.length > 0 &&
    required.every((source) => source.discoveryStatus === "completed" && Boolean(source.discoveryCoverageId));
  const extractionComplete = required.length > 0 && required.every((source) => completedSourceIsAccounted(source));
  if (extractionComplete && discoveryComplete && (input.progress.familiesFailed ?? 0) === 0) {
    return { ratio: 1, discoveryComplete: true, extractionComplete: true };
  }
  const discovered = input.progress.familiesDiscovered;
  const analyzed = input.progress.familiesAnalyzed;
  const raw = discovered <= 0 ? 0 : analyzed / discovered;
  return {
    ratio: Math.min(raw, 0.99),
    discoveryComplete,
    extractionComplete: false,
  };
}

export function buildInitialSourceCoverage(
  configuration: MonitorConfiguration,
): MonitorSourceCoverage[] {
  return configuration.sources.map((source) => {
    const defined = getMonitorSource(source.sourceId);
    const blocked = defined?.productionAccess === "blocked";
    return {
      sourceId: source.sourceId,
      status: blocked ? "blocked" : "pending",
      selection: source.selection,
      errorCode: blocked ? "PRODUCTION_ACCESS_BLOCKED" : null,
      familiesAnalyzed: 0,
      discoveryStatus: null,
      discoveryScopeKey:
        source.selection.mode === "whole_catalog"
          ? "whole_catalog"
          : (source.selection.categoryIds ?? []).join(","),
      discoveryCoverageId: null,
      discoveredAt: null,
    };
  });
}

/**
 * Force-fresh freshness is fixed to the execution start.
 * A later claim or batch must not move it, or this execution's own
 * coverage and observations fall behind the cutoff.
 */
export function monitorExecutionFreshnessCutoff(
  job: Pick<MonitorJob, "startedAt" | "createdAt">,
  forceFresh: boolean,
): string | null {
  if (!forceFresh) return null;
  return job.startedAt ?? job.createdAt;
}

export type DiscoveryContinuationKind = "same_page" | "forward" | "complete" | "no_progress";

/**
 * Same-page continuation adds families without moving the resume URL.
 * Forward pagination moves the resume URL.
 * A repeated resume URL with no new family is not progress.
 */
export function classifyDiscoveryContinuation(input: {
  accumulatedFamilyIds: readonly string[];
  returnedFamilyIds: readonly string[];
  previousResumeUrl: string | null;
  nextResumeUrl: string | null;
  done: boolean;
  errorCode?: string | null;
}): DiscoveryContinuationKind {
  if (input.done) return "complete";
  if (input.errorCode) return "forward";
  const known = new Set(input.accumulatedFamilyIds);
  const added = input.returnedFamilyIds.some((familyId) => !known.has(familyId));
  const sameResume = (input.nextResumeUrl ?? null) === (input.previousResumeUrl ?? null);
  if (!added && sameResume) return "no_progress";
  if (added && sameResume) return "same_page";
  return "forward";
}

export function buildInitialCursor(
  configuration: MonitorConfiguration,
): MonitorExecutionCursor {
  return {
    version: 1,
    sources: configuration.sources
      .filter((source) => getMonitorSource(source.sourceId)?.productionAccess === "feasible")
      .map((source) => ({
        sourceId: source.sourceId,
        phase: "discover" as const,
        nextIndex: 0,
        categoryUrl:
          source.selection.mode === "categories"
            ? (source.selection.categoryUrls[0] ?? null)
            : null,
      })),
  };
}

export function alignCoverageToSnapshot(
  configuration: MonitorConfiguration,
  coverage: readonly MonitorSourceCoverage[],
): MonitorSourceCoverage[] {
  return configuration.sources.map((source) => {
    const current = coverage.find((item) => item.sourceId === source.sourceId);
    const familiesAnalyzed = current?.familiesAnalyzed ?? 0;
    return {
      sourceId: source.sourceId,
      status: current?.status ?? "pending",
      selection: source.selection,
      errorCode: current?.errorCode ?? null,
      familiesAnalyzed:
        Number.isInteger(familiesAnalyzed) && familiesAnalyzed >= 0 ? familiesAnalyzed : 0,
      discoveryStatus: current?.discoveryStatus ?? null,
      discoveryScopeKey: current?.discoveryScopeKey ?? null,
      discoveryCoverageId: current?.discoveryCoverageId ?? null,
      discoveredAt: current?.discoveredAt ?? null,
      familiesDiscovered: current?.familiesDiscovered,
      familiesExtracted: current?.familiesExtracted,
      familiesReused: current?.familiesReused,
      familiesMatching: current?.familiesMatching,
      familiesFailed: current?.familiesFailed,
      failedFamilyIds: current?.failedFamilyIds ? [...current.failedFamilyIds] : undefined,
    };
  });
}

export function blockUnfinishedCoverage(
  coverage: readonly MonitorSourceCoverage[],
  errorCode: string,
): MonitorSourceCoverage[] {
  return coverage.map((source) => {
    if (source.status === "completed") return source;
    return {
      ...source,
      status: "blocked",
      errorCode,
    };
  });
}

export function deriveMonitorTerminalStatus(
  coverage: readonly MonitorSourceCoverage[],
): MonitorTerminalStatus | null {
  if (coverage.length === 0) return null;
  if (coverage.some((source) => OPEN_COVERAGE.has(source.status))) return null;
  const statuses = new Set(coverage.map((source) => source.status));
  if (statuses.size === 1) {
    const only = coverage[0]?.status;
    if (
      only === "completed" ||
      only === "partial" ||
      only === "failed" ||
      only === "blocked" ||
      only === "cancelled"
    ) {
      return only === "partial" ? "partial" : only;
    }
  }
  if (coverage.some((source) => source.status === "completed" || source.status === "partial")) {
    return "partial";
  }
  if (coverage.some((source) => source.status === "failed")) return "failed";
  if (coverage.some((source) => source.status === "blocked")) return "blocked";
  if (coverage.some((source) => source.status === "cancelled")) return "cancelled";
  return "failed";
}

export type MonitorBatchPlan =
  | {
      action: "extract";
      sourceId: string;
      phase: "discover" | "extract";
      nextIndex: number;
      limit: number;
      categoryUrl: string | null;
      requestTimeoutMs: number;
      batchDeadlineAt: string | null;
      executionDeadlineAt: string | null;
    }
  | {
      action: "yield";
      reason: "BATCH_DEADLINE";
    }
  | {
      action: "stop";
      status: MonitorTerminalStatus;
      reason: string;
    };

export function planMonitorExtractionBatch(job: MonitorJob, now = Date.now()): MonitorBatchPlan {
  if (job.cancellationRequestedAt) {
    return { action: "stop", status: "cancelled", reason: "CANCELLATION_REQUESTED" };
  }
  if (job.batchDeadlineAt && Date.parse(job.batchDeadlineAt) - now <= ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs) {
    return { action: "yield", reason: "BATCH_DEADLINE" };
  }
  const next = job.sourceCoverage.find((source) => OPEN_COVERAGE.has(source.status));
  if (!next) {
    const status = deriveMonitorTerminalStatus(job.sourceCoverage) ?? "failed";
    return { action: "stop", status, reason: "NO_READY_SOURCE" };
  }
  const defined = getMonitorSource(next.sourceId);
  if (defined?.productionAccess === "blocked") {
    return { action: "stop", status: "blocked", reason: "PRODUCTION_ACCESS_BLOCKED" };
  }
  const cursor = job.executionCursor.sources.find((source) => source.sourceId === next.sourceId);
  return {
    action: "extract",
    sourceId: next.sourceId,
    phase: cursor?.phase ?? "discover",
    nextIndex: cursor?.nextIndex ?? 0,
    limit: ATHENA_MONITOR_WORKER_DEFAULTS.batchSize,
    categoryUrl: cursor?.categoryUrl ?? null,
    requestTimeoutMs: job.requestTimeoutMs ?? ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs,
    batchDeadlineAt: job.batchDeadlineAt,
    executionDeadlineAt: job.executionDeadlineAt,
  };
}
