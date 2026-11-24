/**
 * In-memory Monitor persistence.
 * Mirrors the SQL claim, fence, cancellation, and observation identity rules.
 * This is not a PostgreSQL runtime.
 */

import { randomUUID } from "node:crypto";

import { classifyMonitorLease, completedSourceIsAccounted } from "@/services/monitor/monitorExecution";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  compareMonitorResultFields,
  factFromObservation,
  MONITOR_RESULT_FACT_LIMIT,
  monitorResultMatches,
  pageWindow,
  type MonitorObservationPageQuery,
} from "@/services/monitor/monitorResultPage";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import {
  buildSharedPublicObservation,
  payloadFromPublicObservation,
} from "@/services/monitor/monitorObservation";
import { sharedSourceHasCustomerFields } from "@/services/monitor/monitorWebsiteIdentity";
import type {
  MonitorClaimRequest,
  MonitorFinalizeWrite,
  MonitorHeartbeatWrite,
  MonitorPublishWrite,
  MonitorStore,
  MonitorYieldWrite,
  ResolvedPublicObservationLink,
} from "@/services/monitor/monitorStore";
import {
  isTerminalMonitorStatus,
  type MonitorJob,
  type MonitorObservation,
  type SavedMonitor,
  type SharedDiscoveryCoverage,
  type SharedMonitorCategory,
  type SharedMonitorSource,
  type SharedPublicObservation,
} from "@/services/monitor/monitorTypes";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stampTerminal(job: MonitorJob, now: string, code: string, message: string): void {
  job.completedAt = job.completedAt ?? now;
  job.updatedAt = now;
  job.claimExpiresAt = null;
  job.errorCode = job.errorCode ?? code;
  job.errorMessage = job.errorMessage ?? message;
}

export function createMemoryMonitorStore(deps?: {
  now?: () => Date;
}): MonitorStore {
  const now = deps?.now ?? (() => new Date());
  const monitors: SavedMonitor[] = [];
  const jobs: MonitorJob[] = [];
  const observations: MonitorObservation[] = [];
  const sharedSources: SharedMonitorSource[] = [];
  const sharedCategories: SharedMonitorCategory[] = [];
  const publicObservations: SharedPublicObservation[] = [];
  const discoveryCoverage: SharedDiscoveryCoverage[] = [];

  function instant(): string {
    return now().toISOString();
  }

  function requireProcessingLease(job: MonitorJob, claimToken: string): void {
    if (job.status !== "processing" || job.claimToken !== claimToken) {
      throw new MonitorOperationError("STALE_CLAIM");
    }
    const state = classifyMonitorLease({
      now: now().getTime(),
      claimExpiresAt: job.claimExpiresAt,
      batchDeadlineAt: job.batchDeadlineAt,
      executionDeadlineAt: job.executionDeadlineAt,
    });
    if (state !== "ok") throw new MonitorOperationError(state);
  }

  function hydrate(observation: MonitorObservation): MonitorObservation {
    const shared = publicObservations.find((item) => item.id === observation.publicObservationId);
    if (!shared) return clone(observation);
    return {
      ...clone(observation),
      observedAt: shared.observedAt,
      productUrl: shared.canonicalUrl,
      familyId: shared.familyId,
      payload: payloadFromPublicObservation(shared, observation.thresholdMatch),
      adapterId: shared.adapterId,
      adapterVersion: shared.adapterVersion,
      schemaVersion: shared.schemaVersion,
      contentKey: shared.contentKey,
      sharedSourceId: shared.sourceId,
    };
  }

  function sourceForRegisteredId(registeredSourceId: string): SharedMonitorSource {
    const existing = sharedSources.find((item) => item.registeredSourceId === registeredSourceId);
    if (existing) return existing;
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Shared website is not registered.");
  }

  function rememberPublic(observation: MonitorObservation, reused: boolean): MonitorObservation {
    const source = sourceForRegisteredId(observation.sourceId);
    const draft = buildSharedPublicObservation({
      id: randomUUID(),
      source,
      familyId: observation.familyId,
      canonicalUrl: observation.productUrl,
      payload: observation.payload,
      observedAt: observation.observedAt,
      categoryIds: observation.categoryIds,
      createdAt: observation.createdAt,
    });
    const existing = publicObservations.find(
      (item) => item.sourceId === source.id && item.contentKey === draft.contentKey,
    );
    const shared = existing ?? draft;
    if (!existing) publicObservations.push(shared);
    return {
      ...observation,
      publicObservationId: shared.id,
      sharedSourceId: source.id,
      reused: existing ? true : reused,
      adapterId: shared.adapterId,
      adapterVersion: shared.adapterVersion,
      schemaVersion: shared.schemaVersion,
      contentKey: shared.contentKey,
      observedAt: shared.observedAt,
      payload: payloadFromPublicObservation(shared, observation.thresholdMatch),
    };
  }

  const store: MonitorStore = {
    async insertMonitor(monitor) {
      monitors.push(clone(monitor));
      return clone(monitor);
    },

    async updateMonitorConfiguration(monitor) {
      const current = monitors.find(
        (item) => item.id === monitor.id && item.organizationId === monitor.organizationId,
      );
      if (!current) return null;
      current.name = monitor.name;
      current.configuration = clone(monitor.configuration);
      current.configurationVersion = monitor.configurationVersion;
      current.updatedAt = monitor.updatedAt;
      return clone(current);
    },

    async listMonitors(organizationId) {
      return monitors
        .filter((monitor) => monitor.organizationId === organizationId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((monitor) => clone(monitor));
    },

    async getMonitor(organizationId, monitorId) {
      const monitor = monitors.find(
        (item) => item.id === monitorId && item.organizationId === organizationId,
      );
      return monitor ? clone(monitor) : null;
    },

    async insertJob(job) {
      const active = jobs.find(
        (item) =>
          item.organizationId === job.organizationId &&
          item.monitorId === job.monitorId &&
          (item.status === "queued" || item.status === "processing"),
      );
      if (active) {
        throw new MonitorOperationError("ACTIVE_JOB_EXISTS");
      }
      const owned = monitors.find(
        (monitor) => monitor.id === job.monitorId && monitor.organizationId === job.organizationId,
      );
      if (!owned) {
        throw new MonitorOperationError("CROSS_ORGANIZATION");
      }
      jobs.push(clone(job));
      return clone(job);
    },

    async getJob(organizationId, jobId) {
      const job = jobs.find(
        (item) => item.id === jobId && item.organizationId === organizationId,
      );
      return job ? clone(job) : null;
    },

    async getJobById(jobId) {
      const job = jobs.find((item) => item.id === jobId);
      return job ? clone(job) : null;
    },

    async listJobs(input) {
      return jobs
        .filter(
          (job) =>
            job.organizationId === input.organizationId &&
            (input.monitorId == null || job.monitorId === input.monitorId),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, input.limit)
        .map((job) => clone(job));
    },

    async listObservations(organizationId, jobId) {
      const job = jobs.find((item) => item.id === jobId && item.organizationId === organizationId);
      if (!job) return [];
      return observations
        .filter(
          (observation) =>
            observation.organizationId === organizationId && observation.jobId === jobId,
        )
        .map((observation) => hydrate(observation));
    },

    async pageObservations(input: MonitorObservationPageQuery) {
      const rows = await store.listObservations(input.organizationId, input.jobId);
      const matched = rows.filter((observation) => {
        if (input.sourceIds && !input.sourceIds.includes(observation.sourceId)) return false;
        return monitorResultMatches(
          {
            id: observation.id,
            sourceId: observation.sourceId,
            retailer: getMonitorSource(observation.sourceId)?.displayName ?? observation.sourceId,
            category: observation.payload.category,
            priceAmount: observation.payload.price.amount,
            distinctVariationCount: observation.payload.distinctVariationCount,
            observedAt: observation.observedAt,
            changeRank: 0,
          },
          input,
        );
      });
      const ordered = [...matched].sort((left, right) =>
        compareMonitorResultFields(
          {
            id: left.id,
            sourceId: left.sourceId,
            retailer: getMonitorSource(left.sourceId)?.displayName ?? left.sourceId,
            category: left.payload.category,
            priceAmount: left.payload.price.amount,
            distinctVariationCount: left.payload.distinctVariationCount,
            observedAt: left.observedAt,
            changeRank: 0,
          },
          {
            id: right.id,
            sourceId: right.sourceId,
            retailer: getMonitorSource(right.sourceId)?.displayName ?? right.sourceId,
            category: right.payload.category,
            priceAmount: right.payload.price.amount,
            distinctVariationCount: right.payload.distinctVariationCount,
            observedAt: right.observedAt,
            changeRank: 0,
          },
          input.sort,
        ),
      );
      const window = pageWindow(ordered.length, input.page, input.pageSize);
      return {
        observations: ordered.slice(window.offset, window.offset + window.pageSize),
        total: window.total,
        page: window.page,
        pageSize: window.pageSize,
        pageCount: window.pageCount,
      };
    },

    async listObservationFacts(organizationId, jobId) {
      const rows = await store.listObservations(organizationId, jobId);
      if (rows.length > MONITOR_RESULT_FACT_LIMIT) {
        throw new MonitorOperationError("RESULT_BOUND");
      }
      return rows.map((observation) => factFromObservation(observation));
    },

    async getObservationsByIds(organizationId, jobId, observationIds) {
      if (observationIds.length > 24) throw new MonitorOperationError("RESULT_BOUND");
      const allowed = new Set(observationIds);
      const rows = await store.listObservations(organizationId, jobId);
      const byId = new Map(rows.map((observation) => [observation.id, observation]));
      return observationIds
        .filter((id) => allowed.has(id))
        .map((id) => byId.get(id))
        .filter((observation): observation is NonNullable<typeof observation> => observation != null);
    },

    async recoverExpired() {
      let recovered = 0;
      const stamp = instant();
      for (const job of jobs) {
        if (job.status !== "processing") continue;
        const leaseExpired =
          job.claimExpiresAt != null && Date.parse(job.claimExpiresAt) < now().getTime();
        if (!leaseExpired) continue;
        if (job.cancellationRequestedAt) {
          job.status = "cancelled";
          stampTerminal(
            job,
            stamp,
            "CANCELLED",
            "Cancellation was requested and the processing lease expired.",
          );
          recovered += 1;
          continue;
        }
        if (job.executionDeadlineAt && Date.parse(job.executionDeadlineAt) <= now().getTime()) {
          job.status = "failed";
          stampTerminal(
            job,
            stamp,
            "EXECUTION_DEADLINE",
            "Execution deadline passed before the job finished.",
          );
          recovered += 1;
        }
      }
      return recovered;
    },

    async claimNext(input: MonitorClaimRequest) {
      await store.recoverExpired();
      const current = now().getTime();
      const candidate = jobs
        .filter((job) => {
          if (job.status === "queued") return true;
          if (job.status !== "processing") return false;
          if (job.cancellationRequestedAt) return false;
          if (!job.claimExpiresAt || Date.parse(job.claimExpiresAt) >= current) return false;
          if (job.executionDeadlineAt && Date.parse(job.executionDeadlineAt) <= current) {
            return false;
          }
          return true;
        })
        .sort((left, right) => {
          const leftKey = left.batchCompletedAt ?? left.createdAt;
          const rightKey = right.batchCompletedAt ?? right.createdAt;
          return (
            leftKey.localeCompare(rightKey) ||
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id)
          );
        })[0];
      if (!candidate) return null;
      const stamp = new Date(current).toISOString();
      const leaseMs = input.leaseSeconds * 1000;
      const deadlineMs = input.executionDeadlineSeconds * 1000;
      const batchMs = input.batchDeadlineSeconds * 1000;
      candidate.status = "processing";
      candidate.claimedBy = input.workerId;
      candidate.claimToken = input.claimToken;
      candidate.claimedAt = stamp;
      candidate.heartbeatAt = stamp;
      candidate.startedAt = candidate.startedAt ?? stamp;
      candidate.executionDeadlineAt =
        candidate.executionDeadlineAt ?? new Date(current + deadlineMs).toISOString();
      const batchDeadline = new Date(current + batchMs).toISOString();
      candidate.batchDeadlineAt =
        candidate.executionDeadlineAt && batchDeadline > candidate.executionDeadlineAt
          ? candidate.executionDeadlineAt
          : batchDeadline;
      candidate.requestTimeoutMs = input.requestTimeoutMs;
      candidate.claimExpiresAt = new Date(current + leaseMs).toISOString();
      if (candidate.batchDeadlineAt && candidate.claimExpiresAt > candidate.batchDeadlineAt) {
        candidate.claimExpiresAt = candidate.batchDeadlineAt;
      }
      if (candidate.executionDeadlineAt && candidate.claimExpiresAt > candidate.executionDeadlineAt) {
        candidate.claimExpiresAt = candidate.executionDeadlineAt;
      }
      candidate.attemptCount += 1;
      candidate.updatedAt = stamp;
      return clone(candidate);
    },

    async heartbeat(input: MonitorHeartbeatWrite) {
      const job = jobs.find((item) => item.id === input.jobId);
      if (!job) return null;
      try {
        requireProcessingLease(job, input.claimToken);
      } catch (error) {
        if (error instanceof MonitorOperationError && error.code === "STALE_CLAIM") return null;
        throw error;
      }
      const current = now().getTime();
      const stamp = new Date(current).toISOString();
      let leaseEnd = new Date(current + input.leaseSeconds * 1000).toISOString();
      if (job.batchDeadlineAt && leaseEnd > job.batchDeadlineAt) leaseEnd = job.batchDeadlineAt;
      if (job.executionDeadlineAt && leaseEnd > job.executionDeadlineAt) {
        leaseEnd = job.executionDeadlineAt;
      }
      job.heartbeatAt = stamp;
      job.claimExpiresAt = leaseEnd;
      job.updatedAt = stamp;
      if (input.progress) job.progress = clone(input.progress);
      if (input.sourceCoverage) job.sourceCoverage = clone(input.sourceCoverage);
      if (input.executionCursor) job.executionCursor = clone(input.executionCursor);
      return clone(job);
    },

    async publishObservations(input: MonitorPublishWrite) {
      const job = jobs.find((item) => item.id === input.jobId);
      if (!job) return null;
      try {
        requireProcessingLease(job, input.claimToken);
      } catch (error) {
        if (error instanceof MonitorOperationError && error.code === "STALE_CLAIM") return null;
        throw error;
      }
      if (job.cancellationRequestedAt) {
        throw new MonitorOperationError("CANCELLED");
      }
      if (input.observations.length > 20) {
        throw new MonitorOperationError("BATCH_BOUND");
      }
      let inserted = 0;
      for (const observation of input.observations) {
        if (
          observation.organizationId !== job.organizationId ||
          observation.monitorId !== job.monitorId ||
          observation.jobId !== job.id
        ) {
          throw new MonitorOperationError("CROSS_ORGANIZATION");
        }
        const exists = observations.some(
          (current) =>
            current.jobId === observation.jobId &&
            current.sourceId === observation.sourceId &&
            current.familyId === observation.familyId,
        );
        if (exists) continue;
        if (!sharedSources.some((item) => item.registeredSourceId === observation.sourceId)) {
          throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Shared website is not registered.");
        }
        observations.push(rememberPublic(clone(observation), observation.reused));
        inserted += 1;
      }
      return inserted;
    },

    async finalize(input: MonitorFinalizeWrite) {
      const job = jobs.find((item) => item.id === input.jobId);
      if (!job) return null;
      if (isTerminalMonitorStatus(job.status) && job.status === input.status) {
        return clone(job);
      }
      if (job.status !== "processing" || job.claimToken !== input.claimToken) return null;
      const leaseState = classifyMonitorLease({
        now: now().getTime(),
        claimExpiresAt: job.claimExpiresAt,
        batchDeadlineAt: job.batchDeadlineAt,
        executionDeadlineAt: job.executionDeadlineAt,
      });
      if (leaseState === "BATCH_DEADLINE" || leaseState === "EXECUTION_DEADLINE") {
        throw new MonitorOperationError(leaseState);
      }
      if (leaseState !== "ok") return null;
      if (job.cancellationRequestedAt && input.status !== "cancelled") {
        throw new MonitorOperationError("CANCELLED");
      }
      if (
        input.status === "completed" &&
        !input.sourceCoverage.every((source) => completedSourceIsAccounted(source))
      ) {
        throw new MonitorOperationError("INCOMPLETE_COVERAGE");
      }
      const stamp = instant();
      job.status = input.status;
      job.sourceCoverage = clone(input.sourceCoverage);
      job.progress = clone(input.progress);
      job.executionCursor = clone(input.executionCursor);
      job.errorCode = input.errorCode;
      job.errorMessage = input.errorMessage;
      job.errorMetadata = input.errorMetadata ? clone(input.errorMetadata) : null;
      job.completedAt = stamp;
      job.updatedAt = stamp;
      job.claimExpiresAt = null;
      if (input.status === "completed") {
        const monitor = monitors.find(
          (item) => item.id === job.monitorId && item.organizationId === job.organizationId,
        );
        if (!monitor) throw new MonitorOperationError("CROSS_ORGANIZATION");
        monitor.lastSuccessfulJobId = job.id;
        monitor.lastSuccessfulAt = stamp;
        monitor.updatedAt = stamp;
      }
      return clone(job);
    },

    async requestCancellation(input) {
      const job = jobs.find(
        (item) => item.id === input.jobId && item.organizationId === input.organizationId,
      );
      if (!job) return null;
      const stamp = instant();
      if (job.status === "cancelled") return clone(job);
      if (job.status === "queued") {
        job.status = "cancelled";
        job.cancellationRequestedAt = job.cancellationRequestedAt ?? stamp;
        job.errorCode = "CANCELLED";
        job.errorMessage = "Cancelled before execution started.";
        job.completedAt = stamp;
        job.updatedAt = stamp;
        job.claimToken = null;
        job.claimExpiresAt = null;
        return clone(job);
      }
      if (job.status === "processing") {
        job.cancellationRequestedAt = job.cancellationRequestedAt ?? stamp;
        job.updatedAt = stamp;
        return clone(job);
      }
      throw new MonitorOperationError("NOT_CANCELLABLE");
    },

    async yieldJob(input: MonitorYieldWrite) {
      const job = jobs.find((item) => item.id === input.jobId);
      if (!job) return null;
      try {
        requireProcessingLease(job, input.claimToken);
      } catch (error) {
        if (error instanceof MonitorOperationError && error.code === "STALE_CLAIM") return null;
        throw error;
      }
      if (job.cancellationRequestedAt) throw new MonitorOperationError("CANCELLED");
      const stamp = instant();
      job.progress = clone(input.progress);
      job.sourceCoverage = clone(input.sourceCoverage);
      job.executionCursor = clone(input.executionCursor);
      job.batchCompletedAt = stamp;
      job.claimExpiresAt = new Date(now().getTime() - 1).toISOString();
      job.updatedAt = stamp;
      return clone(job);
    },

    async ensureSharedSource(source) {
      if (sharedSourceHasCustomerFields(source) || "organizationId" in source) {
        throw new MonitorOperationError("INVALID_CONFIGURATION", "Shared website configuration is public only.");
      }
      const existing = sharedSources.find((item) => item.normalizedHost === source.normalizedHost);
      if (existing) return clone(existing);
      sharedSources.push(clone(source));
      return clone(source);
    },

    async getSharedSourceByHost(normalizedHost) {
      const source = sharedSources.find((item) => item.normalizedHost === normalizedHost);
      return source ? clone(source) : null;
    },

    async getSharedSourceByRegisteredId(registeredSourceId) {
      const source = sharedSources.find((item) => item.registeredSourceId === registeredSourceId);
      return source ? clone(source) : null;
    },

    async listSharedSources() {
      return sharedSources.map((source) => clone(source));
    },

    async recordSourceDiscovery(input) {
      const source = sharedSources.find((item) => item.id === input.sourceId);
      if (!source) return null;
      source.discoveryStatus = input.discoveryStatus;
      source.lastDiscoveredAt = input.discoveredAt;
      source.updatedAt = input.discoveredAt;
      return clone(source);
    },

    async recordTechnicalAccess(input) {
      const source = sharedSources.find((item) => item.id === input.sourceId);
      if (!source) return null;
      source.accessStatus = input.accessStatus;
      source.retryAfter = input.retryAfter;
      source.updatedAt = instant();
      return clone(source);
    },

    async saveSharedCategories(sourceId, categories) {
      const source = sharedSources.find((item) => item.id === sourceId);
      if (!source) throw new MonitorOperationError("UNSUPPORTED_SOURCE");
      const kept = sharedCategories.filter((category) => category.sourceId !== sourceId);
      const saved: SharedMonitorCategory[] = [];
      for (const category of categories) {
        if (category.sourceId !== sourceId) {
          throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Category source does not match.");
        }
        if (sharedSourceHasCustomerFields(category)) {
          throw new MonitorOperationError("INVALID_CONFIGURATION");
        }
        saved.push(clone(category));
      }
      const byKey = new Map(saved.map((category) => [category.categoryKey, category]));
      for (const category of saved) {
        if (!category.parentCategoryKey) continue;
        const parent = byKey.get(category.parentCategoryKey);
        if (!parent || parent.sourceId !== sourceId) {
          throw new MonitorOperationError("INVALID_CONFIGURATION", "Parent category is not on this website.");
        }
        category.parentCategoryId = parent.id;
      }
      sharedCategories.splice(0, sharedCategories.length, ...kept, ...saved);
      return saved.map((category) => clone(category));
    },

    async listSharedCategories(sourceId) {
      return sharedCategories
        .filter((category) => category.sourceId === sourceId)
        .map((category) => clone(category));
    },

    async savePublicObservation(observation) {
      if (sharedSourceHasCustomerFields(observation.provenance) || "organizationId" in observation) {
        throw new MonitorOperationError("INVALID_CONFIGURATION");
      }
      const existing = publicObservations.find(
        (item) => item.sourceId === observation.sourceId && item.contentKey === observation.contentKey,
      );
      if (existing) return { observation: clone(existing), created: false };
      publicObservations.push(clone(observation));
      return { observation: clone(observation), created: true };
    },

    async listPublicObservations(sourceId) {
      return publicObservations
        .filter((observation) => observation.sourceId === sourceId)
        .map((observation) => clone(observation));
    },

    async getPublicObservation(id) {
      const observation = publicObservations.find((item) => item.id === id);
      return observation ? clone(observation) : null;
    },

    async saveDiscoveryCoverage(coverage) {
      if ("organizationId" in coverage || sharedSourceHasCustomerFields(coverage)) {
        throw new MonitorOperationError("INVALID_CONFIGURATION");
      }
      const existing = discoveryCoverage.find((item) => item.id === coverage.id);
      if (existing) return clone(existing);
      discoveryCoverage.push(clone(coverage));
      return clone(coverage);
    },

    async listDiscoveryCoverage(sourceId) {
      return discoveryCoverage
        .filter((coverage) => coverage.sourceId === sourceId)
        .map((coverage) => clone(coverage));
    },

    async attachResolvedPublicObservations(input: {
      jobId: string;
      claimToken: string;
      links: ResolvedPublicObservationLink[];
    }) {
      const job = jobs.find((item) => item.id === input.jobId);
      if (!job) return null;
      try {
        requireProcessingLease(job, input.claimToken);
      } catch (error) {
        if (error instanceof MonitorOperationError && error.code === "STALE_CLAIM") return null;
        throw error;
      }
      if (job.cancellationRequestedAt) throw new MonitorOperationError("CANCELLED");
      if (input.links.length > 20) throw new MonitorOperationError("BATCH_BOUND");
      let inserted = 0;
      for (const link of input.links) {
        const shared = publicObservations.find((item) => item.id === link.publicObservationId);
        if (!shared) {
          throw new MonitorOperationError(
            "PUBLIC_OBSERVATION_NOT_ATTACHABLE",
            "Public observation was not resolved for this website.",
          );
        }
        const allowed = job.configurationSnapshot.sources.some(
          (source) => source.sourceId === shared.registeredSourceId,
        );
        if (!allowed) {
          throw new MonitorOperationError(
            "PUBLIC_OBSERVATION_NOT_ATTACHABLE",
            "Public observation source is outside the job snapshot.",
          );
        }
        const exists = observations.some(
          (current) =>
            current.jobId === job.id &&
            current.sourceId === shared.registeredSourceId &&
            current.familyId === shared.familyId,
        );
        if (exists) continue;
        const stamp = instant();
        observations.push({
          id: randomUUID(),
          organizationId: job.organizationId,
          monitorId: job.monitorId,
          jobId: job.id,
          sourceId: shared.registeredSourceId,
          familyId: shared.familyId,
          productUrl: shared.canonicalUrl,
          observedAt: shared.observedAt,
          thresholdMatch: link.thresholdMatch,
          payloadVersion: 1,
          payload: payloadFromPublicObservation(shared, link.thresholdMatch),
          publicObservationId: shared.id,
          sharedSourceId: shared.sourceId,
          reused: true,
          adapterId: shared.adapterId,
          adapterVersion: shared.adapterVersion,
          schemaVersion: shared.schemaVersion,
          contentKey: shared.contentKey,
          categoryIds: [...link.categoryIds],
          discoveryCoverageId: link.discoveryCoverageId,
          createdAt: stamp,
        });
        inserted += 1;
      }
      return inserted;
    },
  };
  return store;
}
