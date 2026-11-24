import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import { ATHENA_MONITOR_WORKER_DEFAULTS, ATHENA_MONITOR_WORKER_NAME } from "../../services/monitor/monitorRuntime";
import {
  ORG_A,
  ORG_B,
  completedCoverage,
  createClock,
  createFoundation,
  mixedConfiguration,
  observationDraft,
  toscaneConfiguration,
} from "./helpers";

describe("durable Monitor job lifecycle", () => {
  it("uses the proposed worker defaults and prevents a second active execution", async () => {
    assert.equal(ATHENA_MONITOR_WORKER_NAME, "athena-v2-monitor-worker");
    assert.deepEqual(
      {
        concurrency: ATHENA_MONITOR_WORKER_DEFAULTS.concurrency,
        batchSize: ATHENA_MONITOR_WORKER_DEFAULTS.batchSize,
        pollIntervalMs: ATHENA_MONITOR_WORKER_DEFAULTS.pollIntervalMs,
        heartbeatIntervalMs: ATHENA_MONITOR_WORKER_DEFAULTS.heartbeatIntervalMs,
        leaseSeconds: ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds,
      },
      {
        concurrency: 1,
        batchSize: 20,
        pollIntervalMs: 3_000,
        heartbeatIntervalMs: 20_000,
        leaseSeconds: 120,
      },
    );
    const { service } = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" } });
    const first = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "One" }),
    });
    const second = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Two" }),
    });
    const otherOrg = await service.createMonitor({
      organizationId: ORG_B,
      userId: null,
      configuration: toscaneConfiguration({ name: "Other" }),
    });
    const active = await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: first.id });
    await assert.rejects(
      () => service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: first.id }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ACTIVE_JOB_EXISTS",
    );
    const anotherMonitor = await service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: second.id,
    });
    const other = await service.enqueueMonitorJob({
      organizationId: ORG_B,
      monitorId: otherOrg.id,
    });
    assert.notEqual(active.id, anotherMonitor.id);
    assert.equal(other.organizationId, ORG_B);
    assert.equal((await service.listMonitors(ORG_A)).length, 2);
    assert.equal((await service.listMonitors(ORG_B)).map((monitor) => monitor.id).includes(first.id), false);
  });

  it("fences an expired claim, preserves the cursor, and rejects stale publication", async () => {
    const clock = createClock();
    const { service } = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const first = await service.claimNextMonitorJob({ claimToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    assert.equal(first?.disposition, "claimed");
    assert.equal(first?.job.claimedBy, ATHENA_MONITOR_WORKER_NAME);
    assert.equal(first?.job.executionCursor.sources[0]?.nextIndex, 0);
    const heartbeat = await service.heartbeatMonitorJob({
      jobId: first!.job.id,
      claimToken: first!.job.claimToken!,
      executionCursor: {
        version: 1,
        sources: [
          {
            sourceId: "toscane",
            phase: "extract",
            nextIndex: 20,
            categoryUrl: null,
          },
        ],
      },
      progress: { version: 1, familiesDiscovered: 20, familiesAnalyzed: 0, familiesPersisted: 0 },
    });
    assert.equal(heartbeat.executionCursor.sources[0]?.nextIndex, 20);
    clock.advance(ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds * 1000 + 1000);
    await assert.rejects(
      () =>
        service.persistMonitorObservations({
          jobId: first!.job.id,
          claimToken: first!.job.claimToken!,
          observations: [observationDraft("9330", 4)],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "STALE_CLAIM",
    );
    const second = await service.claimNextMonitorJob({
      claimToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      workerId: "worker-b",
    });
    assert.equal(second?.job.id, first?.job.id);
    assert.equal(second?.job.claimToken, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assert.equal(second?.job.executionCursor.sources[0]?.nextIndex, 20);
    assert.equal(second?.job.attemptCount, 2);
    await assert.rejects(
      () =>
        service.finalizeMonitorJob({
          jobId: first!.job.id,
          claimToken: first!.job.claimToken!,
          status: "completed",
          sourceCoverage: completedCoverage(second!.job),
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "STALE_CLAIM",
    );
    const published = await service.persistMonitorObservations({
      jobId: second!.job.id,
      claimToken: second!.job.claimToken!,
      observations: [observationDraft("9330", 4), observationDraft("9330", 9, { priceAmount: "10.00" })],
    });
    assert.equal(published.inserted, 1);
    const again = await service.persistMonitorObservations({
      jobId: second!.job.id,
      claimToken: second!.job.claimToken!,
      observations: [observationDraft("9330", 4)],
    });
    assert.equal(again.inserted, 0);
    const rows = await service.refilterMonitorJob({
      organizationId: ORG_A,
      jobId: second!.job.id,
      minimum: 3,
    });
    assert.equal(rows.observations.length, 1);
    assert.equal(rows.observations[0]?.distinctVariationCount, 4);
    assert.equal(rows.networkRequests, 0);
  });

  it("does not resume an explicitly cancelled job and recovers that state idempotently", async () => {
    const clock = createClock();
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    const queued = await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const cancelled = await service.requestMonitorCancellation({
      organizationId: ORG_A,
      jobId: queued.id,
    });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(await service.claimNextMonitorJob(), null);
    const replacement = await service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: monitor.id,
    });
    const claimed = await service.claimNextMonitorJob();
    assert.equal(claimed?.job.id, replacement.id);
    await service.requestMonitorCancellation({ organizationId: ORG_A, jobId: replacement.id });
    await assert.rejects(
      () =>
        service.finalizeMonitorJob({
          jobId: replacement.id,
          claimToken: claimed!.job.claimToken!,
          status: "completed",
          sourceCoverage: completedCoverage(claimed!.job),
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "CANCELLED",
    );
    clock.advance(ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds * 1000 + 1000);
    const recovered = await service.recoverMonitorJobs();
    const repeated = await service.recoverMonitorJobs();
    const stored = await store.getJob(ORG_A, replacement.id);
    assert.equal(recovered.recovered, 1);
    assert.equal(repeated.recovered, 0);
    assert.equal(stored?.status, "cancelled");
    assert.equal(await service.claimNextMonitorJob(), null);
    assert.equal((await store.getMonitor(ORG_A, monitor.id))?.lastSuccessfulJobId, null);
  });

  it("fails an expired execution deadline instead of reclaiming it", async () => {
    const clock = createClock();
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await service.claimNextMonitorJob();
    clock.advance(ATHENA_MONITOR_WORKER_DEFAULTS.executionDeadlineSeconds * 1000 + 1000);
    assert.equal((await service.recoverMonitorJobs()).recovered, 1);
    assert.equal(await service.claimNextMonitorJob(), null);
    const job = await store.getJob(ORG_A, claimed!.job.id);
    assert.equal(job?.status, "failed");
    assert.equal(job?.errorCode, "EXECUTION_DEADLINE");
    assert.equal((await store.getMonitor(ORG_A, monitor.id))?.lastSuccessfulJobId, null);
  });

  it("blocks production-inaccessible sources without a network request", async () => {
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full" } });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: {
        ...toscaneConfiguration(),
        sources: [
          {
            sourceId: "breal",
            websiteUrl: "https://www.breal.net/",
            selection: { mode: "whole_catalog" },
          },
        ],
      },
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await service.claimNextMonitorJob();
    assert.equal(claimed?.disposition, "blocked");
    assert.equal(claimed?.job.status, "blocked");
    assert.equal(claimed?.job.errorCode, "PRODUCTION_ACCESS_BLOCKED");
    assert.equal((await store.listObservations(ORG_A, claimed!.job.id)).length, 0);
    assert.equal((await store.getMonitor(ORG_A, monitor.id))?.lastSuccessfulJobId, null);
  });

  it("rechecks entitlement at claim and before a batch, and keeps the previous baseline", async () => {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" } });
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: mixedConfiguration(),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const first = await foundation.service.claimNextMonitorJob();
    assert.equal(first?.disposition, "claimed");
    assert.equal(first?.job.sourceCoverage.find((source) => source.sourceId === "breal")?.status, "blocked");
    const batch = await foundation.service.prepareMonitorExtractionBatch({
      jobId: first!.job.id,
      claimToken: first!.job.claimToken!,
    });
    assert.equal(batch.action, "extract");
    if (batch.action === "extract") assert.equal(batch.sourceId, "toscane");
    await foundation.service.persistMonitorObservations({
      jobId: first!.job.id,
      claimToken: first!.job.claimToken!,
      observations: [observationDraft("9330", 4)],
    });
    const completed = await foundation.service.finalizeMonitorJob({
      jobId: first!.job.id,
      claimToken: first!.job.claimToken!,
      status: "partial",
      sourceCoverage: first!.job.sourceCoverage.map((source) =>
        source.sourceId === "toscane" ? { ...source, status: "completed", errorCode: null } : source,
      ),
    });
    assert.equal(completed.status, "partial");
    assert.equal((await foundation.store.getMonitor(ORG_A, monitor.id))?.lastSuccessfulJobId, null);

    const successMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Baseline" }),
    });
    await foundation.service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: successMonitor.id,
    });
    const successClaim = await foundation.service.claimNextMonitorJob();
    await foundation.service.finalizeMonitorJob({
      jobId: successClaim!.job.id,
      claimToken: successClaim!.job.claimToken!,
      status: "completed",
      sourceCoverage: completedCoverage(successClaim!.job),
    });
    const baseline = (await foundation.store.getMonitor(ORG_A, successMonitor.id))?.lastSuccessfulJobId;
    assert.equal(baseline, successClaim?.job.id);

    await foundation.service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: successMonitor.id,
    });
    foundation.plans.set(ORG_A, "free");
    const blocked = await foundation.service.claimNextMonitorJob();
    assert.equal(blocked?.disposition, "blocked");
    assert.equal(blocked?.job.status, "blocked");
    assert.equal(blocked?.job.errorCode, "ENTITLEMENT_REQUIRED");
    assert.equal(
      (await foundation.store.getMonitor(ORG_A, successMonitor.id))?.lastSuccessfulJobId,
      baseline,
    );
    assert.equal(foundation.calls.includes("publishObservations"), true);
    const publishCallsBefore = foundation.calls.filter((call) => call === "publishObservations").length;
    foundation.plans.set(ORG_A, "full");
    await foundation.service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: successMonitor.id,
    });
    const midFlight = await foundation.service.claimNextMonitorJob();
    foundation.plans.set(ORG_A, "free");
    const stopped = await foundation.service.prepareMonitorExtractionBatch({
      jobId: midFlight!.job.id,
      claimToken: midFlight!.job.claimToken!,
    });
    assert.equal(stopped.action, "stop");
    assert.equal(stopped.reason, "ENTITLEMENT_REQUIRED");
    await assert.rejects(
      () =>
        foundation.service.persistMonitorObservations({
          jobId: midFlight!.job.id,
          claimToken: midFlight!.job.claimToken!,
          observations: [observationDraft("1000", 4)],
        }),
      (error: unknown) =>
        error instanceof MonitorOperationError &&
        (error.code === "ENTITLEMENT_REQUIRED" || error.code === "STALE_CLAIM"),
    );
    assert.equal(
      foundation.calls.filter((call) => call === "publishObservations").length,
      publishCallsBefore,
    );
    assert.equal(
      (await foundation.store.getMonitor(ORG_A, successMonitor.id))?.lastSuccessfulJobId,
      baseline,
    );
  });
});
