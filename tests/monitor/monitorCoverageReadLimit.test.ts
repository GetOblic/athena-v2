/**
 * Production coverage reads must survive the PostgREST default response cap.
 * The client below keeps every row and returns at most 1,000 unless the query sets a lower limit.
 * It does not open PostgreSQL and does not call a retailer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MonitorPageFetch } from "../../services/monitor/monitorAdapter";
import { executeMonitorJob } from "../../services/monitor/monitorEngine";
import { classifyDiscoveryContinuation } from "../../services/monitor/monitorExecution";
import { createMemoryMonitorStore } from "../../services/monitor/monitorMemoryStore";
import { createMonitorService } from "../../services/monitor/monitorService";
import type { MonitorStore } from "../../services/monitor/monitorStore";
import { createSupabaseMonitorStore } from "../../services/monitor/monitorSupabaseStore";
import {
  MONITOR_ADAPTER_VERSION,
  MONITOR_PUBLIC_SCHEMA_VERSION,
} from "../../services/monitor/monitorTypes";
import { categoryKeyFromUrl } from "../../services/monitor/monitorWebsiteIdentity";
import { ORG_A, USER_A, createClock, toscaneConfiguration } from "./helpers";

const POSTGREST_CAP = 1_000;
const CHEM = "https://www.toscane-boutique.fr/fr/chemisiers-tuniques-c-15.htm";
const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const CHEM_PAGE_2 = "https://www.toscane-boutique.fr/fr/chemisiers-tuniques-c-15-page-2.htm";
const CHEM_KEY = categoryKeyFromUrl(CHEM);
const PANTS_KEY = categoryKeyFromUrl(PANTS);
const WEBSITE = "https://www.toscane-boutique.fr/";
const CHEM_FAMILIES = Array.from({ length: 59 }, (_, index) => String(5001 + index));
const PANTS_FAMILIES = Array.from({ length: 64 }, (_, index) => String(6001 + index));

type Row = Record<string, unknown>;
type CoverageRead = {
  filters: Array<{ column: string; value: unknown }>;
  orders: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
};

function productUrl(id: string): string {
  return `https://www.toscane-boutique.fr/fr/modele-p-${id}-coul-1.htm`;
}

function listing(ids: readonly string[], next?: string): string {
  const links = ids.map((id) => `<a href="${productUrl(id)}">Modele ${id}</a>`).join("");
  const nextLink = next ? `<a rel="next" href="${next}">Suivant</a>` : "";
  return `<html><body>${links}${nextLink}</body></html>`;
}

function productHtml(id: string): string {
  const swatches = ["Noir", "Camel", "Marine", "Anthracite"]
    .map(
      (name, index) =>
        `<li id="p${id}-${index + 1}" data-params="{ colorLbl: '${name}', colorID: '${index + 1}' }"></li>`,
    )
    .join("");
  return `<html><head>
    <link rel="canonical" href="${productUrl(id)}" />
    <meta property="og:image" content="https://cdn.toscane-boutique.fr/products_images/prod_${id}/front.jpg" />
    <script type="application/ld+json">{"@type":"Product","name":"Modele ${id}","offers":{"@type":"Offer","price":"49.00","priceCurrency":"EUR"}}</script>
  </head><body>
    <div data-params="{ prodID: ${id} }" data-gtm_item_name="Modele ${id}"></div>
    <ul>${swatches}<li data-cid="1">36</li><li data-cid="1">Longueur 32</li></ul>
  </body></html>`;
}

function coverageId(n: number): string {
  return `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function after(start: string, milliseconds: number): string {
  return new Date(Date.parse(start) + milliseconds).toISOString();
}

function copyRow(row: Row): Row {
  const next = { ...row };
  if (Array.isArray(next.family_ids)) next.family_ids = [...next.family_ids];
  return next;
}

function coverageRow(input: {
  id: string;
  sourceId: string;
  categoryId: string | null;
  scopeKey: string;
  status: "completed" | "partial" | "failed";
  discoveredAt: string;
  familyIds: string[];
}): Row {
  return {
    id: input.id,
    source_id: input.sourceId,
    scope_kind: "category",
    category_id: input.categoryId,
    scope_key: input.scopeKey,
    status: input.status,
    adapter_id: "solusquare",
    adapter_version: MONITOR_ADAPTER_VERSION,
    schema_version: MONITOR_PUBLIC_SCHEMA_VERSION,
    discovered_at: input.discoveredAt,
    family_ids: input.familyIds,
    family_count: input.familyIds.length,
    created_at: input.discoveredAt,
  };
}

function createCappedCoverageClient() {
  const rows: Row[] = [];
  const reads: CoverageRead[] = [];

  function from(table: string) {
    if (table !== "athena_monitor_discovery_coverage") throw new Error(`unexpected table ${table}`);
    const state: {
      op: "select" | "insert";
      payload: Row | null;
      filters: Array<{ column: string; value: unknown }>;
      orders: Array<{ column: string; ascending: boolean }>;
      limit: number | null;
    } = { op: "select", payload: null, filters: [], orders: [], limit: null };

    const run = (single: boolean) => {
      if (state.op === "insert") {
        const payload = copyRow(state.payload ?? {});
        rows.push(payload);
        return { data: copyRow(payload), error: null };
      }
      let selected = rows.filter((row) => state.filters.every((filter) => row[filter.column] === filter.value));
      selected = [...selected].sort((left, right) => {
        for (const order of state.orders) {
          const compared = String(left[order.column] ?? "").localeCompare(String(right[order.column] ?? ""));
          if (compared !== 0) return order.ascending ? compared : -compared;
        }
        return 0;
      });
      const cap = state.limit == null ? POSTGREST_CAP : Math.min(state.limit, POSTGREST_CAP);
      reads.push({
        filters: state.filters.map((filter) => ({ ...filter })),
        orders: state.orders.map((order) => ({ ...order })),
        limit: state.limit,
      });
      const page = selected.slice(0, cap).map((row) => copyRow(row));
      return { data: single ? (page[0] ?? null) : page, error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      insert(value: Row) {
        state.op = "insert";
        state.payload = value;
        return builder;
      },
      update() {
        throw new Error("coverage rows are immutable");
      },
      delete() {
        throw new Error("coverage rows are not deleted");
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value });
        return builder;
      },
      lte() {
        return builder;
      },
      is() {
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        state.orders.push({ column, ascending: options.ascending });
        return builder;
      },
      limit(count: number) {
        state.limit = count;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      single() {
        return Promise.resolve(run(true));
      },
      then(
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    rows,
    reads,
    client: {
      from,
      rpc() {
        throw new Error("coverage correction does not add an RPC");
      },
    },
  };
}

async function openStore(clock: ReturnType<typeof createClock>) {
  const memory = createMemoryMonitorStore({ now: clock.now });
  const capped = createCappedCoverageClient();
  const remote = await createSupabaseMonitorStore(capped.client as never);
  const store: MonitorStore = {
    ...memory,
    saveDiscoveryCoverage: (coverage) => remote.saveDiscoveryCoverage(coverage),
    listDiscoveryCoverage: (sourceId) => remote.listDiscoveryCoverage(sourceId),
    latestDiscoveryCoverageForScope: (sourceId, scopeKey) =>
      remote.latestDiscoveryCoverageForScope(sourceId, scopeKey),
  };
  const service = createMonitorService({
    store,
    now: clock.now,
    resolvePlan: async () => "full" as const,
    requireOrganizationContext: async () => ({ organizationId: ORG_A, userId: USER_A }),
  });
  return { store, service, capped };
}

describe("coverage reads beyond the Supabase response cap", () => {
  it("keeps same-page continuation and no-progress classification", () => {
    const repeated = {
      accumulatedFamilyIds: ["7001", "7002"],
      returnedFamilyIds: ["7001", "7002"],
      previousResumeUrl: CHEM,
      nextResumeUrl: CHEM,
      done: false,
    };
    assert.equal(classifyDiscoveryContinuation(repeated), "no_progress");
    assert.equal(
      classifyDiscoveryContinuation({
        ...repeated,
        returnedFamilyIds: ["7003"],
      }),
      "same_page",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        ...repeated,
        nextResumeUrl: CHEM_PAGE_2,
      }),
      "forward",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        ...repeated,
        errorCode: "PAGINATION_LOOP",
      }),
      "forward",
    );
  });

  it("breaks a discovered_at tie on coverage id", async () => {
    const clock = createClock("2026-11-26T13:00:00.000Z");
    const { store, service, capped } = await openStore(clock);
    await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: "2026-11-26T12:00:00.000Z",
      categories: [
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt: "2026-11-26T12:00:00.000Z",
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
      ],
    });
    const source = await store.getSharedSourceByHost("toscane-boutique.fr");
    assert.ok(source);
    const stamp = "2026-11-26T13:00:00.000Z";
    const lower = "10000000-0000-4000-8000-000000000001";
    const higher = "10000000-0000-4000-8000-000000000002";
    const older = "10000000-0000-4000-8000-000000000003";
    capped.rows.push(
      coverageRow({
        id: lower,
        sourceId: source.id,
        categoryId: null,
        scopeKey: PANTS_KEY,
        status: "partial",
        discoveredAt: stamp,
        familyIds: ["1"],
      }),
      coverageRow({
        id: higher,
        sourceId: source.id,
        categoryId: null,
        scopeKey: PANTS_KEY,
        status: "completed",
        discoveredAt: stamp,
        familyIds: ["2"],
      }),
      coverageRow({
        id: older,
        sourceId: source.id,
        categoryId: null,
        scopeKey: PANTS_KEY,
        status: "completed",
        discoveredAt: "2026-11-26T12:00:00.000Z",
        familyIds: ["3"],
      }),
    );
    const latest = await store.latestDiscoveryCoverageForScope(source.id, PANTS_KEY);
    assert.equal(latest?.id, higher);
    assert.equal(latest?.status, "completed");
    const read = capped.reads.at(-1);
    assert.deepEqual(read?.orders, [
      { column: "discovered_at", ascending: false },
      { column: "id", ascending: false },
    ]);
    assert.equal(read?.limit, 1);
    assert.equal(read?.filters.some((filter) => filter.column === "scope_key" && filter.value === PANTS_KEY), true);
  });

  it("retrieves both completed scopes when historical partials exceed the response cap", async () => {
    const clock = createClock("2026-11-26T13:00:00.000Z");
    const { store, service, capped } = await openStore(clock);
    const published = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: "2026-11-26T12:00:00.000Z",
      authoritativeTaxonomy: false,
      categories: [
        {
          categoryKey: CHEM_KEY,
          displayName: "Chemisiers & Tuniques",
          canonicalUrl: CHEM,
          parentCategoryKey: null,
          discoveredAt: "2026-11-26T12:00:00.000Z",
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt: "2026-11-26T12:00:00.000Z",
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
      ],
    });
    const source = await store.getSharedSourceByHost("toscane-boutique.fr");
    const chemCategory = published.categories.find((category) => category.categoryKey === CHEM_KEY);
    const pantsCategory = published.categories.find((category) => category.categoryKey === PANTS_KEY);
    assert.ok(source && chemCategory && pantsCategory);
    let nextId = 1;
    const historicalStart = Date.parse("2026-11-20T00:00:00.000Z");
    for (let index = 0; index < 15_100; index += 1) {
      capped.rows.push(
        coverageRow({
          id: coverageId(nextId),
          sourceId: source.id,
          categoryId: chemCategory.id,
          scopeKey: CHEM_KEY,
          status: "partial",
          discoveredAt: new Date(historicalStart + index * 1000).toISOString(),
          familyIds: ["h"],
        }),
      );
      nextId += 1;
    }
    for (let index = 0; index < 500; index += 1) {
      capped.rows.push(
        coverageRow({
          id: coverageId(nextId),
          sourceId: source.id,
          categoryId: pantsCategory.id,
          scopeKey: PANTS_KEY,
          status: "partial",
          discoveredAt: new Date(historicalStart + index * 1000).toISOString(),
          familyIds: ["h"],
        }),
      );
      nextId += 1;
    }
    const chemOldId = coverageId(nextId);
    nextId += 1;
    const pantsOldId = coverageId(nextId);
    nextId += 1;
    capped.rows.push(
      coverageRow({
        id: chemOldId,
        sourceId: source.id,
        categoryId: chemCategory.id,
        scopeKey: CHEM_KEY,
        status: "completed",
        discoveredAt: "2026-11-25T08:00:00.000Z",
        familyIds: ["old-chem"],
      }),
      coverageRow({
        id: pantsOldId,
        sourceId: source.id,
        categoryId: pantsCategory.id,
        scopeKey: PANTS_KEY,
        status: "completed",
        discoveredAt: "2026-11-25T08:00:00.000Z",
        familyIds: ["old-pants"],
      }),
    );
    const historicalPartials = capped.rows.filter((row) => row.status === "partial");
    assert.ok(historicalPartials.length > 15_000);
    assert.ok(
      historicalPartials.filter((row) => row.scope_key === CHEM_KEY).length >
        historicalPartials.filter((row) => row.scope_key === PANTS_KEY).length,
    );

    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Capped coverage",
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [CHEM, PANTS] },
      }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id, forceFresh: true });
    const claimed = await service.claimNextMonitorJob();
    assert.equal(claimed?.disposition, "claimed");
    assert.ok(claimed?.job.startedAt);
    const startedAt = claimed.job.startedAt;
    const pantsCompletedId = coverageId(nextId);
    nextId += 1;
    const chemCompletedId = coverageId(nextId);
    const pantsCompletedAt = after(startedAt, 1_000);
    for (let index = 0; index < 1_200; index += 1) {
      capped.rows.push(
        coverageRow({
          id: coverageId(nextId + 1 + index),
          sourceId: source.id,
          categoryId: chemCategory.id,
          scopeKey: CHEM_KEY,
          status: "partial",
          discoveredAt: after(startedAt, 2_000 + index * 10),
          familyIds: ["c"],
        }),
      );
    }
    capped.rows.push(
      coverageRow({
        id: pantsCompletedId,
        sourceId: source.id,
        categoryId: pantsCategory.id,
        scopeKey: PANTS_KEY,
        status: "completed",
        discoveredAt: pantsCompletedAt,
        familyIds: PANTS_FAMILIES,
      }),
      coverageRow({
        id: chemCompletedId,
        sourceId: source.id,
        categoryId: chemCategory.id,
        scopeKey: CHEM_KEY,
        status: "completed",
        discoveredAt: after(startedAt, 20_000),
        familyIds: CHEM_FAMILIES,
      }),
    );
    const ranked = [...capped.rows].sort((left, right) => {
      const byTime = String(right.discovered_at).localeCompare(String(left.discovered_at));
      if (byTime !== 0) return byTime;
      return String(right.id).localeCompare(String(left.id));
    });
    const newestWindow = ranked.slice(0, POSTGREST_CAP);
    const oldestWindow = [...capped.rows]
      .sort((left, right) => String(left.discovered_at).localeCompare(String(right.discovered_at)))
      .slice(0, POSTGREST_CAP);
    assert.equal(newestWindow.some((row) => row.id === pantsCompletedId), false);
    assert.equal(newestWindow.some((row) => row.id === chemCompletedId), true);
    assert.equal(
      oldestWindow.some((row) => row.id === pantsCompletedId || row.id === chemCompletedId),
      false,
    );
    const storedCount = capped.rows.length;

    const hidden = await store.listDiscoveryCoverage(source.id);
    assert.equal(hidden.length, POSTGREST_CAP);
    assert.equal(hidden.some((row) => row.id === chemCompletedId || row.id === pantsCompletedId), false);
    const listRead = capped.reads.at(-1);
    assert.equal(listRead?.limit, null);
    assert.deepEqual(listRead?.orders, [{ column: "discovered_at", ascending: true }]);
    assert.equal(listRead?.filters.some((filter) => filter.column === "scope_key"), false);

    const chemLatest = await store.latestDiscoveryCoverageForScope(source.id, CHEM_KEY);
    const pantsLatest = await store.latestDiscoveryCoverageForScope(source.id, PANTS_KEY);
    assert.equal(chemLatest?.id, chemCompletedId);
    assert.equal(pantsLatest?.id, pantsCompletedId);
    assert.equal(chemLatest?.status, "completed");
    assert.equal(pantsLatest?.status, "completed");
    assert.equal(chemLatest?.adapterVersion, MONITOR_ADAPTER_VERSION);
    assert.equal(pantsLatest?.schemaVersion, MONITOR_PUBLIC_SCHEMA_VERSION);
    assert.equal(chemLatest?.familyCount, 59);
    assert.equal(pantsLatest?.familyCount, 64);
    assert.ok(Date.parse(chemLatest?.discoveredAt ?? "") >= Date.parse(startedAt));
    assert.ok(Date.parse(pantsLatest?.discoveredAt ?? "") >= Date.parse(startedAt));
    assert.notEqual(chemLatest?.id, chemOldId);
    assert.notEqual(pantsLatest?.id, pantsOldId);

    const familyUrls = Object.fromEntries(
      [...CHEM_FAMILIES, ...PANTS_FAMILIES].map((id) => [id, productUrl(id)]),
    );
    const familyCategories = Object.fromEntries([
      ...CHEM_FAMILIES.map((id) => [id, [CHEM_KEY]]),
      ...PANTS_FAMILIES.map((id) => [id, [PANTS_KEY]]),
    ]);
    clock.advance(30_000);
    const prepared = await service.heartbeatMonitorJob({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken ?? "",
      executionCursor: {
        version: 1,
        sources: [
          {
            sourceId: "toscane",
            phase: "discover",
            nextIndex: 2,
            categoryUrl: null,
            familyUrls,
            familyCategories,
          },
        ],
      },
    });
    const urls: string[] = [];
    const fetchPage: MonitorPageFetch = async (request) => {
      urls.push(request.url);
      const family = new URL(request.url).pathname.match(/-p-(\d+)-coul-/);
      if (!family?.[1]) {
        return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
      }
      return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
    };
    const readMark = capped.reads.length;
    const result = await executeMonitorJob({
      service,
      store,
      job: prepared,
      fetchPage,
      now: clock.now,
      forceFresh: true,
    });
    const decisionReads = capped.reads.slice(readMark);
    assert.equal(decisionReads.length, 4);
    assert.equal(
      decisionReads.every(
        (read) =>
          read.limit === 1 &&
          read.filters.some((filter) => filter.column === "source_id" && filter.value === source.id) &&
          read.filters.some((filter) => filter.column === "scope_key") &&
          read.orders[0]?.column === "discovered_at" &&
          read.orders[0]?.ascending === false &&
          read.orders[1]?.column === "id" &&
          read.orders[1]?.ascending === false,
      ),
      true,
    );
    assert.equal(decisionReads.filter((read) => read.filters.some((filter) => filter.value === CHEM_KEY)).length, 2);
    assert.equal(decisionReads.filter((read) => read.filters.some((filter) => filter.value === PANTS_KEY)).length, 2);
    assert.equal(capped.rows.length, storedCount);
    assert.equal(capped.rows.some((row) => row.id === chemOldId), true);
    assert.equal(capped.rows.some((row) => row.id === pantsOldId), true);
    assert.equal(result.outcome, "yielded");
    assert.equal(result.job.status, "processing");
    assert.equal(result.job.progress.phase, "extract");
    assert.equal(result.job.progress.familiesDiscovered, 123);
    const sourceCoverage = result.job.sourceCoverage.find((item) => item.sourceId === "toscane");
    assert.equal(sourceCoverage?.status, "extracting");
    assert.equal(sourceCoverage?.discoveryStatus, "completed");
    assert.equal(sourceCoverage?.familiesDiscovered, 123);
    assert.equal(sourceCoverage?.discoveryCoverageId, pantsCompletedId);
    assert.notEqual(sourceCoverage?.discoveryCoverageId, chemOldId);
    assert.notEqual(sourceCoverage?.discoveryCoverageId, pantsOldId);
    assert.equal(sourceCoverage?.errorCode, null);
    assert.ok((sourceCoverage?.familiesExtracted ?? 0) > 0);
    assert.ok(urls.length > 0);
    assert.equal(urls.every((url) => /-p-\d+-coul-/.test(url)), true);
    assert.equal(urls.includes(CHEM), false);
    assert.equal(urls.includes(PANTS), false);
  });

  it("continues a same-execution partial hidden from either global response window", async () => {
    const clock = createClock("2026-11-26T13:00:00.000Z");
    const { store, service, capped } = await openStore(clock);
    const published = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: "2026-11-26T12:00:00.000Z",
      categories: [
        {
          categoryKey: CHEM_KEY,
          displayName: "Chemisiers & Tuniques",
          canonicalUrl: CHEM,
          parentCategoryKey: null,
          discoveredAt: "2026-11-26T12:00:00.000Z",
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt: "2026-11-26T12:00:00.000Z",
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
      ],
    });
    const source = await store.getSharedSourceByHost("toscane-boutique.fr");
    const chemCategory = published.categories.find((category) => category.categoryKey === CHEM_KEY);
    const pantsCategory = published.categories.find((category) => category.categoryKey === PANTS_KEY);
    assert.ok(source && chemCategory && pantsCategory);
    let nextId = 1;
    for (let index = 0; index < 1_100; index += 1) {
      capped.rows.push(
        coverageRow({
          id: coverageId(nextId),
          sourceId: source.id,
          categoryId: chemCategory.id,
          scopeKey: CHEM_KEY,
          status: "partial",
          discoveredAt: new Date(Date.parse("2026-11-20T00:00:00.000Z") + index * 1000).toISOString(),
          familyIds: ["h"],
        }),
      );
      nextId += 1;
    }
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Partial continuation",
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [CHEM, PANTS] },
      }),
    });
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id, forceFresh: true });
    const claimed = await service.claimNextMonitorJob();
    assert.ok(claimed?.disposition === "claimed" && claimed.job.startedAt);
    const startedAt = claimed.job.startedAt;
    const known = Array.from({ length: 20 }, (_, index) => String(7001 + index));
    const olderCompletedId = coverageId(nextId);
    nextId += 1;
    const partialId = coverageId(nextId);
    nextId += 1;
    capped.rows.push(
      coverageRow({
        id: olderCompletedId,
        sourceId: source.id,
        categoryId: chemCategory.id,
        scopeKey: CHEM_KEY,
        status: "completed",
        discoveredAt: after(startedAt, 1_000),
        familyIds: ["9"],
      }),
      coverageRow({
        id: partialId,
        sourceId: source.id,
        categoryId: chemCategory.id,
        scopeKey: CHEM_KEY,
        status: "partial",
        discoveredAt: after(startedAt, 2_000),
        familyIds: known,
      }),
    );
    for (let index = 0; index < 1_100; index += 1) {
      capped.rows.push(
        coverageRow({
          id: coverageId(nextId),
          sourceId: source.id,
          categoryId: pantsCategory.id,
          scopeKey: PANTS_KEY,
          status: "partial",
          discoveredAt: after(startedAt, 3_000 + index),
          familyIds: ["p"],
        }),
      );
      nextId += 1;
    }
    const newest = [...capped.rows]
      .sort((left, right) => String(right.discovered_at).localeCompare(String(left.discovered_at)))
      .slice(0, POSTGREST_CAP);
    const oldest = [...capped.rows]
      .sort((left, right) => String(left.discovered_at).localeCompare(String(right.discovered_at)))
      .slice(0, POSTGREST_CAP);
    assert.equal(newest.some((row) => row.id === partialId || row.id === olderCompletedId), false);
    assert.equal(oldest.some((row) => row.id === partialId || row.id === olderCompletedId), false);
    const before = capped.rows.length;
    clock.advance(6_000);
    const prepared = await service.heartbeatMonitorJob({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken ?? "",
      executionCursor: {
        version: 1,
        sources: [
          {
            sourceId: "toscane",
            phase: "discover",
            nextIndex: 0,
            categoryUrl: CHEM,
            familyUrls: { marker: productUrl("1") },
          },
        ],
      },
    });
    const urls: string[] = [];
    const fetchPage: MonitorPageFetch = async (request) => {
      urls.push(request.url);
      if (request.url === CHEM) {
        return {
          ok: true,
          finalUrl: request.url,
          status: 200,
          bodyText: listing([...known, "7021", "7022", "7023", "7024", "7025"], CHEM_PAGE_2),
        };
      }
      if (request.url === CHEM_PAGE_2) {
        const page = Array.from({ length: 16 }, (_, index) => String(7101 + index));
        return { ok: true, finalUrl: request.url, status: 200, bodyText: listing(page) };
      }
      return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
    };
    const result = await executeMonitorJob({
      service,
      store,
      job: prepared,
      fetchPage,
      now: clock.now,
      forceFresh: true,
    });
    const latest = await store.latestDiscoveryCoverageForScope(source.id, CHEM_KEY);
    assert.equal(urls.includes(CHEM), true);
    assert.equal(urls.includes(CHEM_PAGE_2), true);
    assert.notEqual(latest?.id, olderCompletedId);
    assert.equal(latest?.status, "partial");
    assert.equal(latest?.familyCount, 40);
    assert.equal(latest?.familyIds.includes("7001"), true);
    assert.equal(latest?.familyIds.includes("7021"), true);
    assert.equal(latest?.familyIds.includes("7101"), true);
    assert.equal(latest?.familyIds.includes("7116"), false);
    assert.equal(capped.rows.some((row) => row.id === olderCompletedId && row.status === "completed"), true);
    assert.ok(capped.rows.length > before);
    const cursor = result.job.executionCursor.sources.find((item) => item.sourceId === "toscane");
    assert.equal(cursor?.phase, "discover");
    assert.equal(cursor?.nextIndex, 0);
    assert.equal(result.job.progress.phase, "discover");
    assert.equal(result.job.sourceCoverage.find((item) => item.sourceId === "toscane")?.status === "extracting", false);
    assert.equal(result.job.sourceCoverage.find((item) => item.sourceId === "toscane")?.errorCode, null);
  });
});
