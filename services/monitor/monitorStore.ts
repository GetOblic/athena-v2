/**
 * Persistence port for Monitor.
 * The Supabase adapter and the in-memory test store both implement it.
 * Fencing, organization pairing, and idempotent observation identity live here.
 */

import type {
  MonitorObservationFact,
  MonitorObservationPage,
  MonitorObservationPageQuery,
} from "@/services/monitor/monitorResultPage";
import type {
  SharedCategoryRefreshInput,
  SharedCategoryRefreshResult,
} from "@/services/monitor/monitorCategoryRefresh";
import type {
  MonitorExecutionCursor,
  MonitorJob,
  MonitorObservation,
  MonitorProgress,
  MonitorSourceCoverage,
  MonitorTerminalStatus,
  SavedMonitor,
  SharedDiscoveryCoverage,
  SharedMonitorCategory,
  SharedMonitorSource,
  SharedPublicObservation,
  MonitorSharedAccessStatus,
  MonitorSharedDiscoveryStatus,
} from "@/services/monitor/monitorTypes";

export type MonitorHeartbeatWrite = {
  jobId: string;
  claimToken: string;
  leaseSeconds: number;
  progress: MonitorProgress | null;
  sourceCoverage: MonitorSourceCoverage[] | null;
  executionCursor: MonitorExecutionCursor | null;
};

export type MonitorFinalizeWrite = {
  jobId: string;
  claimToken: string;
  status: MonitorTerminalStatus;
  errorCode: string | null;
  errorMessage: string | null;
  errorMetadata: Record<string, unknown> | null;
  sourceCoverage: MonitorSourceCoverage[];
  progress: MonitorProgress;
  executionCursor: MonitorExecutionCursor;
};

export type MonitorPublishWrite = {
  jobId: string;
  claimToken: string;
  observations: MonitorObservation[];
};

export type MonitorClaimRequest = {
  workerId: string;
  claimToken: string;
  leaseSeconds: number;
  executionDeadlineSeconds: number;
  batchDeadlineSeconds: number;
  requestTimeoutMs: number;
};

export type MonitorYieldWrite = {
  jobId: string;
  claimToken: string;
  progress: MonitorProgress;
  sourceCoverage: MonitorSourceCoverage[];
  executionCursor: MonitorExecutionCursor;
};

export type ResolvedPublicObservationLink = {
  publicObservationId: string;
  thresholdMatch: boolean | null;
  categoryIds: string[];
  discoveryCoverageId: string | null;
};

export interface MonitorStore {
  insertMonitor(monitor: SavedMonitor): Promise<SavedMonitor>;
  updateMonitorConfiguration(monitor: SavedMonitor): Promise<SavedMonitor | null>;
  listMonitors(organizationId: string): Promise<SavedMonitor[]>;
  getMonitor(organizationId: string, monitorId: string): Promise<SavedMonitor | null>;
  insertJob(job: MonitorJob): Promise<MonitorJob>;
  getJob(organizationId: string, jobId: string): Promise<MonitorJob | null>;
  /**
   * Worker path. The caller must already hold, or be about to check, a claim token.
   * User reads go through getJob(organizationId, jobId).
   */
  getJobById(jobId: string): Promise<MonitorJob | null>;
  listJobs(input: {
    organizationId: string;
    monitorId: string | null;
    limit: number;
  }): Promise<MonitorJob[]>;
  listObservations(organizationId: string, jobId: string): Promise<MonitorObservation[]>;
  /**
   * One page of full observation payloads after filters and sorting.
   * Callers must not use listObservations to page customer results.
   */
  pageObservations(input: MonitorObservationPageQuery): Promise<MonitorObservationPage>;
  /**
   * Compact comparison rows for one owned job. Full product payloads are omitted.
   * The result is capped at the shared discovery family bound.
   */
  listObservationFacts(organizationId: string, jobId: string): Promise<MonitorObservationFact[]>;
  /** At most one result page of full payloads, restricted to the owned job. */
  getObservationsByIds(
    organizationId: string,
    jobId: string,
    observationIds: readonly string[],
  ): Promise<MonitorObservation[]>;
  claimNext(input: MonitorClaimRequest): Promise<MonitorJob | null>;
  heartbeat(input: MonitorHeartbeatWrite): Promise<MonitorJob | null>;
  publishObservations(input: MonitorPublishWrite): Promise<number | null>;
  finalize(input: MonitorFinalizeWrite): Promise<MonitorJob | null>;
  requestCancellation(input: {
    organizationId: string;
    jobId: string;
  }): Promise<MonitorJob | null>;
  recoverExpired(): Promise<number>;
  yieldJob(input: MonitorYieldWrite): Promise<MonitorJob | null>;
  ensureSharedSource(source: SharedMonitorSource): Promise<SharedMonitorSource>;
  getSharedSourceByHost(normalizedHost: string): Promise<SharedMonitorSource | null>;
  getSharedSourceByRegisteredId(registeredSourceId: string): Promise<SharedMonitorSource | null>;
  listSharedSources(): Promise<SharedMonitorSource[]>;
  recordSourceDiscovery(input: {
    sourceId: string;
    discoveredAt: string;
    discoveryStatus: MonitorSharedDiscoveryStatus;
  }): Promise<SharedMonitorSource | null>;
  recordTechnicalAccess(input: {
    sourceId: string;
    accessStatus: MonitorSharedAccessStatus;
    retryAfter: string | null;
  }): Promise<SharedMonitorSource | null>;
  /**
   * Reconciles categories by stable (source, category key) identity.
   * Does not delete categories, coverage, or observations.
   * The Supabase adapter performs the publication as one RPC.
   * The memory adapter simulates the outcome contract only.
   */
  refreshSharedCategories(input: SharedCategoryRefreshInput): Promise<SharedCategoryRefreshResult>;
  /**
   * Source row and its categories from one coherent read.
   * Supabase uses one embedded select, which is one SQL statement.
   * The memory adapter copies both arrays without yielding.
   * Coverage and observations are not part of this read.
   */
  readSharedDiscoverySnapshot(sourceId: string): Promise<{
    source: SharedMonitorSource;
    categories: SharedMonitorCategory[];
  } | null>;
  listSharedCategories(sourceId: string): Promise<SharedMonitorCategory[]>;
  savePublicObservation(
    observation: SharedPublicObservation,
  ): Promise<{ observation: SharedPublicObservation; created: boolean }>;
  listPublicObservations(sourceId: string): Promise<SharedPublicObservation[]>;
  getPublicObservation(id: string): Promise<SharedPublicObservation | null>;
  saveDiscoveryCoverage(coverage: SharedDiscoveryCoverage): Promise<SharedDiscoveryCoverage>;
  /**
   * Historical coverage for one source, oldest discovered_at first.
   * Completeness and continuation must not use this list.
   */
  listDiscoveryCoverage(sourceId: string): Promise<SharedDiscoveryCoverage[]>;
  /**
   * Newest coverage attempt for one source and scope.
   * discovered_at selects the attempt. An equal timestamp stays stable:
   * the production read orders id descending, and the memory store keeps the later stored row.
   * Status, adapter version, schema version, and freshness stay with the caller.
   */
  latestDiscoveryCoverageForScope(
    sourceId: string,
    scopeKey: string,
  ): Promise<SharedDiscoveryCoverage | null>;
  /**
   * Attaches observations the server has already resolved.
   * A public observation from another registered source is rejected.
   */
  attachResolvedPublicObservations(input: {
    jobId: string;
    claimToken: string;
    links: ResolvedPublicObservationLink[];
  }): Promise<number | null>;
}
