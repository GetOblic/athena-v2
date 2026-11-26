/**
 * Monitor application service.
 * Every user-facing read and write checks Full Athena before touching stored rows.
 * The worker rechecks the same plan at claim and before each extraction batch.
 * A denied plan does not delete saved monitors, jobs, or observations.
 */

import { randomUUID } from "node:crypto";

import type { AthenaPlan } from "@/services/athenaPlan";
import {
  assertFullAthenaMonitorAccess,
  requireMonitorOperatorContext,
  type MonitorOrganizationContextResolver,
  type MonitorPlanResolver,
} from "@/services/monitor/monitorAuthorization";
import { type MonitorComparison } from "@/services/monitor/monitorComparison";
import { parseMonitorConfiguration } from "@/services/monitor/monitorConfig";
import { matchMonitorCriterion } from "@/services/monitor/monitorCriterion";
import { boundMonitorDiagnostic } from "@/services/monitor/monitorDiagnostics";
import type { SharedCategoryRefreshResult } from "@/services/monitor/monitorCategoryRefresh";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  alignCoverageToSnapshot,
  assertMonitorCursor,
  assertMonitorProgress,
  blockUnfinishedCoverage,
  buildInitialCursor,
  buildInitialSourceCoverage,
  classifyMonitorLease,
  completedSourceIsAccounted,
  deriveMonitorTerminalStatus,
  emptyMonitorProgress,
  planMonitorExtractionBatch,
  type MonitorBatchPlan,
} from "@/services/monitor/monitorExecution";
import {
  assertClientCannotAttachPublicObservation,
  assertObservationSourceInSnapshot,
  buildSharedPublicObservation,
  normalizeMonitorObservationDraft,
  type MonitorObservationDraft,
} from "@/services/monitor/monitorObservation";
import { planSharedObservationReuse, selectionScopeKeys } from "@/services/monitor/monitorReuse";
import {
  compareObservationFacts,
  MONITOR_RESULT_FACT_LIMIT,
  resolveMonitorResultSourceIds,
  type MonitorObservationFact,
  type MonitorObservationPage,
  type MonitorObservationPageQuery,
} from "@/services/monitor/monitorResultPage";
import { normalizeSupportedWebsite } from "@/services/monitor/monitorWebsiteIdentity";
import {
  ATHENA_MONITOR_FRESHNESS,
  ATHENA_MONITOR_WORKER_DEFAULTS,
  ATHENA_MONITOR_WORKER_NAME,
} from "@/services/monitor/monitorRuntime";
import { createMemoryMonitorStore } from "@/services/monitor/monitorMemoryStore";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import type { MonitorStore } from "@/services/monitor/monitorStore";
import {
  MONITOR_CONFIGURATION_VERSION,
  type MonitorExecutionCursor,
  type MonitorJob,
  type MonitorObservation,
  type MonitorProgress,
  type MonitorSelection,
  type MonitorSourceCoverage,
  type SavedMonitor,
  type SharedDiscoveryCoverage,
  type SharedMonitorCategory,
  type SharedMonitorSource,
  type SharedReusePlan,
} from "@/services/monitor/monitorTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coverageIdForFamily(coverage: readonly SharedDiscoveryCoverage[], familyId: string): string | null {
  let selected: SharedDiscoveryCoverage | null = null;
  for (const item of coverage) {
    if (item.status !== "completed" || !item.familyIds.includes(familyId)) continue;
    if (!selected) {
      selected = item;
      continue;
    }
    const byTime = item.discoveredAt.localeCompare(selected.discoveredAt);
    if (byTime > 0 || (byTime === 0 && item.id.localeCompare(selected.id) > 0)) selected = item;
  }
  return selected?.id ?? null;
}

export type ClaimedMonitorJob = {
  disposition: "claimed" | "blocked";
  job: MonitorJob;
};

export type MonitorRefilterResult = {
  criterionMinimum: number;
  networkRequests: 0;
  observations: Array<{
    observationId: string;
    sourceId: string;
    familyId: string;
    distinctVariationCount: number | null;
    storedThresholdMatch: boolean | null;
    thresholdMatch: boolean | null;
  }>;
};

function membershipForFamily(
  selection: MonitorSelection,
  familyId: string,
  categoryIdsByFamily: Record<string, string[]> | undefined,
): string[] {
  if (selection.mode !== "categories") return [];
  const allowed = new Set(selection.categoryIds ?? []);
  const supplied = categoryIdsByFamily?.[familyId];
  if (!supplied) return [...allowed];
  return supplied.filter((categoryId) => allowed.has(categoryId));
}

function assertUuid(value: string): string {
  const id = value.trim();
  if (!UUID_RE.test(id)) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  return id;
}

function sharedSourceDraft(websiteUrl: string, stamp: string): SharedMonitorSource {
  const identity = normalizeSupportedWebsite(websiteUrl);
  const registered = getMonitorSource(identity.registeredSourceId);
  return {
    id: randomUUID(),
    normalizedHost: identity.normalizedHost,
    canonicalUrl: identity.canonicalUrl,
    registeredSourceId: identity.registeredSourceId,
    platform: identity.platform,
    adapterId: identity.adapterId,
    adapterVersion: identity.adapterVersion,
    extractionConfig: identity.extractionConfig,
    discoveryStatus: "pending",
    lastDiscoveredAt: null,
    accessStatus: registered?.productionAccess === "blocked" ? "blocked" : "feasible",
    retryAfter: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

async function stopForEntitlement(store: MonitorStore, job: MonitorJob): Promise<MonitorJob> {
  if (!job.claimToken) throw new MonitorOperationError("STALE_CLAIM");
  const coverage = blockUnfinishedCoverage(job.sourceCoverage, "ENTITLEMENT_REQUIRED");
  const status = deriveMonitorTerminalStatus(coverage) ?? "blocked";
  const diagnostic = boundMonitorDiagnostic({
    errorCode: "ENTITLEMENT_REQUIRED",
    errorMessage: "Full Athena is required.",
  });
  const finalized = await store.finalize({
    jobId: job.id,
    claimToken: job.claimToken,
    status,
    errorCode: diagnostic.errorCode,
    errorMessage: diagnostic.errorMessage,
    errorMetadata: diagnostic.errorMetadata,
    sourceCoverage: coverage,
    progress: job.progress,
    executionCursor: job.executionCursor,
  });
  if (!finalized) throw new MonitorOperationError("STALE_CLAIM");
  return finalized;
}

async function requireOwnedProcessingJob(
  store: MonitorStore,
  jobId: string,
  claimToken: string,
  now: () => Date,
): Promise<MonitorJob> {
  const job = await store.getJobById(assertUuid(jobId));
  if (!job || job.status !== "processing" || job.claimToken !== claimToken) {
    throw new MonitorOperationError("STALE_CLAIM");
  }
  const leaseState = classifyMonitorLease({
    now: now().getTime(),
    claimExpiresAt: job.claimExpiresAt,
    batchDeadlineAt: job.batchDeadlineAt,
    executionDeadlineAt: job.executionDeadlineAt,
  });
  if (leaseState !== "ok") throw new MonitorOperationError(leaseState);
  return job;
}

export function createMonitorService(deps: {
  store: MonitorStore;
  resolvePlan: MonitorPlanResolver;
  requireOrganizationContext?: MonitorOrganizationContextResolver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const { store, resolvePlan } = deps;

  async function readLatestCoverage(sourceId: string, selection: MonitorSelection): Promise<SharedDiscoveryCoverage[]> {
    const rows = await Promise.all(
      selectionScopeKeys(selection).map((scopeKey) => store.latestDiscoveryCoverageForScope(sourceId, scopeKey)),
    );
    return rows.filter((row): row is SharedDiscoveryCoverage => row != null);
  }

  async function requireFull(organizationId: string): Promise<void> {
    await assertFullAthenaMonitorAccess(organizationId, resolvePlan);
  }

  return {
    async authorizeOperator() {
      return requireMonitorOperatorContext({
        requireOrganizationContext: deps.requireOrganizationContext,
        resolvePlan,
      });
    },

    async createMonitor(input: {
      organizationId: string;
      userId: string | null;
      configuration: unknown;
    }): Promise<SavedMonitor> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const configuration = parseMonitorConfiguration(input.configuration);
      const stamp = now().toISOString();
      return store.insertMonitor({
        id: randomUUID(),
        organizationId,
        name: configuration.name,
        configurationVersion: MONITOR_CONFIGURATION_VERSION,
        configuration,
        lastSuccessfulJobId: null,
        lastSuccessfulAt: null,
        createdBy: input.userId,
        createdAt: stamp,
        updatedAt: stamp,
      });
    },

    async updateMonitor(input: {
      organizationId: string;
      monitorId: string;
      configuration: unknown;
    }): Promise<SavedMonitor> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const configuration = parseMonitorConfiguration(input.configuration);
      const updated = await store.updateMonitorConfiguration({
        id: assertUuid(input.monitorId),
        organizationId,
        name: configuration.name,
        configurationVersion: MONITOR_CONFIGURATION_VERSION,
        configuration,
        lastSuccessfulJobId: null,
        lastSuccessfulAt: null,
        createdBy: null,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      });
      if (!updated) throw new MonitorOperationError("NOT_FOUND");
      return updated;
    },

    async listMonitors(organizationId: string): Promise<SavedMonitor[]> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      return store.listMonitors(id);
    },

    async getMonitor(organizationId: string, monitorId: string): Promise<SavedMonitor> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      const monitor = await store.getMonitor(id, assertUuid(monitorId));
      if (!monitor) throw new MonitorOperationError("NOT_FOUND");
      return monitor;
    },

    async listMonitorJobs(organizationId: string, monitorId?: string): Promise<MonitorJob[]> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      const ownedMonitorId = monitorId ? assertUuid(monitorId) : null;
      if (ownedMonitorId) {
        const monitor = await store.getMonitor(id, ownedMonitorId);
        if (!monitor) throw new MonitorOperationError("NOT_FOUND");
      }
      return store.listJobs({
        organizationId: id,
        monitorId: ownedMonitorId,
        limit: 100,
      });
    },

    async listMonitorObservations(organizationId: string, jobId: string): Promise<MonitorObservation[]> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      const job = await store.getJob(id, assertUuid(jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      return store.listObservations(id, job.id);
    },

    async pageMonitorObservations(
      input: MonitorObservationPageQuery & { website?: string | null },
    ): Promise<MonitorObservationPage> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const job = await store.getJob(organizationId, assertUuid(input.jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      if (input.pageSize < 1 || input.pageSize > 24) {
        throw new MonitorOperationError("RESULT_BOUND");
      }
      const sourceIds = input.sourceIds ?? resolveMonitorResultSourceIds(input.website);
      return store.pageObservations({
        ...input,
        organizationId,
        jobId: job.id,
        sourceIds,
        page: input.page,
        pageSize: input.pageSize,
      });
    },

    async listMonitorObservationFacts(
      organizationId: string,
      jobId: string,
    ): Promise<MonitorObservationFact[]> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      const job = await store.getJob(id, assertUuid(jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      const facts = await store.listObservationFacts(id, job.id);
      if (facts.length > MONITOR_RESULT_FACT_LIMIT) {
        throw new MonitorOperationError("RESULT_BOUND");
      }
      return facts;
    },

    async getMonitorObservationsByIds(input: {
      organizationId: string;
      jobId: string;
      observationIds: readonly string[];
    }): Promise<MonitorObservation[]> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const job = await store.getJob(organizationId, assertUuid(input.jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      if (input.observationIds.length > 24) throw new MonitorOperationError("RESULT_BOUND");
      const ids = input.observationIds.map((id) => assertUuid(id));
      return store.getObservationsByIds(organizationId, job.id, ids);
    },

    async enqueueMonitorJob(input: {
      organizationId: string;
      monitorId: string;
      forceFresh?: boolean;
    }): Promise<MonitorJob> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const monitor = await store.getMonitor(organizationId, assertUuid(input.monitorId));
      if (!monitor) throw new MonitorOperationError("NOT_FOUND");
      const stamp = now().toISOString();
      const snapshot = structuredClone(monitor.configuration);
      return store.insertJob({
        id: randomUUID(),
        organizationId,
        monitorId: monitor.id,
        status: "queued",
        configurationVersion: snapshot.version,
        configurationSnapshot: snapshot,
        claimedBy: null,
        claimToken: null,
        claimedAt: null,
        claimExpiresAt: null,
        heartbeatAt: null,
        executionDeadlineAt: null,
        batchDeadlineAt: null,
        requestTimeoutMs: null,
        batchCompletedAt: null,
        cancellationRequestedAt: null,
        progress: {
          ...emptyMonitorProgress(),
          ...(input.forceFresh === true ? { forceFresh: true as const } : {}),
        },
        sourceCoverage: buildInitialSourceCoverage(snapshot),
        executionCursor: buildInitialCursor(snapshot),
        errorCode: null,
        errorMessage: null,
        errorMetadata: null,
        attemptCount: 0,
        startedAt: null,
        completedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      });
    },

    async getMonitorJob(organizationId: string, jobId: string): Promise<MonitorJob> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      const job = await store.getJob(id, assertUuid(jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      return job;
    },

    async requestMonitorCancellation(input: {
      organizationId: string;
      jobId: string;
    }): Promise<MonitorJob> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const job = await store.requestCancellation({
        organizationId,
        jobId: assertUuid(input.jobId),
      });
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      return job;
    },

    async claimNextMonitorJob(input?: {
      workerId?: string;
      claimToken?: string;
    }): Promise<ClaimedMonitorJob | null> {
      const workerId = (input?.workerId ?? ATHENA_MONITOR_WORKER_NAME).trim();
      if (!workerId || workerId.length > 120) {
        throw new MonitorOperationError("INVALID_REQUEST");
      }
      const claimToken = input?.claimToken ?? randomUUID();
      assertUuid(claimToken);
      const job = await store.claimNext({
        workerId,
        claimToken,
        leaseSeconds: ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds,
        executionDeadlineSeconds: ATHENA_MONITOR_WORKER_DEFAULTS.executionDeadlineSeconds,
        batchDeadlineSeconds: ATHENA_MONITOR_WORKER_DEFAULTS.batchDeadlineSeconds,
        requestTimeoutMs: ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs,
      });
      if (!job) return null;
      let plan: AthenaPlan;
      try {
        plan = await resolvePlan(job.organizationId);
      } catch (error) {
        throw error;
      }
      if (plan !== "full") {
        return { disposition: "blocked", job: await stopForEntitlement(store, job) };
      }
      if (job.sourceCoverage.every((source) => source.status === "blocked")) {
        const diagnostic = boundMonitorDiagnostic({
          errorCode: "PRODUCTION_ACCESS_BLOCKED",
          errorMessage: "No source in this monitor is available for unattended execution.",
        });
        const finalized = await store.finalize({
          jobId: job.id,
          claimToken,
          status: "blocked",
          errorCode: diagnostic.errorCode,
          errorMessage: diagnostic.errorMessage,
          errorMetadata: diagnostic.errorMetadata,
          sourceCoverage: job.sourceCoverage,
          progress: job.progress,
          executionCursor: job.executionCursor,
        });
        if (!finalized) throw new MonitorOperationError("STALE_CLAIM");
        return { disposition: "blocked", job: finalized };
      }
      return { disposition: "claimed", job };
    },

    async heartbeatMonitorJob(input: {
      jobId: string;
      claimToken: string;
      progress?: MonitorProgress | null;
      sourceCoverage?: MonitorSourceCoverage[] | null;
      executionCursor?: MonitorExecutionCursor | null;
    }): Promise<MonitorJob> {
      const job = await requireOwnedProcessingJob(store, input.jobId, input.claimToken, now);
      const sourceCoverage = input.sourceCoverage
        ? alignCoverageToSnapshot(job.configurationSnapshot, input.sourceCoverage)
        : null;
      if (input.progress) assertMonitorProgress(input.progress);
      if (input.executionCursor) {
        assertMonitorCursor(job.configurationSnapshot, input.executionCursor);
      }
      const updated = await store.heartbeat({
        jobId: job.id,
        claimToken: input.claimToken,
        leaseSeconds: ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds,
        progress: input.progress ?? null,
        sourceCoverage,
        executionCursor: input.executionCursor ?? null,
      });
      if (!updated) throw new MonitorOperationError("STALE_CLAIM");
      return updated;
    },

    async prepareMonitorExtractionBatch(input: {
      jobId: string;
      claimToken: string;
    }): Promise<MonitorBatchPlan> {
      const job = await requireOwnedProcessingJob(store, input.jobId, input.claimToken, now);
      let plan: AthenaPlan;
      try {
        plan = await resolvePlan(job.organizationId);
      } catch (error) {
        throw error;
      }
      if (plan !== "full") {
        const finalized = await stopForEntitlement(store, job);
        return {
          action: "stop",
          status: finalized.status === "partial" ? "partial" : "blocked",
          reason: "ENTITLEMENT_REQUIRED",
        };
      }
      return planMonitorExtractionBatch(job, now().getTime());
    },

    async yieldMonitorJob(input: {
      jobId: string;
      claimToken: string;
      progress?: MonitorProgress | null;
      sourceCoverage?: MonitorSourceCoverage[] | null;
      executionCursor?: MonitorExecutionCursor | null;
    }): Promise<MonitorJob> {
      const job = await requireOwnedProcessingJob(store, input.jobId, input.claimToken, now);
      const plan = await resolvePlan(job.organizationId);
      if (plan !== "full") {
        return stopForEntitlement(store, job);
      }
      if (job.cancellationRequestedAt) throw new MonitorOperationError("CANCELLED");
      const yielded = await store.yieldJob({
        jobId: job.id,
        claimToken: input.claimToken,
        progress: input.progress ?? job.progress,
        sourceCoverage: input.sourceCoverage ?? job.sourceCoverage,
        executionCursor: input.executionCursor ?? job.executionCursor,
      });
      if (!yielded) throw new MonitorOperationError("STALE_CLAIM");
      return yielded;
    },

    async persistMonitorObservations(input: {
      jobId: string;
      claimToken: string;
      observations: MonitorObservationDraft[];
    }): Promise<{ inserted: number }> {
      if (input.observations.length > ATHENA_MONITOR_WORKER_DEFAULTS.batchSize) {
        throw new MonitorOperationError("BATCH_BOUND");
      }
      const job = await requireOwnedProcessingJob(store, input.jobId, input.claimToken, now);
      let plan: AthenaPlan;
      try {
        plan = await resolvePlan(job.organizationId);
      } catch (error) {
        throw error;
      }
      if (plan !== "full") {
        await stopForEntitlement(store, job);
        throw new MonitorOperationError("ENTITLEMENT_REQUIRED");
      }
      if (job.cancellationRequestedAt) {
        throw new MonitorOperationError("CANCELLED");
      }
      const stamp = now().toISOString();
      const sharedBySource = new Map<string, SharedMonitorSource>();
      for (const sourceId of new Set(input.observations.map((draft) => draft.sourceId))) {
        const configured = job.configurationSnapshot.sources.find((source) => source.sourceId === sourceId);
        if (!configured) continue;
        sharedBySource.set(
          sourceId,
          await store.ensureSharedSource(sharedSourceDraft(configured.websiteUrl, stamp)),
        );
      }
      const observations: MonitorObservation[] = input.observations.map((draft) => {
        assertObservationSourceInSnapshot(job.configurationSnapshot, draft.sourceId);
        const normalized = normalizeMonitorObservationDraft(
          draft,
          job.configurationSnapshot.criterion,
        );
        const source = sharedBySource.get(normalized.sourceId);
        if (!source) throw new MonitorOperationError("UNSUPPORTED_SOURCE");
        const selection = job.configurationSnapshot.sources.find(
          (item) => item.sourceId === normalized.sourceId,
        )?.selection;
        const categoryIds = selection
          ? membershipForFamily(selection, normalized.familyId, {
              [normalized.familyId]: draft.categoryIds ?? [],
            })
          : [];
        const resolvedCategoryIds =
          draft.categoryIds && draft.categoryIds.length > 0 ? categoryIds : selection?.mode === "categories" ? [...(selection.categoryIds ?? [])] : [];
        const shared = buildSharedPublicObservation({
          id: randomUUID(),
          source,
          familyId: normalized.familyId,
          canonicalUrl: normalized.productUrl,
          payload: normalized.payload,
          observedAt: normalized.observedAt,
          categoryIds: resolvedCategoryIds,
          createdAt: stamp,
        });
        return {
          id: randomUUID(),
          organizationId: job.organizationId,
          monitorId: job.monitorId,
          jobId: job.id,
          sourceId: normalized.sourceId,
          familyId: normalized.familyId,
          productUrl: normalized.productUrl,
          observedAt: normalized.observedAt,
          thresholdMatch: normalized.payload.thresholdMatch,
          payloadVersion: normalized.payload.version,
          payload: normalized.payload,
          publicObservationId: shared.id,
          sharedSourceId: source.id,
          reused: false,
          adapterId: shared.adapterId,
          adapterVersion: shared.adapterVersion,
          schemaVersion: shared.schemaVersion,
          contentKey: shared.contentKey,
          categoryIds: resolvedCategoryIds,
          discoveryCoverageId: null,
          createdAt: stamp,
        };
      });
      const inserted = await store.publishObservations({
        jobId: job.id,
        claimToken: input.claimToken,
        observations,
      });
      if (inserted == null) throw new MonitorOperationError("STALE_CLAIM");
      return { inserted };
    },

    async finalizeMonitorJob(input: {
      jobId: string;
      claimToken: string;
      status: "completed" | "partial" | "failed" | "blocked" | "cancelled";
      errorCode?: string | null;
      errorMessage?: string | null;
      errorMetadata?: Record<string, unknown> | null;
      sourceCoverage?: MonitorSourceCoverage[] | null;
      progress?: MonitorProgress | null;
      executionCursor?: MonitorExecutionCursor | null;
    }): Promise<MonitorJob> {
      const job = await store.getJobById(assertUuid(input.jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      const sourceCoverage = alignCoverageToSnapshot(
        job.configurationSnapshot,
        input.sourceCoverage ?? job.sourceCoverage,
      );
      if (input.status !== "cancelled") {
        const plan = await resolvePlan(job.organizationId);
        if (plan !== "full") {
          if (!job.claimToken || job.status !== "processing") {
            throw new MonitorOperationError("ENTITLEMENT_REQUIRED");
          }
          return stopForEntitlement(store, job);
        }
      }
      if (input.status === "completed" && !sourceCoverage.every((source) => completedSourceIsAccounted(source))) {
        throw new MonitorOperationError("INCOMPLETE_COVERAGE");
      }
      const diagnostic = boundMonitorDiagnostic({
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        errorMetadata: input.errorMetadata,
      });
      const finalized = await store.finalize({
        jobId: job.id,
        claimToken: input.claimToken,
        status: input.status,
        errorCode: diagnostic.errorCode,
        errorMessage: diagnostic.errorMessage,
        errorMetadata: diagnostic.errorMetadata,
        sourceCoverage,
        progress: input.progress ?? job.progress,
        executionCursor: input.executionCursor ?? job.executionCursor,
      });
      if (!finalized) throw new MonitorOperationError("STALE_CLAIM");
      return finalized;
    },

    async recoverMonitorJobs(): Promise<{ recovered: number }> {
      return { recovered: await store.recoverExpired() };
    },

    async compareMonitorJobs(input: {
      organizationId: string;
      baselineJobId: string;
      currentJobId: string;
    }): Promise<MonitorComparison> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const baseline = await store.getJob(organizationId, assertUuid(input.baselineJobId));
      const current = await store.getJob(organizationId, assertUuid(input.currentJobId));
      if (!baseline || !current) throw new MonitorOperationError("NOT_FOUND");
      const [baselineFacts, currentFacts] = await Promise.all([
        store.listObservationFacts(organizationId, baseline.id),
        store.listObservationFacts(organizationId, current.id),
      ]);
      return compareObservationFacts({
        baselineJob: baseline,
        currentJob: current,
        baselineFacts,
        currentFacts,
      });
    },

    async resolveSharedWebsite(organizationId: string, websiteUrl: string): Promise<SharedMonitorSource> {
      const id = assertUuid(organizationId);
      await requireFull(id);
      return store.ensureSharedSource(sharedSourceDraft(websiteUrl, now().toISOString()));
    },

    async listDiscoveredCategories(organizationId: string, websiteUrl: string): Promise<{
      source: SharedMonitorSource;
      fresh: boolean;
      categories: SharedMonitorCategory[];
    }> {
      const ensured = await this.resolveSharedWebsite(organizationId, websiteUrl);
      const snapshot = await store.readSharedDiscoverySnapshot(ensured.id);
      if (!snapshot) throw new MonitorOperationError("UNSUPPORTED_SOURCE");
      const selectable = snapshot.categories.filter((category) => category.discoveryStatus !== "removed");
      const discoveredAt = snapshot.source.lastDiscoveredAt ? Date.parse(snapshot.source.lastDiscoveredAt) : Number.NaN;
      const fresh =
        selectable.length > 0 &&
        Number.isFinite(discoveredAt) &&
        now().getTime() - discoveredAt <= ATHENA_MONITOR_FRESHNESS.categoryDiscoveryMs &&
        selectable.every((category) => category.discoveryStatus === "current");
      return { source: snapshot.source, fresh, categories: snapshot.categories };
    },

    async recordSharedCategoryDiscovery(input: {
      organizationId: string;
      websiteUrl: string;
      discoveredAt: string;
      /**
       * Production callers pass false. A non-empty adapter parse is not proof
       * that every previously known category is absent.
       */
      authoritativeTaxonomy?: boolean;
      categories: Array<Omit<SharedMonitorCategory, "id" | "sourceId" | "parentCategoryId" | "createdAt" | "updatedAt">>;
    }): Promise<SharedCategoryRefreshResult> {
      const source = await this.resolveSharedWebsite(input.organizationId, input.websiteUrl);
      return store.refreshSharedCategories({
        sourceId: source.id,
        discoveredAt: input.discoveredAt,
        authoritativeTaxonomy: input.authoritativeTaxonomy === true,
        categories: input.categories,
      });
    },

    async recordSharedDiscoveryCoverage(input: {
      organizationId: string;
      websiteUrl: string;
      coverage: Omit<SharedDiscoveryCoverage, "id" | "sourceId" | "createdAt">;
    }): Promise<SharedDiscoveryCoverage> {
      const source = await this.resolveSharedWebsite(input.organizationId, input.websiteUrl);
      return store.saveDiscoveryCoverage({
        ...input.coverage,
        id: randomUUID(),
        sourceId: source.id,
        createdAt: input.coverage.discoveredAt,
      });
    },

    async planSharedReuse(input: {
      organizationId: string;
      websiteUrl: string;
      selection: MonitorSelection;
      forceFresh?: boolean;
    }): Promise<SharedReusePlan> {
      const ensured = await this.resolveSharedWebsite(input.organizationId, input.websiteUrl);
      const snapshot = await store.readSharedDiscoverySnapshot(ensured.id);
      if (!snapshot) throw new MonitorOperationError("UNSUPPORTED_SOURCE");
      // Coverage and public observations are immutable append-only rows.
      // They are read separately and are not claimed to share this snapshot.
      const [coverage, observations] = await Promise.all([
        readLatestCoverage(snapshot.source.id, input.selection),
        store.listPublicObservations(snapshot.source.id),
      ]);
      return planSharedObservationReuse({
        source: snapshot.source,
        selection: input.selection,
        categories: snapshot.categories,
        coverage,
        observations,
        now: now(),
        forceFresh: input.forceFresh === true,
        freshRequestedAt: input.forceFresh === true ? now().toISOString() : null,
      });
    },

    async reuseSharedObservations(input: {
      organizationId: string;
      jobId: string;
      claimToken: string;
      familyIds: string[];
      categoryIdsByFamily?: Record<string, string[]>;
      publicObservationId?: unknown;
      publicObservationIds?: unknown;
    }): Promise<{ inserted: number; publicObservationIds: string[] }> {
      assertClientCannotAttachPublicObservation(input);
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      const job = await requireOwnedProcessingJob(store, input.jobId, input.claimToken, now);
      if (job.organizationId !== organizationId) throw new MonitorOperationError("NOT_FOUND");
      if (job.cancellationRequestedAt) throw new MonitorOperationError("CANCELLED");
      const requested = new Set(input.familyIds);
      const links = [];
      for (const source of job.configurationSnapshot.sources) {
        const shared = await store.getSharedSourceByRegisteredId(source.sourceId);
        if (!shared) continue;
        const coverage = await readLatestCoverage(shared.id, source.selection);
        const plan = planSharedObservationReuse({
          source: shared,
          selection: source.selection,
          categories: await store.listSharedCategories(shared.id),
          coverage,
          observations: await store.listPublicObservations(shared.id),
          now: now(),
          forceFresh: false,
        });
        for (const reusable of plan.reusable) {
          if (!requested.has(reusable.familyId)) continue;
          const publicObservation = await store.getPublicObservation(reusable.publicObservationId);
          if (!publicObservation || publicObservation.registeredSourceId !== source.sourceId) {
            throw new MonitorOperationError("PUBLIC_OBSERVATION_NOT_ATTACHABLE");
          }
          links.push({
            publicObservationId: publicObservation.id,
            thresholdMatch: matchMonitorCriterion(
              job.configurationSnapshot.criterion,
              publicObservation.distinctVariationCount,
            ),
            categoryIds: membershipForFamily(source.selection, reusable.familyId, input.categoryIdsByFamily),
            discoveryCoverageId: coverageIdForFamily(coverage, reusable.familyId),
          });
        }
      }
      const inserted = await store.attachResolvedPublicObservations({
        jobId: job.id,
        claimToken: input.claimToken,
        links,
      });
      if (inserted == null) throw new MonitorOperationError("STALE_CLAIM");
      return {
        inserted,
        publicObservationIds: links.map((link) => link.publicObservationId),
      };
    },

    async refilterMonitorJob(input: {
      organizationId: string;
      jobId: string;
      minimum: number;
    }): Promise<MonitorRefilterResult> {
      const organizationId = assertUuid(input.organizationId);
      await requireFull(organizationId);
      if (!Number.isInteger(input.minimum) || input.minimum < 1 || input.minimum > 100) {
        throw new MonitorOperationError("INVALID_CONFIGURATION");
      }
      const job = await store.getJob(organizationId, assertUuid(input.jobId));
      if (!job) throw new MonitorOperationError("NOT_FOUND");
      const stored = await store.listObservationFacts(organizationId, job.id);
      return {
        criterionMinimum: input.minimum,
        networkRequests: 0,
        observations: stored.map((observation) => ({
          observationId: observation.id,
          sourceId: observation.sourceId,
          familyId: observation.familyId,
          distinctVariationCount: observation.distinctVariationCount,
          storedThresholdMatch: observation.thresholdMatch,
          thresholdMatch: matchMonitorCriterion(
            {
              id: "distinctColorPatternCount",
              operator: "gte",
              minimum: input.minimum,
            },
            observation.distinctVariationCount,
          ),
        })),
      };
    },
  };
}

export function createMemoryMonitorService(deps: {
  resolvePlan: MonitorPlanResolver;
  requireOrganizationContext?: MonitorOrganizationContextResolver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return createMonitorService({
    store: createMemoryMonitorStore({ now }),
    resolvePlan: deps.resolvePlan,
    requireOrganizationContext: deps.requireOrganizationContext,
    now,
  });
}

export type MonitorService = ReturnType<typeof createMonitorService>;
