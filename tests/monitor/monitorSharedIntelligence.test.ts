/**
 * Gate 3B.1 shared website intelligence.
 * These tests use the in-memory store and the migration text.
 * They do not open PostgreSQL and they do not apply SQL.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareMonitorExecutions } from "../../services/monitor/monitorComparison";
import { parseMonitorConfiguration } from "../../services/monitor/monitorConfig";
import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import { buildSharedPublicObservation } from "../../services/monitor/monitorObservation";
import { dedupeProductFamilies } from "../../services/monitor/monitorReuse";
import {
  ATHENA_MONITOR_FRESHNESS,
  ATHENA_MONITOR_WORKER_DEFAULTS,
} from "../../services/monitor/monitorRuntime";
import { normalizeSupportedWebsite } from "../../services/monitor/monitorWebsiteIdentity";
import type { MonitorObservation, MonitorSourceCoverage } from "../../services/monitor/monitorTypes";
import {
  ORG_A,
  ORG_B,
  createClock,
  createFoundation,
  observationDraft,
  toscaneConfiguration,
} from "./helpers";

const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const TREG = "https://www.toscane-boutique.fr/fr/treggings-c-77.htm";
const PANTS_KEY = "fr/pantalons-c-42.htm";
const TREG_KEY = "fr/treggings-c-77.htm";

describe("shared Monitor website intelligence — not a PostgreSQL runtime test", () => {
  it("resolves one public website for two organizations and stores no customer data", async () => {
    assert.equal(process.env.MONITOR_RUN_POSTGRES, undefined);
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" } });
    const left = await service.resolveSharedWebsite(ORG_A, "https://www.toscane-boutique.fr/fr");
    const right = await service.resolveSharedWebsite(ORG_B, "https://Toscane-Boutique.fr/");
    assert.equal(left.id, right.id);
    assert.equal(left.normalizedHost, "toscane-boutique.fr");
    assert.equal(normalizeSupportedWebsite("https://www.breal.net/").normalizedHost, "breal.net");
    assert.equal(
      (await service.resolveSharedWebsite(ORG_A, "https://breal.net")).id,
      (await service.resolveSharedWebsite(ORG_B, "https://www.breal.net/")).id,
    );
    assert.throws(
      () => normalizeSupportedWebsite("https://shop.toscane-boutique.fr/"),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "UNSUPPORTED_SOURCE",
    );
    assert.throws(
      () => normalizeSupportedWebsite("https://toscane.example/"),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "UNSUPPORTED_SOURCE",
    );
    const serialized = JSON.stringify(await store.listSharedSources());
    assert.equal(serialized.includes(ORG_A), false);
    assert.equal(serialized.includes(ORG_B), false);
    assert.equal(serialized.includes("objective"), false);
    assert.equal(serialized.includes("criterion"), false);
    assert.equal("organizationId" in left, false);
  });

  it("requires an explicit category selection and reuses discovered categories", async () => {
    const { service } = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" } });
    assert.throws(
      () =>
        parseMonitorConfiguration({
          ...toscaneConfiguration(),
          sources: [
            {
              sourceId: "toscane",
              websiteUrl: "https://www.toscane-boutique.fr/",
              selection: { mode: "categories", categoryIds: [] },
            },
          ],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
    const parsed = parseMonitorConfiguration({
      ...toscaneConfiguration(),
      sources: [
        {
          sourceId: "toscane",
          websiteUrl: "https://www.toscane-boutique.fr/",
          selection: { mode: "categories", categoryUrls: [PANTS, TREG] },
        },
      ],
    });
    assert.equal(parsed.sources[0]?.selection.mode, "categories");
    if (parsed.sources[0]?.selection.mode === "categories") {
      assert.deepEqual(parsed.sources[0].selection.categoryIds, [PANTS_KEY, TREG_KEY]);
    }
    assert.equal(parseMonitorConfiguration(toscaneConfiguration()).sources[0]?.selection.mode, "whole_catalog");
    const discoveredAt = "2026-11-24T12:00:00.000Z";
    await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      discoveredAt,
      categories: [
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt,
          discoveryStatus: "current",
          productFamilyCount: 2,
          productFamilyCountBasis: "verified",
        },
        {
          categoryKey: TREG_KEY,
          displayName: "Treggings",
          canonicalUrl: TREG,
          parentCategoryKey: PANTS_KEY,
          discoveredAt,
          discoveryStatus: "current",
          productFamilyCount: 2,
          productFamilyCountBasis: "estimated",
        },
      ],
    });
    const other = await service.listDiscoveredCategories(ORG_B, "https://toscane-boutique.fr");
    assert.equal(other.fresh, true);
    assert.deepEqual(
      other.categories.map((category) => category.displayName),
      ["Pantalons", "Treggings"],
    );
    assert.equal(other.categories[1]?.parentCategoryKey, PANTS_KEY);
    assert.equal(JSON.stringify(other).includes(ORG_A), false);
  });

  it("deduplicates overlapping categories and reuses one public observation across private jobs", async () => {
    const clock = createClock();
    const { service, store } = createFoundation({
      plans: { [ORG_A]: "full", [ORG_B]: "full" },
      clock,
    });
    const discoveredAt = clock.now().toISOString();
    await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      discoveredAt,
      categories: [
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt,
          discoveryStatus: "current",
          productFamilyCount: 2,
          productFamilyCountBasis: "verified",
        },
        {
          categoryKey: TREG_KEY,
          displayName: "Treggings",
          canonicalUrl: TREG,
          parentCategoryKey: PANTS_KEY,
          discoveredAt,
          discoveryStatus: "current",
          productFamilyCount: 2,
          productFamilyCountBasis: "estimated",
        },
      ],
    });
    const categories = await store.listSharedCategories(
      (await store.getSharedSourceByHost("toscane-boutique.fr"))!.id,
    );
    const pants = categories.find((category) => category.categoryKey === PANTS_KEY)!;
    const treg = categories.find((category) => category.categoryKey === TREG_KEY)!;
    await service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: "https://toscane-boutique.fr/",
      coverage: {
        scopeKind: "category",
        categoryId: pants.id,
        scopeKey: PANTS_KEY,
        status: "completed",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt,
        familyIds: ["pants", "shared"],
        familyCount: 2,
      },
    });
    await service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: "https://toscane-boutique.fr/",
      coverage: {
        scopeKind: "category",
        categoryId: treg.id,
        scopeKey: TREG_KEY,
        status: "completed",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt,
        familyIds: ["shared", "treg"],
        familyCount: 2,
      },
    });
    const families = dedupeProductFamilies([
      { categoryId: PANTS_KEY, familyId: "pants" },
      { categoryId: PANTS_KEY, familyId: "shared" },
      { categoryId: TREG_KEY, familyId: "shared" },
      { categoryId: TREG_KEY, familyId: "treg" },
    ]);
    assert.equal(families.length, 3);
    assert.deepEqual(
      families.find((family) => family.familyId === "shared")?.categoryIds,
      [PANTS_KEY, TREG_KEY],
    );

    const monitorA = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ minimum: 3 }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitorA.id });
    const claimA = await service.claimNextMonitorJob();
    await service.persistMonitorObservations({
      jobId: claimA!.job.id,
      claimToken: claimA!.job.claimToken!,
      observations: [observationDraft("shared", 4, { priceAmount: "49.00" })],
    });
    const storedA = await store.listObservations(ORG_A, claimA!.job.id);
    const monitorB = await service.createMonitor({
      organizationId: ORG_B,
      userId: null,
      configuration: toscaneConfiguration({ name: "Other threshold", minimum: 5 }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_B, monitorId: monitorB.id });
    const claimB = await service.claimNextMonitorJob();
    const reused = await service.reuseSharedObservations({
      organizationId: ORG_B,
      jobId: claimB!.job.id,
      claimToken: claimB!.job.claimToken!,
      familyIds: ["shared"],
    });
    assert.equal(reused.inserted, 1);
    const storedB = await store.listObservations(ORG_B, claimB!.job.id);
    assert.equal(storedB[0]?.publicObservationId, storedA[0]?.publicObservationId);
    assert.equal(storedB[0]?.reused, true);
    assert.equal(storedA[0]?.reused, false);
    assert.equal(storedB[0]?.observedAt, storedA[0]?.observedAt);
    assert.equal(storedA[0]?.thresholdMatch, true);
    assert.equal(storedB[0]?.thresholdMatch, false);
    assert.equal((await store.listObservations(ORG_B, claimA!.job.id)).length, 0);
    await assert.rejects(
      () => service.getMonitor(ORG_B, monitorA.id),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      () =>
        service.reuseSharedObservations({
          organizationId: ORG_B,
          jobId: claimB!.job.id,
          claimToken: claimB!.job.claimToken!,
          familyIds: ["shared"],
          publicObservationIds: [storedA[0]!.publicObservationId],
        }),
      (error: unknown) =>
        error instanceof MonitorOperationError && error.code === "PUBLIC_OBSERVATION_NOT_ATTACHABLE",
    );

    const source = (await store.getSharedSourceByHost("toscane-boutique.fr"))!;
    const newer = buildSharedPublicObservation({
      id: "55555555-5555-4555-8555-555555555555",
      source,
      familyId: "shared",
      canonicalUrl: storedA[0]!.productUrl,
      payload: { ...storedA[0]!.payload, price: { amount: "59.00", currency: "EUR" } },
      observedAt: "2026-11-24T18:00:00.000Z",
      categoryIds: [],
      createdAt: "2026-11-24T18:00:00.000Z",
    });
    await store.savePublicObservation(newer);
    const historical = await store.listObservations(ORG_A, claimA!.job.id);
    assert.equal(historical[0]?.payload.price.amount, "49.00");
    assert.equal(historical[0]?.publicObservationId, storedA[0]?.publicObservationId);
    assert.notEqual(
      (await store.getPublicObservation(newer.id))?.priceAmount,
      historical[0]?.payload.price.amount,
    );
  });

  it("does not reuse stale, force-fresh, or incompatible observations and does not infer absence from partial coverage", async () => {
    const clock = createClock();
    const { service, store } = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const discoveredAt = clock.now().toISOString();
    await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      discoveredAt,
      categories: [
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt,
          discoveryStatus: "current",
          productFamilyCount: 1,
          productFamilyCountBasis: "verified",
        },
      ],
    });
    const source = (await store.getSharedSourceByHost("toscane-boutique.fr"))!;
    const pants = (await store.listSharedCategories(source.id))[0]!;
    await service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: "https://toscane-boutique.fr/",
      coverage: {
        scopeKind: "category",
        categoryId: pants.id,
        scopeKey: PANTS_KEY,
        status: "completed",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt,
        familyIds: ["9330"],
        familyCount: 1,
      },
    });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await service.claimNextMonitorJob();
    await service.persistMonitorObservations({
      jobId: claimed!.job.id,
      claimToken: claimed!.job.claimToken!,
      observations: [observationDraft("9330", 4)],
    });
    const selection = {
      mode: "categories" as const,
      categoryUrls: [PANTS],
      categoryIds: [PANTS_KEY],
    };
    clock.advance(60 * 60 * 1000);
    const fresh = await service.planSharedReuse({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      selection,
    });
    assert.equal(fresh.reusable.length, 1);
    assert.equal(fresh.networkRequestsRequired, false);
    const forced = await service.planSharedReuse({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      selection,
      forceFresh: true,
    });
    assert.deepEqual(forced.reusable, []);
    assert.equal(forced.networkRequestsRequired, true);
    assert.equal(forced.missingProductConclusionAllowed, false);

    clock.advance(ATHENA_MONITOR_FRESHNESS.productObservationMs);
    const stale = await service.planSharedReuse({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      selection,
    });
    assert.deepEqual(stale.reusable, []);
    assert.deepEqual(stale.missingOrStaleFamilyIds, ["9330"]);

    const incompatible = buildSharedPublicObservation({
      id: "66666666-6666-4666-8666-666666666666",
      source,
      familyId: "9330",
      canonicalUrl: observationDraft("9330", 4).productUrl,
      payload: {
        version: 1,
        productName: "Old adapter",
        category: null,
        price: { amount: "10.00", currency: "EUR" },
        colorPatternIds: ["c1"],
        colorPatternNames: ["Noir"],
        distinctVariationCount: 4,
        sizes: ["1"],
        lengths: ["32"],
        imageUrl: null,
        thresholdMatch: null,
      },
      observedAt: clock.now().toISOString(),
      categoryIds: [PANTS_KEY],
      createdAt: clock.now().toISOString(),
      adapterVersion: "1",
    });
    await store.savePublicObservation(incompatible);
    const rejected = await service.planSharedReuse({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      selection,
    });
    assert.equal(
      rejected.reusable.some((item) => item.publicObservationId === incompatible.id),
      false,
    );

    const partialCoverage: MonitorSourceCoverage[] = [
      {
        sourceId: "toscane",
        status: "completed",
        selection,
        errorCode: null,
        familiesAnalyzed: 1,
        discoveryStatus: "partial",
        discoveryScopeKey: PANTS_KEY,
        discoveredAt,
      },
    ];
    const scopedConfiguration = parseMonitorConfiguration(
      toscaneConfiguration({ selection: { mode: "categories", categoryUrls: [PANTS] } }),
    );
    const partial = compareMonitorExecutions(
      {
        job: {
          status: "completed",
          configurationSnapshot: scopedConfiguration,
          sourceCoverage: partialCoverage,
        },
        observations: [],
      },
      {
        job: {
          status: "completed",
          configurationSnapshot: scopedConfiguration,
          sourceCoverage: partialCoverage,
        },
        observations: [] as MonitorObservation[],
      },
    );
    assert.equal(partial.sources[0]?.comparable, false);
    assert.equal(partial.sources[0]?.reason, "coverage_incomplete");
    assert.deepEqual(partial.sources[0]?.notFound, []);

    const productsOnly = await service.planSharedReuse({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      selection: { mode: "whole_catalog" },
    });
    assert.equal(productsOnly.coverageStatus, "missing");
    assert.equal(productsOnly.missingProductConclusionAllowed, false);
  });

  it("preserves private data after a Full-to-Free downgrade and yields batches without losing the cursor", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" }, clock });
    const { service, store } = foundation;
    const first = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Large" }),
    });
    const second = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Waiting" }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: first.id });
    clock.advance(1);
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: second.id });
    const claimed = await service.claimNextMonitorJob({
      claimToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.equal(claimed?.job.monitorId, first.id);
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.concurrency, 1);
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.batchSize, 20);
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.requestTimeoutMs, 20_000);
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.batchDeadlineSeconds, 600);
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.executionDeadlineSeconds, 6 * 60 * 60);
    await service.persistMonitorObservations({
      jobId: claimed!.job.id,
      claimToken: claimed!.job.claimToken!,
      observations: [observationDraft("9330", 4)],
    });
    clock.advance(1_000);
    const yielded = await service.yieldMonitorJob({
      jobId: claimed!.job.id,
      claimToken: claimed!.job.claimToken!,
      executionCursor: {
        version: 1,
        sources: [{ sourceId: "toscane", phase: "extract", nextIndex: 20, categoryUrl: null }],
      },
    });
    assert.equal(yielded.status, "processing");
    assert.equal(yielded.executionCursor.sources[0]?.nextIndex, 20);
    const other = await service.claimNextMonitorJob({
      claimToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    assert.equal(other?.job.monitorId, second.id);
    clock.advance(1_000);
    await service.yieldMonitorJob({
      jobId: other!.job.id,
      claimToken: other!.job.claimToken!,
    });
    const resumed = await service.claimNextMonitorJob({
      claimToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    assert.equal(resumed?.job.id, claimed?.job.id);
    assert.equal(resumed?.job.executionCursor.sources[0]?.nextIndex, 20);
    assert.equal(resumed?.job.attemptCount, 2);
    assert.equal((await store.listObservations(ORG_A, resumed!.job.id)).length, 1);
    await assert.rejects(
      () =>
        service.persistMonitorObservations({
          jobId: resumed!.job.id,
          claimToken: claimed!.job.claimToken!,
          observations: [observationDraft("1000", 2)],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "STALE_CLAIM",
    );

    foundation.plans.set(ORG_A, "free");
    await assert.rejects(
      () => service.listMonitors(ORG_A),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ENTITLEMENT_REQUIRED",
    );
    assert.equal((await store.getMonitor(ORG_A, first.id))?.name, "Large");
    assert.equal((await store.listObservations(ORG_A, claimed!.job.id)).length, 1);
    assert.equal((await store.listSharedSources()).some((item) => item.normalizedHost === "toscane-boutique.fr"), true);
  });

  it("reclaims an expired batch without failing the overall execution", async () => {
    const clock = createClock();
    const { service } = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Batch" }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const running = await service.claimNextMonitorJob();
    await service.heartbeatMonitorJob({
      jobId: running!.job.id,
      claimToken: running!.job.claimToken!,
      executionCursor: {
        version: 1,
        sources: [{ sourceId: "toscane", phase: "extract", nextIndex: 40, categoryUrl: null }],
      },
    });
    clock.advance(ATHENA_MONITOR_WORKER_DEFAULTS.batchDeadlineSeconds * 1000 + 1000);
    assert.equal((await service.recoverMonitorJobs()).recovered, 0);
    await assert.rejects(
      () =>
        service.persistMonitorObservations({
          jobId: running!.job.id,
          claimToken: running!.job.claimToken!,
          observations: [observationDraft("1001", 2)],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "BATCH_DEADLINE",
    );
    const reclaimed = await service.claimNextMonitorJob({
      claimToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    assert.equal(reclaimed?.job.id, running?.job.id);
    assert.equal(reclaimed?.job.executionCursor.sources[0]?.nextIndex, 40);
    assert.equal(reclaimed?.job.status, "processing");
    assert.equal(reclaimed?.job.executionDeadlineAt, running?.job.executionDeadlineAt);
  });
});
