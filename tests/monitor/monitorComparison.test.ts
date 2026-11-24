import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareMonitorExecutions } from "../../services/monitor/monitorComparison";
import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import type { MonitorJob, MonitorObservation } from "../../services/monitor/monitorTypes";
import {
  ORG_A,
  ORG_B,
  completedCoverage,
  createFoundation,
  observationDraft,
  toscaneConfiguration,
} from "./helpers";

async function seedCompletedJob(input: {
  service: ReturnType<typeof createFoundation>["service"];
  monitorId: string;
  minimum?: number;
  drafts: ReturnType<typeof observationDraft>[];
  selection?: { mode: "whole_catalog" } | { mode: "categories"; categoryUrls: string[] };
}) {
  if (input.selection || input.minimum) {
    await input.service.updateMonitor({
      organizationId: ORG_A,
      monitorId: input.monitorId,
      configuration: toscaneConfiguration({
        minimum: input.minimum,
        selection: input.selection,
      }),
    });
  }
  const queued = await input.service.enqueueMonitorJob({
    organizationId: ORG_A,
    monitorId: input.monitorId,
  });
  const claimed = await input.service.claimNextMonitorJob();
  assert.equal(claimed?.job.id, queued.id);
  if (input.drafts.length > 0) {
    await input.service.persistMonitorObservations({
      jobId: claimed!.job.id,
      claimToken: claimed!.job.claimToken!,
      observations: input.drafts,
    });
  }
  const finalized = await input.service.finalizeMonitorJob({
    jobId: claimed!.job.id,
    claimToken: claimed!.job.claimToken!,
    status: "completed",
    sourceCoverage: completedCoverage(claimed!.job),
  });
  const repeated = await input.service.finalizeMonitorJob({
    jobId: claimed!.job.id,
    claimToken: claimed!.job.claimToken!,
    status: "completed",
    sourceCoverage: completedCoverage(claimed!.job),
  });
  assert.equal(repeated.completedAt, finalized.completedAt);
  return finalized;
}

describe("Monitor historical continuity", () => {
  it("compares a completed same-scope run and can refilter without another fetch", async () => {
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" } });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ minimum: 3 }),
    });
    const baseline = await seedCompletedJob({
      service,
      monitorId: monitor.id,
      drafts: [
        observationDraft("a", 3, { priceAmount: "49.00" }),
        observationDraft("b", 2, { priceAmount: "30.00" }),
        observationDraft("c", 4, { priceAmount: "80.00" }),
        observationDraft("f", 3, { priceAmount: "10.00", currency: "EUR" }),
        observationDraft("g", 3, { priceAmount: "15.00" }),
        observationDraft("u", 4, { priceAmount: null, currency: null, colorPatternIds: null }),
      ],
    });
    const current = await seedCompletedJob({
      service,
      monitorId: monitor.id,
      drafts: [
        observationDraft("a", 4, {
          priceAmount: "49.00",
          colorPatternIds: ["c1", "c2", "c3", "c4"],
        }),
        observationDraft("b", 3, {
          priceAmount: "30.00",
          colorPatternIds: ["c1", "c2", "c3"],
        }),
        observationDraft("d", 5, { priceAmount: "20.00" }),
        observationDraft("f", 3, { priceAmount: "10.00", currency: "USD" }),
        observationDraft("g", 3, { priceAmount: "18.00" }),
        observationDraft("u", 4, { priceAmount: null, currency: null, colorPatternIds: null }),
      ],
    });
    const comparison = await service.compareMonitorJobs({
      organizationId: ORG_A,
      baselineJobId: baseline.id,
      currentJobId: current.id,
    });
    const source = comparison.sources.find((item) => item.sourceId === "toscane");
    assert.equal(comparison.thresholdComparison, true);
    assert.equal(source?.comparable, true);
    assert.deepEqual(source?.newlyObserved, ["d"]);
    assert.deepEqual(source?.notFound, ["c"]);
    assert.deepEqual(source?.thresholdCrossedUp, ["b"]);
    assert.deepEqual(source?.variationsAdded.map((change) => change.familyId), ["a", "b"]);
    assert.deepEqual(source?.priceChanges, [
      { familyId: "g", from: "15.00", to: "18.00", currency: "EUR" },
    ]);
    assert.equal(
      source?.priceComparisonSkipped.some(
        (skipped) => skipped.familyId === "f" && skipped.reason === "currency_mismatch",
      ),
      true,
    );
    assert.equal(source?.priceChanges.some((change) => change.familyId === "f"), false);
    assert.equal(source?.unchanged.includes("u"), true);
    assert.equal(source?.unchanged.includes("f"), false);
    const previous = await store.listObservations(ORG_A, baseline.id);
    assert.equal(previous.find((row) => row.familyId === "a")?.payload.price.amount, "49.00");
    assert.equal(previous.find((row) => row.familyId === "a")?.payload.distinctVariationCount, 3);

    const refiltered = await service.refilterMonitorJob({
      organizationId: ORG_A,
      jobId: current.id,
      minimum: 5,
    });
    assert.equal(refiltered.networkRequests, 0);
    assert.equal(
      refiltered.observations.find((row) => row.familyId === "d")?.thresholdMatch,
      true,
    );
    assert.equal(
      refiltered.observations.find((row) => row.familyId === "a")?.thresholdMatch,
      false,
    );
    assert.equal(
      refiltered.observations.find((row) => row.familyId === "a")?.storedThresholdMatch,
      true,
    );
    const storedAfter = await store.listObservations(ORG_A, current.id);
    assert.equal(storedAfter.find((row) => row.familyId === "a")?.thresholdMatch, true);
    await assert.rejects(
      () => service.compareMonitorJobs({ organizationId: ORG_B, baselineJobId: baseline.id, currentJobId: current.id }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "NOT_FOUND",
    );
  });

  it("does not report missing families for a changed criterion, scope, or incomplete source", async () => {
    const { service } = createFoundation({ plans: { [ORG_A]: "full" } });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ minimum: 3 }),
    });
    const baseline = await seedCompletedJob({
      service,
      monitorId: monitor.id,
      drafts: [observationDraft("a", 4), observationDraft("c", 4)],
    });
    const narrowed = await seedCompletedJob({
      service,
      monitorId: monitor.id,
      selection: {
        mode: "categories",
        categoryUrls: ["https://www.toscane-boutique.fr/fr/pantalons-c-42.htm"],
      },
      drafts: [observationDraft("a", 4, { priceAmount: "59.00" })],
    });
    const scoped = await service.compareMonitorJobs({
      organizationId: ORG_A,
      baselineJobId: baseline.id,
      currentJobId: narrowed.id,
    });
    const scopedSource = scoped.sources[0];
    assert.equal(scopedSource?.reason, "scope_changed");
    assert.deepEqual(scopedSource?.notFound, []);
    assert.deepEqual(scopedSource?.newlyObserved, []);
    assert.deepEqual(scopedSource?.priceChanges, []);

    const higherMinimum = await seedCompletedJob({
      service,
      monitorId: monitor.id,
      minimum: 5,
      selection: { mode: "whole_catalog" },
      drafts: [observationDraft("a", 4, { priceAmount: "49.00" })],
    });
    const threshold = await service.compareMonitorJobs({
      organizationId: ORG_A,
      baselineJobId: baseline.id,
      currentJobId: higherMinimum.id,
    });
    assert.equal(threshold.criterionCompatible, true);
    assert.equal(threshold.thresholdComparison, false);
    assert.equal(threshold.reason, "threshold_differs");
    assert.deepEqual(threshold.sources[0]?.thresholdCrossedUp, []);
    assert.deepEqual(threshold.sources[0]?.thresholdCrossedDown, []);
    assert.deepEqual(threshold.sources[0]?.notFound, ["c"]);

    const changedCriterion = compareMonitorExecutions(
      {
        job: {
          status: "completed",
          sourceCoverage: baseline.sourceCoverage,
          configurationSnapshot: baseline.configurationSnapshot,
        },
        observations: [],
      },
      {
        job: {
          status: "completed",
          sourceCoverage: baseline.sourceCoverage,
          configurationSnapshot: {
            ...baseline.configurationSnapshot,
            criterion: { id: "futureCriterion", operator: "gte", minimum: 3 },
          },
        },
        observations: [],
      },
    );
    assert.equal(changedCriterion.compatible, false);
    assert.equal(changedCriterion.reason, "criterion_changed");
    assert.deepEqual(changedCriterion.sources[0]?.notFound, []);
    assert.deepEqual(changedCriterion.sources[0]?.priceChanges, []);

    const blockedView = {
      job: {
        status: "blocked" as const,
        sourceCoverage: baseline.sourceCoverage.map((source) => ({
          ...source,
          status: "blocked" as const,
          errorCode: "PRODUCTION_ACCESS_BLOCKED",
        })),
        configurationSnapshot: baseline.configurationSnapshot,
      },
      observations: [] as MonitorObservation[],
    };
    const blocked = compareMonitorExecutions(
      { job: baseline, observations: [] },
      blockedView,
    );
    assert.equal(blocked.sources[0]?.comparable, false);
    assert.equal(blocked.sources[0]?.reason, "source_blocked");
    assert.deepEqual(blocked.sources[0]?.notFound, []);

    const cancelled = compareMonitorExecutions(
      { job: baseline, observations: [] },
      {
        job: { ...blockedView.job, status: "cancelled" },
        observations: [],
      },
    );
    assert.equal(cancelled.sources[0]?.reason, "job_cancelled");
    assert.deepEqual(cancelled.sources[0]?.notFound, []);

    const withoutDiscovery = baseline.sourceCoverage.map((source) => ({
      ...source,
      status: "completed" as const,
      discoveryStatus: null,
      discoveryCoverageId: null,
      failedFamilyIds: ["c"],
    }));
    const hiddenFamily: MonitorObservation = {
      id: "00000000-0000-4000-8000-0000000000aa",
      organizationId: ORG_A,
      monitorId: baseline.monitorId,
      jobId: baseline.id,
      sourceId: "toscane",
      familyId: "c",
      productUrl: "https://www.toscane-boutique.fr/fr/pantalons/modele-p-c-coul-1.htm",
      observedAt: "2026-11-24T12:00:00.000Z",
      thresholdMatch: true,
      payloadVersion: 1,
      payload: {
        version: 1,
        productName: "Family c",
        category: "Pantalons",
        price: { amount: "49.00", currency: "EUR" },
        colorPatternIds: ["c1"],
        colorPatternNames: ["Noir"],
        distinctVariationCount: 4,
        sizes: ["1"],
        lengths: null,
        imageUrl: null,
        thresholdMatch: true,
      },
      publicObservationId: "00000000-0000-4000-8000-0000000000bb",
      sharedSourceId: "00000000-0000-4000-8000-0000000000cc",
      reused: false,
      adapterId: "solusquare",
      adapterVersion: "2",
      schemaVersion: 1,
      contentKey: "missing-discovery",
      categoryIds: [],
      discoveryCoverageId: null,
      createdAt: "2026-11-24T12:00:00.000Z",
    };
    const missingEvidence = compareMonitorExecutions(
      {
        job: { ...baseline, sourceCoverage: withoutDiscovery },
        observations: [hiddenFamily],
      },
      {
        job: { ...baseline, sourceCoverage: withoutDiscovery },
        observations: [],
      },
    );
    assert.equal(missingEvidence.sources[0]?.comparable, false);
    assert.equal(missingEvidence.sources[0]?.reason, "coverage_incomplete");
    assert.deepEqual(missingEvidence.sources[0]?.notFound, []);
  });

  it("rejects a cross-organization observation write", async () => {
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full" } });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await service.claimNextMonitorJob();
    const persisted = await service.persistMonitorObservations({
      jobId: claimed!.job.id,
      claimToken: claimed!.job.claimToken!,
      observations: [observationDraft("9330", null, { productName: null, category: null })],
    });
    assert.equal(persisted.inserted, 1);
    const stored = await store.listObservations(ORG_A, claimed!.job.id);
    const foreign: MonitorObservation = {
      ...stored[0]!,
      id: "44444444-4444-4444-8444-444444444444",
      organizationId: ORG_B,
      familyId: "other",
    };
    await assert.rejects(
      () =>
        store.publishObservations({
          jobId: claimed!.job.id,
          claimToken: claimed!.job.claimToken!,
          observations: [foreign],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "CROSS_ORGANIZATION",
    );
    assert.equal((await store.listObservations(ORG_A, claimed!.job.id)).length, 1);
    assert.equal(stored[0]?.payload.productName, null);
    assert.equal(stored[0]?.payload.distinctVariationCount, null);
    assert.equal(stored[0]?.thresholdMatch, null);
    const job: MonitorJob = claimed!.job;
    assert.equal(job.organizationId, ORG_A);
  });
});
