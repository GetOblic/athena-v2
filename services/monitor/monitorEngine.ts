/**
 * Durable Monitor execution for one claimed job.
 * Discovery and extraction cursors are persisted between batches.
 * Interrupted work stays unfinished. Cancelled work stays terminal.
 */

import { matchMonitorCriterion } from "@/services/monitor/monitorCriterion";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  completedSourceIsAccounted,
  deriveMonitorTerminalStatus,
  type MonitorBatchPlan,
} from "@/services/monitor/monitorExecution";
import type { MonitorResourceTracker } from "@/services/monitor/monitorHttp";
import type { MonitorPageFetch } from "@/services/monitor/monitorAdapter";
import { productionAdapterFor } from "@/services/monitor/monitorRegistry";
import { latestCoverageForScope, planSharedObservationReuse } from "@/services/monitor/monitorReuse";
import { ATHENA_MONITOR_FRESHNESS, ATHENA_MONITOR_WORKER_DEFAULTS } from "@/services/monitor/monitorRuntime";
import type { MonitorService } from "@/services/monitor/monitorService";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import type { MonitorStore } from "@/services/monitor/monitorStore";
import { categoryKeyFromUrl } from "@/services/monitor/monitorWebsiteIdentity";
import {
  MONITOR_ADAPTER_VERSION,
  MONITOR_PUBLIC_SCHEMA_VERSION,
  isTerminalMonitorStatus,
  type MonitorExecutionCursor,
  type MonitorExecutionCursorSource,
  type MonitorJob,
  type MonitorProgress,
  type MonitorSelection,
  type MonitorSourceConfiguration,
  type MonitorSourceCoverage,
  type SharedDiscoveryCoverage,
  type SharedMonitorCategory,
  type SharedMonitorSource,
} from "@/services/monitor/monitorTypes";

export type MonitorExecutionOutcome =
  | "completed"
  | "partial"
  | "failed"
  | "blocked"
  | "cancelled"
  | "yielded"
  | "interrupted";

type ScopeWork = {
  kind: "category" | "whole_catalog";
  key: string;
  canonicalUrl: string;
  categoryUrls: string[];
};

const OPEN = new Set(["pending", "discovering", "extracting"]);

function cursorFor(job: MonitorJob, sourceId: string): MonitorExecutionCursorSource {
  return (
    job.executionCursor.sources.find((source) => source.sourceId === sourceId) ?? {
      sourceId,
      phase: "discover",
      nextIndex: 0,
      categoryUrl: null,
    }
  );
}

function withCursor(job: MonitorJob, next: MonitorExecutionCursorSource): MonitorExecutionCursor {
  const others = job.executionCursor.sources.filter((source) => source.sourceId !== next.sourceId);
  return { version: 1, sources: [...others, next] };
}

function withCoverage(job: MonitorJob, sourceId: string, patch: Partial<MonitorSourceCoverage>): MonitorSourceCoverage[] {
  return job.sourceCoverage.map((source) => (source.sourceId === sourceId ? { ...source, ...patch } : source));
}

function progressFrom(job: MonitorJob, now: string, patch: Partial<MonitorProgress> = {}): MonitorProgress {
  const coverage = job.sourceCoverage;
  const sum = (read: (source: MonitorSourceCoverage) => number | undefined) =>
    coverage.reduce((total, source) => total + (read(source) ?? 0), 0);
  return {
    version: 1,
    familiesDiscovered: patch.familiesDiscovered ?? sum((source) => source.familiesDiscovered),
    familiesAnalyzed: patch.familiesAnalyzed ?? sum((source) => source.familiesAnalyzed),
    familiesPersisted: patch.familiesPersisted ?? job.progress.familiesPersisted,
    currentSourceId: patch.currentSourceId === undefined ? (job.progress.currentSourceId ?? null) : patch.currentSourceId,
    phase: patch.phase === undefined ? (job.progress.phase ?? null) : patch.phase,
    categoriesSelected: patch.categoriesSelected ?? job.progress.categoriesSelected ?? 0,
    familiesExtracted: patch.familiesExtracted ?? sum((source) => source.familiesExtracted),
    familiesReused: patch.familiesReused ?? sum((source) => source.familiesReused),
    familiesMatching: patch.familiesMatching ?? sum((source) => source.familiesMatching),
    familiesFailed: patch.familiesFailed ?? sum((source) => source.familiesFailed),
    updatedAt: now,
    ...(job.progress.forceFresh === true ? { forceFresh: true as const } : {}),
  };
}

function scopeKeyFor(selection: MonitorSelection): string {
  return selection.mode === "whole_catalog" ? "whole_catalog" : (selection.categoryIds ?? []).join(",");
}

function coverageIsFresh(
  coverage: SharedDiscoveryCoverage | null,
  now: Date,
  forceFresh: boolean,
  freshRequestedAt: string | null,
): boolean {
  if (!coverage || coverage.status !== "completed") return false;
  if (coverage.adapterVersion !== MONITOR_ADAPTER_VERSION) return false;
  if (coverage.schemaVersion !== MONITOR_PUBLIC_SCHEMA_VERSION) return false;
  if (forceFresh && freshRequestedAt && Date.parse(coverage.discoveredAt) < Date.parse(freshRequestedAt)) {
    return false;
  }
  const age = now.getTime() - Date.parse(coverage.discoveredAt);
  return age >= 0 && age <= ATHENA_MONITOR_FRESHNESS.catalogDiscoveryMs;
}

function scopesFor(selection: MonitorSelection, categories: readonly SharedMonitorCategory[], canonicalUrl: string): ScopeWork[] {
  if (selection.mode === "whole_catalog") {
    return [
      {
        kind: "whole_catalog",
        key: "whole_catalog",
        canonicalUrl,
        categoryUrls: categories.map((category) => category.canonicalUrl),
      },
    ];
  }
  return (selection.categoryIds ?? []).flatMap((key) => {
    const category = categories.find((item) => item.categoryKey === key);
    if (!category) return [];
    return [
      {
        kind: "category" as const,
        key,
        canonicalUrl: category.canonicalUrl,
        categoryUrls: [],
      },
    ];
  });
}

function rememberFamilies(
  cursor: MonitorExecutionCursorSource,
  families: Array<{ familyId: string; productUrl: string; categoryKey: string | null }>,
): MonitorExecutionCursorSource {
  const familyUrls = { ...(cursor.familyUrls ?? {}) };
  const familyCategories = { ...(cursor.familyCategories ?? {}) };
  for (const family of families) {
    familyUrls[family.familyId] = family.productUrl;
    if (family.categoryKey) {
      const existing = new Set(familyCategories[family.familyId] ?? []);
      existing.add(family.categoryKey);
      familyCategories[family.familyId] = [...existing].sort((left, right) => left.localeCompare(right));
    }
  }
  return { ...cursor, familyUrls, familyCategories };
}

export async function executeMonitorJob(input: {
  service: MonitorService;
  store: MonitorStore;
  job: MonitorJob;
  fetchPage: MonitorPageFetch;
  now?: () => Date;
  shouldStop?: () => boolean;
  forceFresh?: boolean;
  resources?: MonitorResourceTracker;
}): Promise<{ job: MonitorJob; outcome: MonitorExecutionOutcome }> {
  const now = input.now ?? (() => new Date());
  const shouldStop = input.shouldStop ?? (() => false);
  const forceFresh = input.forceFresh === true;
  const freshRequestedAt = forceFresh ? now().toISOString() : null;
  let job = input.job;
  let consumed = 0;
  let spins = 0;

  const yieldJob = async (next: MonitorJob): Promise<MonitorJob> => {
    const stamp = now().toISOString();
    return input.service.yieldMonitorJob({
      jobId: next.id,
      claimToken: next.claimToken ?? "",
      progress: progressFrom(next, stamp),
      sourceCoverage: next.sourceCoverage,
      executionCursor: next.executionCursor,
    });
  };

  try {
    while (!shouldStop() && consumed < ATHENA_MONITOR_WORKER_DEFAULTS.batchSize && spins < 40) {
      spins += 1;
      const current = await input.store.getJobById(job.id);
      if (!current || isTerminalMonitorStatus(current.status)) {
        return { job: current ?? job, outcome: current && isTerminalMonitorStatus(current.status) ? current.status : "interrupted" };
      }
      job = current;
      if (job.cancellationRequestedAt) {
        const finalized = await input.service.finalizeMonitorJob({
          jobId: job.id,
          claimToken: job.claimToken ?? "",
          status: "cancelled",
          errorCode: "CANCELLED",
          errorMessage: "Cancellation was requested.",
          sourceCoverage: job.sourceCoverage.map((source) =>
            OPEN.has(source.status) ? { ...source, status: "cancelled", errorCode: "CANCELLED" } : source,
          ),
          progress: progressFrom(job, now().toISOString(), { phase: null }),
          executionCursor: job.executionCursor,
        });
        return { job: finalized, outcome: "cancelled" };
      }

      let plan: MonitorBatchPlan;
      try {
        plan = await input.service.prepareMonitorExtractionBatch({
          jobId: job.id,
          claimToken: job.claimToken ?? "",
        });
      } catch (error) {
        if (error instanceof MonitorOperationError && (error.code === "STALE_CLAIM" || error.code === "BATCH_DEADLINE" || error.code === "EXECUTION_DEADLINE")) {
          const latest = await input.store.getJobById(job.id);
          return { job: latest ?? job, outcome: "interrupted" };
        }
        throw error;
      }
      if (plan.action === "yield") {
        return { job: await yieldJob(job), outcome: "yielded" };
      }
      if (plan.action === "stop") {
        if (plan.reason === "ENTITLEMENT_REQUIRED") {
          const latest = await input.store.getJobById(job.id);
          const status = latest?.status;
          return {
            job: latest ?? job,
            outcome: status === "partial" ? "partial" : "blocked",
          };
        }
        const latest = (await input.store.getJobById(job.id)) ?? job;
        if (isTerminalMonitorStatus(latest.status)) {
          return { job: latest, outcome: latest.status };
        }
        const coverage =
          plan.status === "cancelled"
            ? latest.sourceCoverage.map((source) =>
                OPEN.has(source.status) ? { ...source, status: "cancelled" as const, errorCode: "CANCELLED" } : source,
              )
            : latest.sourceCoverage;
        const status =
          plan.status === "cancelled"
            ? "cancelled"
            : (deriveMonitorTerminalStatus(coverage) ?? plan.status);
        const safeStatus =
          status === "completed" && !coverage.every((source) => completedSourceIsAccounted(source))
            ? "partial"
            : status;
        const finalized = await input.service.finalizeMonitorJob({
          jobId: latest.id,
          claimToken: latest.claimToken ?? "",
          status: safeStatus,
          errorCode: safeStatus === "completed" || safeStatus === "partial" ? null : plan.reason,
          errorMessage: safeStatus === "completed" || safeStatus === "partial" ? null : plan.reason,
          sourceCoverage: coverage,
          progress: progressFrom(latest, now().toISOString(), { phase: null, currentSourceId: null }),
          executionCursor: latest.executionCursor,
        });
        return { job: finalized, outcome: safeStatus };
      }

      const step = await advanceSource({
        service: input.service,
        store: input.store,
        fetchPage: input.fetchPage,
        resources: input.resources,
        now,
        shouldStop,
        forceFresh,
        freshRequestedAt,
        job,
        plan,
        budget: ATHENA_MONITOR_WORKER_DEFAULTS.batchSize - consumed,
      });
      job = step.job;
      consumed += step.consumed;
      if (step.outcome === "yield" || step.outcome === "interrupted") {
        if (shouldStop() || step.outcome === "interrupted") {
          const yielded = await yieldJob(job);
          return { job: yielded, outcome: "interrupted" };
        }
        const yielded = await yieldJob(job);
        return { job: yielded, outcome: "yielded" };
      }
      if (step.outcome === "cancelled") {
        return { job, outcome: "cancelled" };
      }
    }

    if (shouldStop()) {
      return { job: await yieldJob(job), outcome: "interrupted" };
    }
    return { job: await yieldJob(job), outcome: "yielded" };
  } catch (error) {
    if (error instanceof MonitorOperationError && (error.code === "STALE_CLAIM" || error.code === "BATCH_DEADLINE" || error.code === "EXECUTION_DEADLINE")) {
      const latest = await input.store.getJobById(job.id);
      return { job: latest ?? job, outcome: "interrupted" };
    }
    if (error instanceof MonitorOperationError && (error.code === "CANCELLED" || error.code === "ENTITLEMENT_REQUIRED")) {
      const latest = await input.store.getJobById(job.id);
      if (latest && isTerminalMonitorStatus(latest.status)) {
        return { job: latest, outcome: latest.status === "cancelled" ? "cancelled" : latest.status };
      }
      if (error.code === "CANCELLED" && latest?.claimToken) {
        const finalized = await input.service.finalizeMonitorJob({
          jobId: latest.id,
          claimToken: latest.claimToken,
          status: "cancelled",
          errorCode: "CANCELLED",
          errorMessage: "Cancellation was requested.",
          sourceCoverage: latest.sourceCoverage.map((source) =>
            OPEN.has(source.status) ? { ...source, status: "cancelled", errorCode: "CANCELLED" } : source,
          ),
        });
        return { job: finalized, outcome: "cancelled" };
      }
      return { job: latest ?? job, outcome: "blocked" };
    }
    throw error;
  }
}

async function advanceSource(input: {
  service: MonitorService;
  store: MonitorStore;
  fetchPage: MonitorPageFetch;
  resources?: MonitorResourceTracker;
  now: () => Date;
  shouldStop: () => boolean;
  forceFresh: boolean;
  freshRequestedAt: string | null;
  job: MonitorJob;
  plan: Extract<MonitorBatchPlan, { action: "extract" }>;
  budget: number;
}): Promise<{ job: MonitorJob; consumed: number; outcome: "continue" | "yield" | "interrupted" | "cancelled" }> {
  const configured = input.job.configurationSnapshot.sources.find((source) => source.sourceId === input.plan.sourceId);
  const defined = getMonitorSource(input.plan.sourceId);
  const adapter = productionAdapterFor(input.plan.sourceId);
  if (!configured || !defined || !adapter) {
    return {
      job: await writeSource(input, input.job, input.plan.sourceId, {
        status: "failed",
        errorCode: "UNSUPPORTED_SOURCE",
      }, cursorFor(input.job, input.plan.sourceId), "discover"),
      consumed: 0,
      outcome: "continue",
    };
  }
  if (defined.productionAccess === "blocked" || adapter.id === "sfra") {
    return {
      job: await writeSource(
        input,
        input.job,
        configured.sourceId,
        { status: "blocked", errorCode: "PRODUCTION_ACCESS_BLOCKED", discoveryStatus: null },
        cursorFor(input.job, configured.sourceId),
        null,
      ),
      consumed: 0,
      outcome: "continue",
    };
  }

  const cursor = cursorFor(input.job, configured.sourceId);
  if (cursor.phase === "discover") {
    return discoverSource(input, configured, cursor);
  }
  return extractSource(input, configured, cursor);
}

async function writeSource(
  input: {
    service: MonitorService;
    now: () => Date;
    job: MonitorJob;
  },
  job: MonitorJob,
  sourceId: string,
  patch: Partial<MonitorSourceCoverage>,
  cursor: MonitorExecutionCursorSource,
  phase: MonitorProgress["phase"],
): Promise<MonitorJob> {
  const next: MonitorJob = {
    ...job,
    sourceCoverage: withCoverage(job, sourceId, patch),
    executionCursor: withCursor(job, cursor),
  };
  const stamp = input.now().toISOString();
  const categoriesSelected = next.configurationSnapshot.sources.reduce((total, source) => {
    if (source.selection.mode !== "categories") return total;
    return total + (source.selection.categoryIds?.length ?? 0);
  }, 0);
  return input.service.heartbeatMonitorJob({
    jobId: job.id,
    claimToken: job.claimToken ?? "",
    progress: progressFrom(next, stamp, { currentSourceId: sourceId, phase, categoriesSelected }),
    sourceCoverage: next.sourceCoverage,
    executionCursor: next.executionCursor,
  });
}

async function discoverSource(
  input: {
    service: MonitorService;
    store: MonitorStore;
    fetchPage: MonitorPageFetch;
    resources?: MonitorResourceTracker;
    now: () => Date;
    shouldStop: () => boolean;
    forceFresh: boolean;
    freshRequestedAt: string | null;
    job: MonitorJob;
    budget: number;
  },
  configured: MonitorSourceConfiguration,
  cursor: MonitorExecutionCursorSource,
): Promise<{ job: MonitorJob; consumed: number; outcome: "continue" | "yield" | "interrupted" | "cancelled" }> {
  if (input.shouldStop()) return { job: input.job, consumed: 0, outcome: "interrupted" };
  const defined = getMonitorSource(configured.sourceId);
  if (!defined) return { job: input.job, consumed: 0, outcome: "continue" };
  const listed = await input.service.listDiscoveredCategories(input.job.organizationId, configured.websiteUrl);
  const discoveryNotStarted = cursor.nextIndex === 0 && Object.keys(cursor.familyUrls ?? {}).length === 0;
  let categories = listed.categories;
  if (discoveryNotStarted && (!listed.fresh || input.forceFresh)) {
    const signal = input.resources?.signalForRequest();
    try {
      const adapter = productionAdapterFor(configured.sourceId);
      if (!adapter) return { job: input.job, consumed: 0, outcome: "continue" };
      const discovered = await adapter.discoverCategories({
        canonicalUrl: listed.source.canonicalUrl,
        registrableDomain: defined.registrableDomain,
        fetchPage: input.fetchPage,
        timeoutMs: input.job.requestTimeoutMs ?? ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs,
        signal,
      });
      if (!discovered.ok) {
        const status = discovered.code === "access_blocked" ? "blocked" : "failed";
        const job = await writeSource(
          input,
          input.job,
          configured.sourceId,
          {
            status,
            errorCode: discovered.code === "access_blocked" ? "PRODUCTION_ACCESS_BLOCKED" : "DISCOVERY_FAILED",
            discoveryStatus: status === "blocked" ? null : "failed",
          },
          cursor,
          "discover",
        );
        return { job, consumed: 0, outcome: "continue" };
      }
      if (!discovered.value.complete) {
        const job = await writeSource(
          input,
          input.job,
          configured.sourceId,
          { status: "failed", errorCode: "DISCOVERY_FAILED", discoveryStatus: "failed" },
          cursor,
          "discover",
        );
        return { job, consumed: 0, outcome: "continue" };
      }
      const stamp = input.now().toISOString();
      await input.service.recordSharedCategoryDiscovery({
        organizationId: input.job.organizationId,
        websiteUrl: configured.websiteUrl,
        discoveredAt: stamp,
        categories: discovered.value.categories.map((category) => ({
          categoryKey: categoryKeyFromUrl(category.canonicalUrl),
          displayName: category.displayName,
          canonicalUrl: category.canonicalUrl,
          parentCategoryKey: category.parentCategoryKey,
          discoveredAt: stamp,
          discoveryStatus: "current" as const,
          productFamilyCount: null,
          productFamilyCountBasis: null,
        })),
      });
      categories = await input.store.listSharedCategories(listed.source.id);
    } finally {
      if (signal) input.resources?.release(signal);
    }
  }

  if (configured.selection.mode === "categories") {
    const keys = new Set(categories.map((category) => category.categoryKey));
    const selected = configured.selection.categoryIds ?? [];
    if (selected.length === 0 || selected.some((key) => !keys.has(key))) {
      const job = await writeSource(
        input,
        input.job,
        configured.sourceId,
        { status: "failed", errorCode: "UNKNOWN_CATEGORY", discoveryStatus: "failed" },
        cursor,
        "discover",
      );
      return { job, consumed: 0, outcome: "continue" };
    }
  }

  const scopes = scopesFor(configured.selection, categories, listed.source.canonicalUrl);
  if (scopes.length === 0) {
    const job = await writeSource(
      input,
      input.job,
      configured.sourceId,
      { status: "failed", errorCode: "DISCOVERY_FAILED", discoveryStatus: "failed" },
      cursor,
      "discover",
    );
    return { job, consumed: 0, outcome: "continue" };
  }
  if (cursor.nextIndex >= scopes.length) {
    return finishDiscovery(input, configured, listed.source, categories, scopes, cursor);
  }
  const scope = scopes[cursor.nextIndex];
  if (!scope) return { job: input.job, consumed: 0, outcome: "continue" };
  const coverageRows = await input.store.listDiscoveryCoverage(listed.source.id);
  const latest = latestCoverageForScope(coverageRows, scope.key);
  if (coverageIsFresh(latest, input.now(), input.forceFresh, input.freshRequestedAt)) {
    const job = await writeSource(
      input,
      input.job,
      configured.sourceId,
      { status: "discovering", discoveryStatus: null },
      { ...cursor, nextIndex: cursor.nextIndex + 1, categoryUrl: null },
      "discover",
    );
    return { job, consumed: 0, outcome: "continue" };
  }

  const adapter = productionAdapterFor(configured.sourceId);
  if (!adapter) return { job: input.job, consumed: 0, outcome: "continue" };
  const priorIds = !input.forceFresh && latest?.status === "partial" ? latest.familyIds : [];
  const signal = input.resources?.signalForRequest();
  try {
    const enumerated = await adapter.enumerateScope({
      scope:
        scope.kind === "whole_catalog"
          ? { kind: "whole_catalog", canonicalUrl: scope.canonicalUrl, categoryUrls: scope.categoryUrls }
          : { kind: "category", canonicalUrl: scope.canonicalUrl, categoryKey: scope.key },
      registrableDomain: defined.registrableDomain,
      fetchPage: input.fetchPage,
      timeoutMs: input.job.requestTimeoutMs ?? ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs,
      signal,
      resumeUrl: cursor.categoryUrl,
      familyLimit: Math.max(input.budget, 1),
      alreadySeen: new Set(priorIds),
    });
    if (!enumerated.ok) {
      const job = await writeSource(
        input,
        input.job,
        configured.sourceId,
        {
          status: enumerated.code === "access_blocked" ? "blocked" : "failed",
          errorCode: enumerated.code === "access_blocked" ? "PRODUCTION_ACCESS_BLOCKED" : "DISCOVERY_FAILED",
          discoveryStatus: enumerated.code === "access_blocked" ? null : "failed",
        },
        cursor,
        "discover",
      );
      return { job, consumed: 0, outcome: "continue" };
    }
    const mergedIds = [...new Set([...priorIds, ...enumerated.value.families.map((family) => family.familyId)])];
    const nextCursor = rememberFamilies(
      {
        ...cursor,
        categoryUrl: enumerated.value.done ? null : enumerated.value.resumeUrl,
        nextIndex: enumerated.value.done ? cursor.nextIndex + 1 : cursor.nextIndex,
      },
      enumerated.value.families,
    );
    const failed = Boolean(enumerated.value.errorCode) && !enumerated.value.done;
    const coverageStatus = enumerated.value.done ? "completed" : failed ? (mergedIds.length > 0 ? "partial" : "failed") : "partial";
    const saved = await input.service.recordSharedDiscoveryCoverage({
      organizationId: input.job.organizationId,
      websiteUrl: configured.websiteUrl,
      coverage: {
        scopeKind: scope.kind,
        categoryId: scope.kind === "category" ? (categories.find((category) => category.categoryKey === scope.key)?.id ?? null) : null,
        scopeKey: scope.key,
        status: coverageStatus === "completed" ? "completed" : coverageStatus === "failed" ? "failed" : "partial",
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        schemaVersion: MONITOR_PUBLIC_SCHEMA_VERSION,
        discoveredAt: input.now().toISOString(),
        familyIds: mergedIds,
        familyCount: mergedIds.length,
      },
    });
    if (!enumerated.value.done) {
      const job = await writeSource(
        input,
        input.job,
        configured.sourceId,
        {
          status: failed ? (mergedIds.length > 0 ? "partial" : "failed") : "discovering",
          errorCode: failed ? (enumerated.value.errorCode ?? "DISCOVERY_FAILED") : null,
          discoveryStatus: failed ? (mergedIds.length > 0 ? "partial" : "failed") : null,
          discoveryCoverageId: saved.id,
          discoveryScopeKey: scopeKeyFor(configured.selection),
          discoveredAt: saved.discoveredAt,
          familiesDiscovered: Object.keys(nextCursor.familyUrls ?? {}).length,
        },
        nextCursor,
        "discover",
      );
      return {
        job,
        consumed: enumerated.value.families.length,
        outcome: failed ? "continue" : "yield",
      };
    }
    const job = await writeSource(
      input,
      input.job,
      configured.sourceId,
      {
        status: "discovering",
        familiesDiscovered: Object.keys(nextCursor.familyUrls ?? {}).length,
        discoveryScopeKey: scopeKeyFor(configured.selection),
      },
      nextCursor,
      "discover",
    );
    return { job, consumed: enumerated.value.families.length, outcome: input.budget <= enumerated.value.families.length ? "yield" : "continue" };
  } finally {
    if (signal) input.resources?.release(signal);
  }
}

async function finishDiscovery(
  input: {
    service: MonitorService;
    store: MonitorStore;
    now: () => Date;
    forceFresh: boolean;
    freshRequestedAt: string | null;
    job: MonitorJob;
  },
  configured: MonitorSourceConfiguration,
  source: SharedMonitorSource,
  categories: readonly SharedMonitorCategory[],
  scopes: readonly ScopeWork[],
  cursor: MonitorExecutionCursorSource,
): Promise<{ job: MonitorJob; consumed: number; outcome: "continue" | "yield" | "interrupted" | "cancelled" }> {
  const rows = await input.store.listDiscoveryCoverage(source.id);
  const latest = scopes.map((scope) => latestCoverageForScope(rows, scope.key));
  const ready = latest.every((coverage) => coverageIsFresh(coverage, input.now(), input.forceFresh, input.freshRequestedAt));
  if (!ready) {
    const failed = latest.some((coverage) => coverage?.status === "failed" || coverage == null);
    const job = await writeSource(
      input,
      input.job,
      configured.sourceId,
      {
        status: failed ? "failed" : "partial",
        errorCode: "COVERAGE_INCOMPLETE",
        discoveryStatus: failed ? "failed" : "partial",
        discoveryScopeKey: scopeKeyFor(configured.selection),
        discoveryCoverageId: latest.find((coverage) => coverage)?.id ?? null,
      },
      { ...cursor, phase: "discover" },
      "discover",
    );
    return { job, consumed: 0, outcome: "continue" };
  }
  const discovered = new Set(latest.flatMap((coverage) => coverage?.familyIds ?? []));
  const job = await writeSource(
    input,
    input.job,
    configured.sourceId,
    {
      status: "extracting",
      discoveryStatus: "completed",
      discoveryScopeKey: scopeKeyFor(configured.selection),
      discoveryCoverageId: latest[latest.length - 1]?.id ?? null,
      discoveredAt: latest[latest.length - 1]?.discoveredAt ?? input.now().toISOString(),
      familiesDiscovered: discovered.size,
      familiesFailed: 0,
      failedFamilyIds: [],
    },
    { ...cursor, phase: "extract", nextIndex: 0, categoryUrl: null },
    "extract",
  );
  return { job, consumed: 0, outcome: "continue" };
}

async function extractSource(
  input: {
    service: MonitorService;
    store: MonitorStore;
    fetchPage: MonitorPageFetch;
    resources?: MonitorResourceTracker;
    now: () => Date;
    shouldStop: () => boolean;
    forceFresh: boolean;
    freshRequestedAt: string | null;
    job: MonitorJob;
    budget: number;
  },
  configured: MonitorSourceConfiguration,
  cursor: MonitorExecutionCursorSource,
): Promise<{ job: MonitorJob; consumed: number; outcome: "continue" | "yield" | "interrupted" | "cancelled" }> {
  const defined = getMonitorSource(configured.sourceId);
  const adapter = productionAdapterFor(configured.sourceId);
  const shared = await input.store.getSharedSourceByRegisteredId(configured.sourceId);
  if (!defined || !adapter || !shared) {
    const job = await writeSource(
      input,
      input.job,
      configured.sourceId,
      { status: "failed", errorCode: "UNSUPPORTED_SOURCE" },
      cursor,
      "extract",
    );
    return { job, consumed: 0, outcome: "continue" };
  }
  const [categories, coverage, observations] = await Promise.all([
    input.store.listSharedCategories(shared.id),
    input.store.listDiscoveryCoverage(shared.id),
    input.store.listPublicObservations(shared.id),
  ]);
  const scopes = scopesFor(configured.selection, categories, shared.canonicalUrl);
  const membership = new Map<string, Set<string>>();
  for (const scope of scopes) {
    const latest = latestCoverageForScope(coverage, scope.key);
    if (!latest || latest.status !== "completed") continue;
    for (const familyId of latest.familyIds) {
      const keys = membership.get(familyId) ?? new Set<string>();
      if (scope.kind === "category") keys.add(scope.key);
      for (const key of cursor.familyCategories?.[familyId] ?? []) keys.add(key);
      membership.set(familyId, keys);
    }
  }
  const families = [...membership.keys()].sort((left, right) => left.localeCompare(right));
  const slice = families.slice(cursor.nextIndex, cursor.nextIndex + input.budget);
  if (slice.length === 0) {
    return completeExtraction(input, configured, cursor, families.length);
  }
  const reusePlan = planSharedObservationReuse({
    source: shared,
    selection: configured.selection,
    categories,
    coverage,
    observations,
    now: input.now(),
    forceFresh: input.forceFresh,
    freshRequestedAt: input.freshRequestedAt,
  });
  const reusable = new Set(reusePlan.reusable.map((item) => item.familyId));
  const toReuse = slice.filter((familyId) => reusable.has(familyId));
  const toFetch = slice.filter((familyId) => !reusable.has(familyId));
  let job = input.job;
  let analyzed = job.sourceCoverage.find((source) => source.sourceId === configured.sourceId)?.familiesAnalyzed ?? 0;
  let extracted = job.sourceCoverage.find((source) => source.sourceId === configured.sourceId)?.familiesExtracted ?? 0;
  let reused = job.sourceCoverage.find((source) => source.sourceId === configured.sourceId)?.familiesReused ?? 0;
  let matching = job.sourceCoverage.find((source) => source.sourceId === configured.sourceId)?.familiesMatching ?? 0;
  let failed = [...(job.sourceCoverage.find((source) => source.sourceId === configured.sourceId)?.failedFamilyIds ?? [])];
  let persisted = job.progress.familiesPersisted;

  if (toReuse.length > 0) {
    const categoryIdsByFamily = Object.fromEntries(
      toReuse.map((familyId) => [familyId, [...(membership.get(familyId) ?? [])]]),
    );
    const attached = await input.service.reuseSharedObservations({
      organizationId: job.organizationId,
      jobId: job.id,
      claimToken: job.claimToken ?? "",
      familyIds: toReuse,
      categoryIdsByFamily,
    });
    reused += toReuse.length;
    analyzed += toReuse.length;
    persisted += attached.inserted;
    for (const familyId of toReuse) {
      const observation = observations.find((item) => item.familyId === familyId);
      const matched = matchMonitorCriterion(job.configurationSnapshot.criterion, observation?.distinctVariationCount ?? null);
      if (matched === true) matching += 1;
    }
  }

  for (const familyId of toFetch) {
    if (input.shouldStop() || input.resources?.closed) {
      job = await writeSource(
        input,
        job,
        configured.sourceId,
        counters(configured, families.length, analyzed, extracted, reused, matching, failed),
        { ...cursor, nextIndex: cursor.nextIndex + Math.max(slice.indexOf(familyId), 0), phase: "extract" },
        "extract",
      );
      return { job, consumed: slice.length, outcome: "interrupted" };
    }
    const productUrl = cursor.familyUrls?.[familyId];
    const signal = input.resources?.signalForRequest();
    try {
      if (!productUrl) {
        failed = [...failed, familyId];
        analyzed += 1;
        continue;
      }
      const observedAt = input.now().toISOString();
      const extractedProduct = await adapter.extractFamily({
        familyId,
        productUrl,
        registrableDomain: defined.registrableDomain,
        fetchPage: input.fetchPage,
        timeoutMs: job.requestTimeoutMs ?? ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs,
        signal,
        observedAt,
      });
      if (!extractedProduct.ok) {
        if (extractedProduct.message.includes("aborted") || input.shouldStop()) {
          job = await writeSource(
            input,
            job,
            configured.sourceId,
            counters(configured, families.length, analyzed, extracted, reused, matching, failed),
            { ...cursor, nextIndex: cursor.nextIndex + Math.max(slice.indexOf(familyId), 0), phase: "extract" },
            "extract",
          );
          return { job, consumed: slice.length, outcome: "interrupted" };
        }
        failed = [...failed, familyId];
        analyzed += 1;
        continue;
      }
      const categoryIds = [...(membership.get(familyId) ?? [])];
      await input.service.persistMonitorObservations({
        jobId: job.id,
        claimToken: job.claimToken ?? "",
        observations: [
          {
            sourceId: configured.sourceId,
            familyId: extractedProduct.value.familyId,
            productUrl: extractedProduct.value.productUrl,
            productName: extractedProduct.value.productName,
            category: extractedProduct.value.category,
            priceAmount: extractedProduct.value.priceAmount,
            currency: extractedProduct.value.currency,
            colorPatternIds: extractedProduct.value.colorPatternIds,
            colorPatternNames: extractedProduct.value.colorPatternNames,
            distinctVariationCount: extractedProduct.value.distinctVariationCount,
            sizes: extractedProduct.value.sizes,
            lengths: extractedProduct.value.lengths,
            imageUrl: extractedProduct.value.imageUrl,
            observedAt,
            categoryIds,
          },
        ],
      });
      extracted += 1;
      analyzed += 1;
      persisted += 1;
      if (
        matchMonitorCriterion(job.configurationSnapshot.criterion, extractedProduct.value.distinctVariationCount) === true
      ) {
        matching += 1;
      }
    } finally {
      if (signal) input.resources?.release(signal);
    }
  }

  const nextIndex = cursor.nextIndex + slice.length;
  job = await writeSource(
    input,
    {
      ...job,
      progress: { ...job.progress, familiesPersisted: persisted },
    },
    configured.sourceId,
    counters(configured, families.length, analyzed, extracted, reused, matching, failed),
    { ...cursor, nextIndex, phase: "extract" },
    "extract",
  );
  if (nextIndex < families.length) {
    return { job, consumed: slice.length, outcome: "yield" };
  }
  const completed = await completeExtraction(
    input,
    configured,
    { ...cursor, nextIndex, phase: "extract" },
    families.length,
    { analyzed, extracted, reused, matching, failed, persisted },
  );
  return completed;
}

function counters(
  configured: MonitorSourceConfiguration,
  discovered: number,
  analyzed: number,
  extracted: number,
  reused: number,
  matching: number,
  failed: string[],
): Partial<MonitorSourceCoverage> {
  return {
    status: "extracting",
    selection: configured.selection,
    familiesDiscovered: discovered,
    familiesAnalyzed: analyzed,
    familiesExtracted: extracted,
    familiesReused: reused,
    familiesMatching: matching,
    familiesFailed: failed.length,
    failedFamilyIds: failed,
    errorCode: null,
  };
}

async function completeExtraction(
  input: {
    service: MonitorService;
    now: () => Date;
    job: MonitorJob;
  },
  configured: MonitorSourceConfiguration,
  cursor: MonitorExecutionCursorSource,
  discovered: number,
  totals?: {
    analyzed: number;
    extracted: number;
    reused: number;
    matching: number;
    failed: string[];
    persisted: number;
  },
): Promise<{ job: MonitorJob; consumed: number; outcome: "continue" }> {
  const current = input.job.sourceCoverage.find((source) => source.sourceId === configured.sourceId);
  const failed = totals?.failed ?? current?.failedFamilyIds ?? [];
  const analyzed = totals?.analyzed ?? current?.familiesAnalyzed ?? 0;
  const done = failed.length === 0 && analyzed >= discovered;
  const job = await writeSource(
    input,
    {
      ...input.job,
      progress: {
        ...input.job.progress,
        familiesPersisted: totals?.persisted ?? input.job.progress.familiesPersisted,
      },
    },
    configured.sourceId,
    {
      status: done ? "completed" : "partial",
      errorCode: done ? null : "EXTRACTION_INCOMPLETE",
      discoveryStatus: current?.discoveryStatus ?? "completed",
      discoveryCoverageId: current?.discoveryCoverageId ?? null,
      discoveryScopeKey: current?.discoveryScopeKey ?? scopeKeyFor(configured.selection),
      discoveredAt: current?.discoveredAt ?? null,
      familiesDiscovered: discovered,
      familiesAnalyzed: analyzed,
      familiesExtracted: totals?.extracted ?? current?.familiesExtracted ?? 0,
      familiesReused: totals?.reused ?? current?.familiesReused ?? 0,
      familiesMatching: totals?.matching ?? current?.familiesMatching ?? 0,
      familiesFailed: failed.length,
      failedFamilyIds: failed,
    },
    cursor,
    "extract",
  );
  return { job, consumed: 0, outcome: "continue" };
}
