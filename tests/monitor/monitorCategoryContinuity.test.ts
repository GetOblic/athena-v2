/**
 * Shared category continuity and worker failure containment.
 * Category rows are exercised through the Supabase store against an isolated
 * constraint stand-in. This file does not open PostgreSQL and does not call a retailer.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { MonitorPageFetch } from "../../services/monitor/monitorAdapter";
import {
  MONITOR_EQUAL_TIMESTAMP_LIMITATION,
  MONITOR_STALE_REFRESH_LIMITATION,
  MONITOR_TAXONOMY_UNVERIFIED_LIMITATION,
  type SharedCategoryDraft,
} from "../../services/monitor/monitorCategoryRefresh";
import { inspectWebsite } from "../../services/monitor/monitorCustomerApi";
import { executeMonitorJob } from "../../services/monitor/monitorEngine";
import {
  classifyMonitorDatabaseError,
  MonitorOperationError,
} from "../../services/monitor/monitorErrors";
import { createMemoryMonitorStore } from "../../services/monitor/monitorMemoryStore";
import { createMonitorService } from "../../services/monitor/monitorService";
import type { MonitorStore } from "../../services/monitor/monitorStore";
import { createSupabaseMonitorStore } from "../../services/monitor/monitorSupabaseStore";
import type { MonitorJob } from "../../services/monitor/monitorTypes";
import { categoryKeyFromUrl } from "../../services/monitor/monitorWebsiteIdentity";
import { runAthenaMonitorWorker } from "../../workers/athenaMonitorWorker";
import { ORG_A, USER_A, createClock, createFoundation, observationDraft, toscaneConfiguration } from "./helpers";

const WEBSITE = "https://www.toscane-boutique.fr/";
const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const CHEM = "https://www.toscane-boutique.fr/fr/chemisiers-tuniques-c-15.htm";
const ROBES = "https://www.toscane-boutique.fr/fr/robes-c-18.htm";
const TREG = "https://www.toscane-boutique.fr/fr/treggings-c-77.htm";
const PANTS_KEY = categoryKeyFromUrl(PANTS);
const CHEM_KEY = categoryKeyFromUrl(CHEM);
const ROBES_KEY = categoryKeyFromUrl(ROBES);
const TREG_KEY = categoryKeyFromUrl(TREG);
const T1 = "2026-11-26T09:00:00.000Z";
const T2 = "2026-11-26T10:00:00.000Z";
const T3 = "2026-11-26T11:00:00.000Z";
const T4 = "2026-11-26T12:00:00.000Z";
const T5 = "2026-11-26T13:00:00.000Z";
const T6 = "2026-11-26T14:00:00.000Z";
const T7 = "2026-11-26T15:00:00.000Z";
const T0 = "2026-11-26T08:00:00.000Z";

type Row = Record<string, unknown>;
type BackendName = "memory" | "supabase";

function category(input: {
  key: string;
  name: string;
  url: string;
  discoveredAt: string;
  parentCategoryKey?: string | null;
  discoveryStatus?: SharedCategoryDraft["discoveryStatus"];
}): SharedCategoryDraft {
  return {
    categoryKey: input.key,
    displayName: input.name,
    canonicalUrl: input.url,
    parentCategoryKey: input.parentCategoryKey ?? null,
    discoveredAt: input.discoveredAt,
    discoveryStatus: input.discoveryStatus ?? "current",
    productFamilyCount: null,
    productFamilyCountBasis: null,
  };
}

function createConstraintClient() {
  const tables = new Map<string, Row[]>([
    ["athena_monitor_sources", []],
    ["athena_monitor_source_categories", []],
    ["athena_monitor_discovery_coverage", []],
  ]);
  let deletes = 0;
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let rpcChain: Promise<unknown> = Promise.resolve();

  function tableRows(table: string): Row[] {
    const rows = tables.get(table);
    if (!rows) throw new Error(`unexpected table ${table}`);
    return rows;
  }

  function constraintError(code: string, name: string, table: string) {
    const message =
      code === "23505"
        ? `duplicate key value violates unique constraint "${name}"`
        : `update or delete on table "${table}" violates foreign key constraint "${name}"`;
    return { data: null, error: { code, message } };
  }

  function from(table: string) {
    const state: {
      op: "select" | "insert" | "update" | "delete";
      payload: Row | null;
      filters: Array<{ kind: "eq" | "lte" | "is"; column: string; value: unknown }>;
      order: { column: string; ascending: boolean } | null;
      select: string;
    } = { op: "select", payload: null, filters: [], order: null, select: "*" };

    const matches = (row: Row) =>
      state.filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.column] === filter.value;
        if (filter.kind === "is") return row[filter.column] == null;
        const left = Date.parse(String(row[filter.column] ?? ""));
        const right = Date.parse(String(filter.value));
        return Number.isFinite(left) && Number.isFinite(right) && left <= right;
      });

    const run = (single: boolean) => {
      if (state.op === "insert" && table === "athena_monitor_jobs") {
        return constraintError("23503", "athena_monitor_jobs_monitor_owner_fk", table);
      }
      const rows = tableRows(table);
      if (state.op === "delete") {
        deletes += 1;
        const matched = rows.filter(matches);
        if (
          table === "athena_monitor_source_categories" &&
          matched.some((row) =>
            tableRows("athena_monitor_discovery_coverage").some((coverage) => coverage.category_id === row.id),
          )
        ) {
          return constraintError("23503", "athena_monitor_discovery_coverage_category_fk", table);
        }
        for (const row of [...matched]) {
          const index = rows.indexOf(row);
          if (index >= 0) rows.splice(index, 1);
        }
        return { data: matched.map((row) => ({ ...row })), error: null };
      }
      if (state.op === "insert") {
        const payload = { ...(state.payload ?? {}) };
        if (
          table === "athena_monitor_sources" &&
          rows.some((row) => row.normalized_host === payload.normalized_host)
        ) {
          return constraintError("23505", "athena_monitor_sources_host_key", table);
        }
        if (table === "athena_monitor_source_categories") {
          if (rows.some((row) => row.source_id === payload.source_id && row.category_key === payload.category_key)) {
            return constraintError("23505", "athena_monitor_source_categories_key", table);
          }
          if (rows.some((row) => row.source_id === payload.source_id && row.canonical_url === payload.canonical_url)) {
            return constraintError("23505", "athena_monitor_source_categories_url", table);
          }
          if (
            payload.parent_category_id &&
            !rows.some((row) => row.id === payload.parent_category_id && row.source_id === payload.source_id)
          ) {
            return constraintError("23503", "athena_monitor_source_categories_parent_fk", table);
          }
        }
        if (table === "athena_monitor_discovery_coverage" && payload.category_id) {
          const category = tableRows("athena_monitor_source_categories").find(
            (row) => row.id === payload.category_id && row.source_id === payload.source_id,
          );
          if (!category) return constraintError("23503", "athena_monitor_discovery_coverage_category_fk", table);
        }
        rows.push(payload);
        return { data: single ? { ...payload } : [{ ...payload }], error: null };
      }
      if (state.op === "update") {
        const matched = rows.filter(matches);
        if (table === "athena_monitor_source_categories" && state.payload?.canonical_url) {
          const url = state.payload.canonical_url;
          if (
            matched.some((row) =>
              rows.some(
                (other) => other !== row && other.source_id === row.source_id && other.canonical_url === url,
              ),
            )
          ) {
            return constraintError("23505", "athena_monitor_source_categories_url", table);
          }
        }
        const updated = matched.map((row) => {
          const next = { ...row, ...(state.payload ?? {}), id: row.id };
          rows[rows.indexOf(row)] = next;
          return { ...next };
        });
        return { data: single ? (updated[0] ?? null) : updated, error: null };
      }
      let selected = rows.filter(matches).map((row) => ({ ...row }));
      if (state.select.includes("athena_monitor_source_categories")) {
        selected = selected.map((row) => ({
          ...row,
          athena_monitor_source_categories: tableRows("athena_monitor_source_categories")
            .filter((category) => category.source_id === row.id)
            .map((category) => ({ ...category })),
        }));
      }
      if (state.order) {
        const { column, ascending } = state.order;
        selected = selected.sort((left, right) => {
          const compared = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
          return ascending ? compared : -compared;
        });
      }
      return { data: single ? (selected[0] ?? null) : selected, error: null };
    };

    const builder = {
      select(columns?: string) {
        state.select = columns ?? "*";
        return builder;
      },
      insert(value: Row) {
        state.op = "insert";
        state.payload = value;
        return builder;
      },
      update(value: Row) {
        state.op = "update";
        state.payload = value;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ kind: "eq", column, value });
        return builder;
      },
      lte(column: string, value: string) {
        state.filters.push({ kind: "lte", column, value });
        return builder;
      },
      is(column: string, value: null) {
        state.filters.push({ kind: "is", column, value });
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        state.order = { column, ascending: options.ascending };
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      single() {
        return Promise.resolve(run(true));
      },
      then(
        resolve: (value: { data: unknown; error: { code?: string; message?: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    return builder;
  }

  function camelCategory(row: Row) {
    return {
      id: row.id,
      sourceId: row.source_id,
      categoryKey: row.category_key,
      displayName: row.display_name,
      canonicalUrl: row.canonical_url,
      parentCategoryId: row.parent_category_id ?? null,
      parentCategoryKey: row.parent_category_key ?? null,
      discoveredAt: row.discovered_at,
      discoveryStatus: row.discovery_status,
      productFamilyCount: row.product_family_count ?? null,
      productFamilyCountBasis: row.product_family_count_basis ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function publication(outcome: string, sourceId: string, authoritative = false) {
    const categories = tableRows("athena_monitor_source_categories")
      .filter((row) => row.source_id === sourceId)
      .map((row) => camelCategory(row))
      .sort((left, right) => String(left.categoryKey).localeCompare(String(right.categoryKey)));
    const limitation =
      outcome === "stale"
        ? MONITOR_STALE_REFRESH_LIMITATION
        : outcome === "already_published"
          ? MONITOR_EQUAL_TIMESTAMP_LIMITATION
          : outcome === "published" && authoritative
            ? null
            : MONITOR_TAXONOMY_UNVERIFIED_LIMITATION;
    return {
      data: {
        outcome,
        freshnessAdvanced: outcome === "published",
        taxonomyCompleteness: outcome === "published" && authoritative ? "authoritative" : "unverified",
        absentCategoriesPreserved: !(outcome === "published" && authoritative),
        limitation,
        categories,
      },
      error: null,
    };
  }

  function reconcile(args: Record<string, unknown>) {
    const sourceId = String(args.p_source_id ?? "");
    const discoveredAt = String(args.p_discovered_at ?? "");
    const authoritative = args.p_authoritative === true;
    const incoming = Array.isArray(args.p_categories) ? (args.p_categories as Row[]) : null;
    const source = tableRows("athena_monitor_sources").find((row) => row.id === sourceId);
    if (!source) return { data: null, error: { code: "P0002", message: "monitor_source_missing" } };
    if (!incoming) {
      return { data: null, error: { code: "22023", message: "monitor_category_publication_invalid" } };
    }
    if (incoming.length === 0) return publication("empty", sourceId);
    const keys = incoming.map((item) => String(item.categoryKey ?? ""));
    const urls = incoming.map((item) => String(item.canonicalUrl ?? ""));
    if (new Set(keys).size !== keys.length || new Set(urls).size !== urls.length) {
      return {
        data: null,
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "athena_monitor_source_categories_url"',
        },
      };
    }
    const stored = typeof source.last_discovered_at === "string" ? Date.parse(source.last_discovered_at) : Number.NaN;
    const next = Date.parse(discoveredAt);
    if (Number.isFinite(stored) && next === stored) return publication("already_published", sourceId);
    if (Number.isFinite(stored) && next < stored) return publication("stale", sourceId);
    const byKey = new Map(incoming.map((item) => [String(item.categoryKey), item]));
    const ordered: Row[] = [];
    const seen = new Set<string>();
    const visit = (key: string, stack: string[]) => {
      if (seen.has(key)) return;
      if (stack.includes(key)) {
        throw new Error("cycle");
      }
      const item = byKey.get(key);
      const parent = item?.parentCategoryKey;
      if (typeof parent === "string" && byKey.has(parent)) visit(parent, [...stack, key]);
      seen.add(key);
      if (item) ordered.push(item);
    };
    try {
      for (const item of incoming) visit(String(item.categoryKey), []);
    } catch {
      return { data: null, error: { code: "22023", message: "monitor_category_publication_invalid" } };
    }
    const draft = tableRows("athena_monitor_source_categories").map((row) => ({ ...row }));
    for (const item of ordered) {
      const key = String(item.categoryKey);
      const url = String(item.canonicalUrl);
      const parentKey = typeof item.parentCategoryKey === "string" ? item.parentCategoryKey : null;
      const parent = parentKey ? draft.find((row) => row.source_id === sourceId && row.category_key === parentKey) : null;
      if (parentKey && !parent) {
        return {
          data: null,
          error: {
            code: "23503",
            message: 'insert or update violates foreign key constraint "athena_monitor_source_categories_parent_fk"',
          },
        };
      }
      const urlOwner = draft.find((row) => row.source_id === sourceId && row.canonical_url === url && row.category_key !== key);
      if (urlOwner) {
        return {
          data: null,
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "athena_monitor_source_categories_url"',
          },
        };
      }
      const index = draft.findIndex((row) => row.source_id === sourceId && row.category_key === key);
      if (index >= 0) {
        const current = draft[index]!;
        draft[index] = {
          ...current,
          display_name: item.displayName,
          canonical_url: url,
          parent_category_id: parent?.id ?? null,
          parent_category_key: parentKey,
          discovered_at: item.discoveredAt,
          discovery_status: item.discoveryStatus,
          product_family_count: item.productFamilyCount ?? null,
          product_family_count_basis: item.productFamilyCountBasis ?? null,
          updated_at: discoveredAt,
        };
      } else {
        draft.push({
          id: randomUUID(),
          source_id: sourceId,
          category_key: key,
          display_name: item.displayName,
          canonical_url: url,
          parent_category_id: parent?.id ?? null,
          parent_category_key: parentKey,
          discovered_at: item.discoveredAt,
          discovery_status: item.discoveryStatus ?? "current",
          product_family_count: item.productFamilyCount ?? null,
          product_family_count_basis: item.productFamilyCountBasis ?? null,
          created_at: discoveredAt,
          updated_at: discoveredAt,
        });
      }
    }
    if (authoritative) {
      for (const row of draft) {
        if (row.source_id === sourceId && !byKey.has(String(row.category_key)) && row.discovery_status !== "removed") {
          row.discovery_status = "removed";
          row.discovered_at = discoveredAt;
          row.updated_at = discoveredAt;
        }
      }
    }
    const live = tableRows("athena_monitor_source_categories");
    live.splice(0, live.length, ...draft);
    source.discovery_status = "current";
    source.last_discovered_at = discoveredAt;
    source.updated_at = discoveredAt;
    return publication("published", sourceId, authoritative);
  }

  return {
    deletes: () => deletes,
    rpcCalls: () => rpcCalls.map((call) => ({ fn: call.fn, args: { ...call.args } })),
    client: {
      from,
      rpc(fn: string, args: Record<string, unknown> = {}) {
        const run = rpcChain.then(() => {
          rpcCalls.push({ fn, args });
          if (fn !== "reconcile_athena_monitor_source_categories") {
            return { data: null, error: { code: "PGRST202", message: `rpc ${fn} is not the category publication` } };
          }
          return reconcile(args);
        });
        rpcChain = run.then(() => undefined, () => undefined);
        return run;
      },
    },
  };
}

async function openBackend(backend: BackendName) {
  if (backend === "memory") {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    return { service: foundation.service, store: foundation.store, deletes: () => 0, clock: foundation.clock };
  }
  const fake = createConstraintClient();
  const clock = createClock(T1);
  const store = await createSupabaseMonitorStore(fake.client as never);
  const service = createMonitorService({
    store,
    now: clock.now,
    resolvePlan: async () => "full" as const,
    requireOrganizationContext: async () => ({ organizationId: ORG_A, userId: USER_A }),
  });
  return { service, store, deletes: fake.deletes, clock };
}

async function sourceId(store: MonitorStore): Promise<string> {
  const source = await store.getSharedSourceByHost("toscane-boutique.fr");
  assert.ok(source);
  return source.id;
}

function pantsPage(page: number): string {
  return `https://www.toscane-boutique.fr/fr/pantalons-c-42-page-${page}.htm`;
}

function familyAnchor(id: string): string {
  return `<a href="https://www.toscane-boutique.fr/fr/pantalons/modele-p-${id}-coul-1.htm">Modele ${id}</a>`;
}

function productHtml(id: string): string {
  const colors = ["Noir", "Camel", "Marine", "Anthracite"];
  const swatches = colors
    .map(
      (name, index) =>
        `<li id="p${id}-${index + 1}" data-params="{ colorLbl: '${name}', colorID: '${index + 1}' }"></li>`,
    )
    .join("");
  return `<html><head>
    <link rel="canonical" href="https://www.toscane-boutique.fr/fr/pantalons/modele-p-${id}-coul-1.htm" />
    <meta property="og:image" content="https://cdn.toscane-boutique.fr/products_images/prod_${id}/front.jpg" />
    <script type="application/ld+json">{"@type":"Product","name":"Modele ${id}","offers":{"@type":"Offer","price":"49.00","priceCurrency":"EUR"}}</script>
  </head><body>
    <div data-params="{ prodID: ${id} }" data-gtm_item_name="Modele ${id}"></div>
    <ul>${swatches}<li data-cid="1">36</li><li data-cid="1">Longueur 32</li></ul>
  </body></html>`;
}

function categoryHome(links: ReadonlyArray<{ href: string; name: string }>): string {
  return `<nav><ul>${links.map((link) => `<li><a href="${link.href}">${link.name}</a></li>`).join("")}</ul></nav>`;
}

describe("database error classification", () => {
  it("does not treat an ordinary foreign-key violation as a tenant attack", () => {
    const ordinary = classifyMonitorDatabaseError({
      code: "23503",
      message:
        'update or delete on table "athena_monitor_source_categories" violates foreign key constraint "athena_monitor_discovery_coverage_category_fk"',
    });
    assert.equal(ordinary.code, "FOREIGN_KEY_VIOLATION");
    assert.equal(ordinary.message.includes("athena_monitor"), false);
    assert.equal(ordinary.metadata?.sqlState, "23503");
    assert.equal(ordinary.metadata?.constraint, "athena_monitor_discovery_coverage_category_fk");

    const unnamed = classifyMonitorDatabaseError({
      code: "23503",
      message: "insert or update violates foreign key constraint",
    });
    assert.equal(unnamed.code, "FOREIGN_KEY_VIOLATION");
    assert.equal(unnamed.metadata?.constraint, undefined);

    const tenant = classifyMonitorDatabaseError({
      code: "23503",
      message: 'insert or update violates foreign key constraint "athena_monitor_jobs_monitor_owner_fk"',
    });
    assert.equal(tenant.code, "CROSS_ORGANIZATION");

    const observation = classifyMonitorDatabaseError({
      code: "23503",
      message: 'insert or update violates foreign key constraint "athena_monitor_observations_job_owner_fk"',
    });
    assert.equal(observation.code, "CROSS_ORGANIZATION");

    assert.equal(
      classifyMonitorDatabaseError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "athena_monitor_jobs_one_active_per_monitor"',
      }).code,
      "ACTIVE_JOB_EXISTS",
    );
    assert.equal(
      classifyMonitorDatabaseError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "athena_monitor_source_categories_key"',
      }).code,
      "CONSTRAINT_VIOLATION",
    );
  });

  it("keeps a real owner-key violation and a dangling category reference distinct in the store", async () => {
    const fake = createConstraintClient();
    const store = await createSupabaseMonitorStore(fake.client as never);
    await assert.rejects(
      () =>
        store.insertJob({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          organizationId: ORG_A,
          monitorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          status: "queued",
          configurationVersion: 1,
          configurationSnapshot: toscaneConfiguration(),
          progress: { version: 1, familiesDiscovered: 0, familiesAnalyzed: 0, familiesPersisted: 0 },
          sourceCoverage: [],
          executionCursor: { version: 1, sources: [] },
          attemptCount: 0,
          createdAt: T1,
          updatedAt: T1,
        } as never),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "CROSS_ORGANIZATION",
    );
    await assert.rejects(
      () =>
        store.saveDiscoveryCoverage({
          id: randomUUID(),
          sourceId: randomUUID(),
          scopeKind: "category",
          categoryId: randomUUID(),
          scopeKey: PANTS_KEY,
          status: "completed",
          adapterId: "solusquare",
          adapterVersion: "2",
          schemaVersion: 1,
          discoveredAt: T1,
          familyIds: ["901"],
          familyCount: 1,
          createdAt: T1,
        }),
      (error: unknown) =>
        error instanceof MonitorOperationError &&
        error.code === "FOREIGN_KEY_VIOLATION" &&
        error.metadata?.constraint === "athena_monitor_discovery_coverage_category_fk" &&
        error.message === "The request could not be saved.",
    );
  });
});

describe("shared category continuity", () => {
  for (const backend of ["memory", "supabase"] as const) {
    it(`preserves category identity, coverage, and observations on ${backend}`, async () => {
      const { service, store, deletes } = await openBackend(backend);
      const first = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T1,
        authoritativeTaxonomy: false,
        categories: [
          category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 }),
          category({
            key: TREG_KEY,
            name: "Treggings",
            url: TREG,
            discoveredAt: T1,
            parentCategoryKey: PANTS_KEY,
          }),
        ],
      });
      assert.equal(first.taxonomyCompleteness, "unverified");
      assert.equal(first.absentCategoriesPreserved, true);
      assert.equal(first.freshnessAdvanced, true);
      assert.equal(first.limitation, MONITOR_TAXONOMY_UNVERIFIED_LIMITATION);
      const id = await sourceId(store);
      const original = await store.listSharedCategories(id);
      const pants = original.find((item) => item.categoryKey === PANTS_KEY);
      const treg = original.find((item) => item.categoryKey === TREG_KEY);
      assert.ok(pants && treg);
      assert.equal(treg.parentCategoryId, pants.id);

      const renamed = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T2,
        categories: [
          category({ key: PANTS_KEY, name: "Pantalons femme", url: PANTS, discoveredAt: T2 }),
          category({
            key: TREG_KEY,
            name: "Treggings",
            url: TREG,
            discoveredAt: T2,
            parentCategoryKey: PANTS_KEY,
          }),
        ],
      });
      const afterRename = await store.listSharedCategories(id);
      assert.equal(afterRename.find((item) => item.categoryKey === PANTS_KEY)?.id, pants.id);
      assert.equal(afterRename.find((item) => item.categoryKey === TREG_KEY)?.id, treg.id);
      assert.equal(afterRename.find((item) => item.categoryKey === PANTS_KEY)?.displayName, "Pantalons femme");
      assert.equal(renamed.categories.find((item) => item.categoryKey === PANTS_KEY)?.id, pants.id);

      const added = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T3,
        categories: [
          category({ key: PANTS_KEY, name: "Pantalons femme", url: PANTS, discoveredAt: T3 }),
          category({ key: CHEM_KEY, name: "Chemisiers & Tuniques", url: CHEM, discoveredAt: T3 }),
        ],
      });
      const afterAdd = await store.listSharedCategories(id);
      assert.equal(afterAdd.find((item) => item.categoryKey === PANTS_KEY)?.id, pants.id);
      assert.equal(afterAdd.find((item) => item.categoryKey === TREG_KEY)?.id, treg.id);
      assert.equal(afterAdd.find((item) => item.categoryKey === TREG_KEY)?.discoveryStatus, "current");
      assert.ok(afterAdd.some((item) => item.categoryKey === CHEM_KEY));
      assert.equal(added.absentCategoriesPreserved, true);

      const coverage = await service.recordSharedDiscoveryCoverage({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        coverage: {
          scopeKind: "category",
          categoryId: pants.id,
          scopeKey: PANTS_KEY,
          status: "completed",
          adapterId: "solusquare",
          adapterVersion: "2",
          schemaVersion: 1,
          discoveredAt: T1,
          familyIds: ["901"],
          familyCount: 1,
        },
      });
      await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T4,
        authoritativeTaxonomy: false,
        categories: [category({ key: CHEM_KEY, name: "Chemisiers & Tuniques", url: CHEM, discoveredAt: T4 })],
      });
      const covered = await store.listDiscoveryCoverage(id);
      assert.equal(covered.length, 1);
      assert.equal(covered[0]?.id, coverage.id);
      assert.equal(covered[0]?.categoryId, pants.id);
      assert.deepEqual(covered[0]?.familyIds, ["901"]);
      assert.equal((await store.listSharedCategories(id)).find((item) => item.id === pants.id)?.discoveryStatus, "current");

      if (backend === "memory") {
        const source = (await store.getSharedSourceByHost("toscane-boutique.fr"))!;
        const saved = await store.savePublicObservation({
          id: "55555555-5555-4555-8555-555555555555",
          sourceId: source.id,
          registeredSourceId: source.registeredSourceId,
          familyId: "901",
          adapterId: source.adapterId,
          adapterVersion: source.adapterVersion,
          schemaVersion: 1,
          productName: "Modele 901",
          canonicalUrl: "https://www.toscane-boutique.fr/fr/pantalons/modele-p-901-coul-1.htm",
          priceAmount: "49.00",
          currency: "EUR",
          colorPatternIds: ["1"],
          colorPatternNames: ["Noir"],
          distinctVariationCount: 4,
          sizes: ["36"],
          lengths: null,
          imageUrl: null,
          categoryName: "Pantalons",
          observedAt: T1,
          provenance: {
            version: 1,
            adapterId: source.adapterId,
            adapterVersion: source.adapterVersion,
            schemaVersion: 1,
            categoryIds: [PANTS_KEY],
          },
          contentKey: "a".repeat(64),
          createdAt: T1,
        });
        await service.recordSharedCategoryDiscovery({
          organizationId: ORG_A,
          websiteUrl: WEBSITE,
          discoveredAt: T5,
          categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T5 })],
        });
        const historical = await store.getPublicObservation(saved.observation.id);
        assert.equal(historical?.id, saved.observation.id);
        assert.equal(historical?.productName, "Modele 901");
        assert.equal(historical?.priceAmount, "49.00");
      }

      const removed = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T6,
        authoritativeTaxonomy: true,
        categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T6 })],
      });
      assert.equal(removed.taxonomyCompleteness, "authoritative");
      assert.equal(removed.limitation, null);
      const inactive = (await store.listSharedCategories(id)).find((item) => item.categoryKey === TREG_KEY);
      assert.equal(inactive?.id, treg.id);
      assert.equal(inactive?.discoveryStatus, "removed");
      const stillCovered = await store.listDiscoveryCoverage(id);
      assert.equal(stillCovered[0]?.categoryId, pants.id);
      assert.deepEqual(stillCovered[0]?.familyIds, ["901"]);

      const reactivated = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T7,
        categories: [
          category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T7 }),
          category({
            key: TREG_KEY,
            name: "Treggings",
            url: TREG,
            discoveredAt: T7,
            parentCategoryKey: PANTS_KEY,
          }),
        ],
      });
      const tregRows = reactivated.categories.filter((item) => item.categoryKey === TREG_KEY);
      assert.equal(tregRows.length, 1);
      assert.equal(tregRows[0]?.id, treg.id);
      assert.equal(tregRows[0]?.discoveryStatus, "current");
      assert.equal(deletes(), 0);
    });

    it(`does not advance freshness for an empty or failed publication on ${backend}`, async () => {
      const { service, store } = await openBackend(backend);
      await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T1,
        categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 })],
      });
      const empty = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T2,
        categories: [],
      });
      assert.equal(empty.freshnessAdvanced, false);
      assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.lastDiscoveredAt, T1);
      await assert.rejects(() =>
        service.recordSharedCategoryDiscovery({
          organizationId: ORG_A,
          websiteUrl: WEBSITE,
          discoveredAt: T2,
          categories: [
            category({ key: PANTS_KEY, name: "Should roll back", url: PANTS, discoveredAt: T2 }),
            category({ key: CHEM_KEY, name: "Chemisiers", url: PANTS, discoveredAt: T2 }),
          ],
        }),
      );
      assert.equal((await store.listSharedCategories(await sourceId(store))).find((item) => item.categoryKey === PANTS_KEY)?.displayName, "Pantalons");
      assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.lastDiscoveredAt, T1);
      assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.discoveryStatus, "current");
    });

    it(`ignores an older refresh after a newer discovery on ${backend}`, async () => {
      const { service, store } = await openBackend(backend);
      await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T2,
        authoritativeTaxonomy: true,
        categories: [category({ key: PANTS_KEY, name: "Newer", url: PANTS, discoveredAt: T2 })],
      });
      const older = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T0,
        authoritativeTaxonomy: true,
        categories: [
          category({ key: PANTS_KEY, name: "Older", url: PANTS, discoveredAt: T0 }),
          category({ key: CHEM_KEY, name: "Added by stale refresh", url: CHEM, discoveredAt: T0 }),
        ],
      });
      assert.equal(older.freshnessAdvanced, false);
      assert.equal(older.limitation, MONITOR_STALE_REFRESH_LIMITATION);
      const rows = await store.listSharedCategories(await sourceId(store));
      assert.equal(rows.find((item) => item.categoryKey === PANTS_KEY)?.displayName, "Newer");
      assert.equal(rows.some((item) => item.categoryKey === CHEM_KEY), false);
      assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.lastDiscoveredAt, T2);
    });

    it(`does not treat an equal timestamp as the same category set on ${backend}`, async () => {
      const { service, store } = await openBackend(backend);
      await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T2,
        categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T2 })],
      });
      const sameInstant = await service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T2,
        categories: [
          category({ key: PANTS_KEY, name: "Different payload", url: PANTS, discoveredAt: T2 }),
          category({ key: CHEM_KEY, name: "Chemisiers", url: CHEM, discoveredAt: T2 }),
        ],
      });
      assert.equal(sameInstant.outcome, "already_published");
      assert.equal(sameInstant.freshnessAdvanced, false);
      assert.equal(sameInstant.limitation, MONITOR_EQUAL_TIMESTAMP_LIMITATION);
      const rows = await store.listSharedCategories(await sourceId(store));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.displayName, "Pantalons");
      assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.lastDiscoveredAt, T2);
    });
  }

  it("does not create duplicate identities when two refreshes insert the same category", async () => {
    const { service, store } = await openBackend("supabase");
    await service.resolveSharedWebsite(ORG_A, WEBSITE);
    await Promise.all([
      service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T1,
        categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 })],
      }),
      service.recordSharedCategoryDiscovery({
        organizationId: ORG_A,
        websiteUrl: WEBSITE,
        discoveredAt: T1,
        categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 })],
      }),
    ]);
    const rows = await store.listSharedCategories(await sourceId(store));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.categoryKey, PANTS_KEY);
  });

  it("uses the same non-authoritative refresh from the website check and the worker", async () => {
    const engine = readFileSync("services/monitor/monitorEngine.ts", "utf8");
    const api = readFileSync("services/monitor/monitorCustomerApi.ts", "utf8");
    const supabase = readFileSync("services/monitor/monitorSupabaseStore.ts", "utf8");
    const memory = readFileSync("services/monitor/monitorMemoryStore.ts", "utf8");
    assert.match(engine, /authoritativeTaxonomy: false/);
    assert.match(api, /authoritativeTaxonomy: false/);
    assert.match(supabase, /reconcile_athena_monitor_source_categories/);
    assert.doesNotMatch(supabase, /from\("athena_monitor_source_categories"\)[\s\S]{0,80}\.(insert|update|delete)\(/);
    assert.doesNotMatch(supabase, /refreshSharedCategories\(writer/);
    assert.match(readFileSync("workers/athenaMonitorWorker.ts", "utf8"), /createSupabaseMonitorStore/);
    assert.match(api, /createSupabaseMonitorStore/);
    assert.doesNotMatch(memory, /sharedCategories\.splice\(0,\s*sharedCategories\.length\)/);
    assert.equal(engine.includes("saveSharedCategories"), false);
    assert.equal(api.includes("saveSharedCategories"), false);

    const { service, store } = await openBackend("memory");
    let pass = 0;
    const discover = async () => {
      pass += 1;
      const links =
        pass === 1
          ? [
              { displayName: "Pantalons", canonicalUrl: PANTS, parentCategoryKey: null },
              { displayName: "Robes", canonicalUrl: ROBES, parentCategoryKey: null },
            ]
          : [{ displayName: "Pantalons femme", canonicalUrl: PANTS, parentCategoryKey: null }];
      return { ok: true as const, categories: links };
    };
    await inspectWebsite(service, { websiteUrl: WEBSITE, refresh: true }, discover);
    const id = await sourceId(store);
    const before = await store.listSharedCategories(id);
    const pantsId = before.find((item) => item.categoryKey === PANTS_KEY)?.id;
    const robesId = before.find((item) => item.categoryKey === ROBES_KEY)?.id;
    await inspectWebsite(service, { websiteUrl: WEBSITE, refresh: true }, discover);
    const after = await store.listSharedCategories(id);
    assert.equal(after.find((item) => item.categoryKey === PANTS_KEY)?.id, pantsId);
    assert.equal(after.find((item) => item.categoryKey === PANTS_KEY)?.displayName, "Pantalons femme");
    assert.equal(after.find((item) => item.categoryKey === ROBES_KEY)?.id, robesId);
    assert.equal(after.find((item) => item.categoryKey === ROBES_KEY)?.discoveryStatus, "current");
  });
});

describe("transactional category publication contract", () => {
  it("uses one production RPC for published, stale, empty, and equal-timestamp results", async () => {
    const fake = createConstraintClient();
    const store = await createSupabaseMonitorStore(fake.client as never);
    const service = createMonitorService({
      store,
      now: () => new Date(T2),
      resolvePlan: async () => "full" as const,
      requireOrganizationContext: async () => ({ organizationId: ORG_A, userId: USER_A }),
    });
    const published = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T1,
      authoritativeTaxonomy: false,
      categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 })],
    });
    assert.equal(published.outcome, "published");
    assert.equal(fake.deletes(), 0);
    assert.equal(fake.rpcCalls().length, 1);
    const call = fake.rpcCalls()[0];
    assert.equal(call?.fn, "reconcile_athena_monitor_source_categories");
    assert.equal(call?.args.p_source_id, await sourceId(store));
    assert.equal(call?.args.p_discovered_at, T1);
    assert.equal(call?.args.p_authoritative, false);
    assert.equal(Array.isArray(call?.args.p_categories), true);
    const stale = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T0,
      categories: [category({ key: CHEM_KEY, name: "Chemisiers", url: CHEM, discoveredAt: T0 })],
    });
    const empty = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T2,
      categories: [],
    });
    const sameInstant = await service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T1,
      categories: [category({ key: PANTS_KEY, name: "Different", url: PANTS, discoveredAt: T1 })],
    });
    assert.equal(stale.outcome, "stale");
    assert.equal(empty.outcome, "empty");
    assert.equal(empty.freshnessAdvanced, false);
    assert.equal(sameInstant.outcome, "already_published");
    assert.equal(fake.rpcCalls().length, 4);
    assert.equal(fake.deletes(), 0);
    assert.equal((await store.listSharedCategories(await sourceId(store))).length, 1);
    assert.equal((await store.getSharedSourceByHost("toscane-boutique.fr"))?.lastDiscoveredAt, T1);
  });

  it("fails closed when the RPC is missing or the payload is not a publication", async () => {
    const input = {
      sourceId: "44444444-4444-4444-8444-444444444444",
      discoveredAt: T1,
      authoritativeTaxonomy: false,
      categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 })],
    };
    const missing = await createSupabaseMonitorStore({
      from() {
        throw new Error("per-statement fallback");
      },
      async rpc() {
        return {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function reconcile_athena_monitor_source_categories" },
        };
      },
    } as never);
    await assert.rejects(
      () => missing.refreshSharedCategories(input),
      (error: unknown) =>
        error instanceof MonitorOperationError &&
        error.code === "PERSISTENCE_FAILED" &&
        error.metadata?.reason === "missing_rpc" &&
        error.message === "The request could not be saved.",
    );
    const invalid = await createSupabaseMonitorStore({
      from() {
        throw new Error("per-statement fallback");
      },
      async rpc() {
        return { data: { outcome: "published" }, error: null };
      },
    } as never);
    await assert.rejects(
      () => invalid.refreshSharedCategories(input),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "PERSISTENCE_FAILED",
    );
  });

  it("keeps an ordinary category foreign key out of the tenant classification", async () => {
    const store = await createSupabaseMonitorStore({
      from() {
        throw new Error("per-statement fallback");
      },
      async rpc() {
        return {
          data: null,
          error: {
            code: "23503",
            message:
              'insert or update on table "athena_monitor_source_categories" violates foreign key constraint "athena_monitor_source_categories_parent_fk"',
          },
        };
      },
    } as never);
    await assert.rejects(
      () =>
        store.refreshSharedCategories({
          sourceId: "44444444-4444-4444-8444-444444444444",
          discoveredAt: T1,
          authoritativeTaxonomy: false,
          categories: [category({ key: TREG_KEY, name: "Treggings", url: TREG, discoveredAt: T1, parentCategoryKey: PANTS_KEY })],
        }),
      (error: unknown) => {
        const code = error instanceof MonitorOperationError ? String(error.code) : "";
        return (
          error instanceof MonitorOperationError &&
          code !== "CROSS_ORGANIZATION" &&
          code === "FOREIGN_KEY_VIOLATION" &&
          error.metadata?.constraint === "athena_monitor_source_categories_parent_fk" &&
          error.message === "The request could not be saved."
        );
      },
    );
  });
});

describe("removed categories stay out of current enumeration", () => {
  it("preserves a removed category and does not enumerate it", async () => {
    const clock = createClock(T1);
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    await foundation.service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T1,
      categories: [
        category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T1 }),
        category({ key: ROBES_KEY, name: "Robes", url: ROBES, discoveredAt: T1 }),
      ],
    });
    const id = await sourceId(foundation.store);
    const robesId = (await foundation.store.listSharedCategories(id)).find((item) => item.categoryKey === ROBES_KEY)?.id;
    assert.ok(robesId);
    const coverage = await foundation.service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      coverage: {
        scopeKind: "category",
        categoryId: robesId,
        scopeKey: ROBES_KEY,
        status: "completed",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt: T1,
        familyIds: ["901"],
        familyCount: 1,
      },
    });
    await foundation.service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: WEBSITE,
      discoveredAt: T2,
      authoritativeTaxonomy: true,
      categories: [category({ key: PANTS_KEY, name: "Pantalons", url: PANTS, discoveredAt: T2 })],
    });
    clock.advance(60 * 60 * 1000);
    const inspection = await inspectWebsite(foundation.service, { websiteUrl: WEBSITE });
    assert.equal(inspection.website.categories.some((item) => item.categoryKey === ROBES_KEY), false);
    assert.equal(inspection.website.categories.some((item) => item.categoryKey === PANTS_KEY), true);
    const urls: string[] = [];
    const fetchPage: MonitorPageFetch = async (request) => {
      urls.push(request.url);
      if (request.url === PANTS) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: familyAnchor("901") };
      }
      const family = new URL(request.url).pathname.match(/-p-(\d+)-coul-/);
      if (family?.[1]) return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
      return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
    };
    const catalog = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ name: "Whole catalog", selection: { mode: "whole_catalog" } }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: catalog.id });
    await claimAndRun({ service: foundation.service, store: foundation.store, fetchPage, now: clock.now });
    assert.equal(urls.includes(ROBES), false);
    assert.equal(urls.includes(PANTS), true);
    const removed = (await foundation.store.listSharedCategories(id)).find((item) => item.categoryKey === ROBES_KEY);
    assert.equal(removed?.id, robesId);
    assert.equal(removed?.discoveryStatus, "removed");
    assert.equal((await foundation.store.listDiscoveryCoverage(id)).find((item) => item.id === coverage.id)?.categoryId, robesId);

    const selected = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Removed category",
        selection: { mode: "categories", categoryUrls: [ROBES] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: selected.id });
    const removedUrls: string[] = [];
    const removedRun = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: async (request) => {
        removedUrls.push(request.url);
        return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
      },
      now: clock.now,
    });
    assert.equal(removedUrls.includes(ROBES), false);
    assert.equal(removedRun.job.sourceCoverage[0]?.errorCode, "UNKNOWN_CATEGORY");
  });
});

describe("worker job containment", () => {
  it("finalizes one deterministic persistence failure and continues with the next job", async () => {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const first = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "First search",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    const second = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Second search",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: first.id });
    foundation.clock.advance(1);
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: second.id });
    const queued = await foundation.store.listJobs({ organizationId: ORG_A, monitorId: null, limit: 10 });
    const firstJob = queued.find((job) => job.monitorId === first.id);
    const secondJob = queued.find((job) => job.monitorId === second.id);
    assert.ok(firstJob && secondJob);
    const original = foundation.service.recordSharedCategoryDiscovery.bind(foundation.service);
    let thrown = false;
    foundation.service.recordSharedCategoryDiscovery = async (input) => {
      if (!thrown) {
        thrown = true;
        throw new MonitorOperationError(
          "PERSISTENCE_FAILED",
          'duplicate key value violates foreign key constraint "athena_monitor_discovery_coverage_category_fk"',
        );
      }
      return original(input);
    };
    let stop = false;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      shouldStop: () => stop,
      sleep: async () => {
        const stored = await foundation.store.getJob(ORG_A, secondJob.id);
        if (stored && stored.status !== "queued" && stored.status !== "processing") stop = true;
      },
      pollIntervalMs: 1,
      fetchPage: catalogFetch(),
      now: foundation.clock.now,
    });
    const failed = await foundation.store.getJob(ORG_A, firstJob.id);
    const completed = await foundation.store.getJob(ORG_A, secondJob.id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.errorCode, "PERSISTENCE_FAILED");
    assert.equal(failed?.errorMessage, "The search could not continue.");
    assert.equal(JSON.stringify(failed?.errorMetadata).includes("athena_monitor"), false);
    assert.equal(completed?.status, "completed");
    assert.ok((await foundation.store.listObservations(ORG_A, secondJob.id)).length > 0);
  });

  it("keeps observations already stored when the same job later fails", async () => {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ selection: { mode: "categories", categoryUrls: [PANTS] } }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await foundation.service.claimNextMonitorJob();
    assert.ok(claimed && claimed.disposition === "claimed");
    await foundation.service.persistMonitorObservations({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken!,
      observations: [observationDraft("901", 4)],
    });
    const before = await foundation.store.listObservations(ORG_A, claimed.job.id);
    await foundation.service.yieldMonitorJob({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken!,
    });
    foundation.service.recordSharedCategoryDiscovery = async () => {
      throw new MonitorOperationError("PERSISTENCE_FAILED", "database payload");
    };
    let stop = false;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      shouldStop: () => stop,
      sleep: async () => {
        stop = true;
      },
      pollIntervalMs: 1,
      fetchPage: catalogFetch(),
      now: foundation.clock.now,
    });
    const stored = await foundation.store.getJob(ORG_A, claimed.job.id);
    const after = await foundation.store.listObservations(ORG_A, claimed.job.id);
    assert.equal(stored?.status, "failed");
    assert.equal(after.length, 1);
    assert.equal(after[0]?.id, before[0]?.id);
    assert.equal(after[0]?.publicObservationId, before[0]?.publicObservationId);
    assert.equal(stored?.errorMessage?.includes("database payload"), false);
  });

  it("does not retry a stale claim and does not loop when failure recording also fails", async () => {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ selection: { mode: "categories", categoryUrls: [PANTS] } }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const queued = (await foundation.store.listJobs({ organizationId: ORG_A, monitorId: monitor.id, limit: 1 }))[0];
    assert.ok(queued);
    foundation.service.recordSharedCategoryDiscovery = async () => {
      throw new MonitorOperationError("FOREIGN_KEY_VIOLATION", "The request could not be saved.");
    };
    const claim = foundation.service.claimNextMonitorJob.bind(foundation.service);
    let activeToken: string | null = null;
    foundation.service.claimNextMonitorJob = async (input) => {
      const claimed = await claim(input);
      if (claimed?.disposition === "claimed" && claimed.job.claimToken) activeToken = claimed.job.claimToken;
      return claimed;
    };
    let staleCalls = 0;
    foundation.service.finalizeMonitorJob = async (input) => {
      staleCalls += 1;
      assert.equal(input.claimToken, activeToken);
      assert.notEqual(input.status, "completed");
      throw new MonitorOperationError("STALE_CLAIM");
    };
    let stop = false;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      shouldStop: () => stop,
      sleep: async () => {
        stop = true;
      },
      pollIntervalMs: 1,
      fetchPage: catalogFetch(),
      now: foundation.clock.now,
    });
    assert.equal(staleCalls, 1);
    assert.equal((await foundation.store.getJob(ORG_A, queued.id))?.status, "processing");

    const other = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const first = await other.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Unrecordable",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    const next = await other.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Eligible next",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await other.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: first.id });
    other.clock.advance(1);
    await other.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: next.id });
    const jobs = await other.store.listJobs({ organizationId: ORG_A, monitorId: null, limit: 5 });
    const blocked = jobs.find((job) => job.monitorId === first.id);
    const eligible = jobs.find((job) => job.monitorId === next.id);
    assert.ok(blocked && eligible);
    const refresh = other.service.recordSharedCategoryDiscovery.bind(other.service);
    let refreshCalls = 0;
    other.service.recordSharedCategoryDiscovery = async (input) => {
      refreshCalls += 1;
      if (refreshCalls === 1) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return refresh(input);
    };
    const finalize = other.service.finalizeMonitorJob.bind(other.service);
    let failedWrites = 0;
    const sleeps: number[] = [];
    other.service.finalizeMonitorJob = async (input) => {
      if (input.jobId === blocked.id) {
        failedWrites += 1;
        throw new MonitorOperationError("PERSISTENCE_FAILED", "connection reset");
      }
      return finalize(input);
    };
    let done = false;
    await runAthenaMonitorWorker({
      service: other.service,
      store: other.store,
      shouldStop: () => done,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        const stored = await other.store.getJob(ORG_A, eligible.id);
        if (stored && stored.status !== "queued" && stored.status !== "processing") done = true;
      },
      pollIntervalMs: 1,
      fetchPage: catalogFetch(),
      now: other.clock.now,
    });
    assert.equal(failedWrites, 3);
    assert.ok(sleeps.filter((milliseconds) => milliseconds >= 1000).length >= 2);
    assert.equal((await other.store.getJob(ORG_A, blocked.id))?.status, "processing");
    assert.notEqual((await other.store.getJob(ORG_A, blocked.id))?.status, "completed");
    assert.equal((await other.store.getJob(ORG_A, eligible.id))?.status, "completed");
  });

  it("does not treat a normal batch yield as a failed execution", async () => {
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const ids = Array.from({ length: 20 }, (_, index) => String(8100 + index));
    let stop = false;
    let polls = 0;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      shouldStop: () => stop,
      sleep: async () => {
        polls += 1;
        const jobs = await foundation.store.listJobs({ organizationId: ORG_A, monitorId: monitor.id, limit: 1 });
        if (jobs[0] && jobs[0].status !== "queued" && jobs[0].status !== "processing") stop = true;
        if (polls > 10) stop = true;
      },
      pollIntervalMs: 1,
      fetchPage: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/" || url.pathname === "") {
          return {
            ok: true,
            finalUrl: request.url,
            status: 200,
            bodyText: categoryHome([{ href: PANTS, name: "Pantalons" }]),
          };
        }
        if (request.url === PANTS) {
          return {
            ok: true,
            finalUrl: request.url,
            status: 200,
            bodyText: ids.map((id) => familyAnchor(id)).join(""),
          };
        }
        const family = url.pathname.match(/-p-(\d+)-coul-/);
        if (family?.[1]) {
          return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
        }
        return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
      },
      now: foundation.clock.now,
    });
    const job = (await foundation.store.listJobs({ organizationId: ORG_A, monitorId: monitor.id, limit: 1 }))[0];
    assert.equal(job?.status, "completed");
    assert.equal(job?.errorCode, null);
    assert.ok((job?.attemptCount ?? 0) >= 2);
    assert.equal((await foundation.store.listObservations(ORG_A, job!.id)).length, 20);
  });

  it("keeps polling through more than five claim failures and caps the backoff", async () => {
    const delays: number[] = [];
    let claims = 0;
    let stop = false;
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" "));
    };
    try {
      await runAthenaMonitorWorker({
        service: {
          async claimNextMonitorJob() {
            claims += 1;
            if (claims <= 6) throw new Error("database unavailable");
            stop = true;
            return null;
          },
        } as never,
        store: {} as never,
        shouldStop: () => stop,
        sleep: async (milliseconds: number) => {
          delays.push(milliseconds);
        },
        pollIntervalMs: 5,
        fetchPage: async () => {
          throw new Error("network");
        },
        resources: { close() {} } as never,
        closeOnStop: false,
      });
    } finally {
      console.error = original;
    }
    assert.equal(claims, 7);
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 8000, 8000]);
    assert.ok(delays.every((delay) => delay <= 8000));
    assert.equal(errors.filter((line) => line.includes("claim_unavailable")).length, 2);
    assert.equal(errors.some((line) => line.includes("database unavailable")), false);
    const worker = readFileSync("workers/athenaMonitorWorker.ts", "utf8");
    assert.equal(worker.includes("MONITOR_CLAIM_FAILURE_LIMIT"), false);
    assert.match(worker, /process\.exit\(1\)/);
  });

  it("resets claim backoff after an empty queue and runs a recovered job", async () => {
    const delays: number[] = [];
    let phase = 0;
    let stop = false;
    await runAthenaMonitorWorker({
      service: {
        async claimNextMonitorJob() {
          phase += 1;
          if (phase <= 2) throw new Error("database unavailable");
          if (phase === 3) return null;
          if (phase === 4) throw new Error("database unavailable");
          stop = true;
          return null;
        },
      } as never,
      store: {} as never,
      shouldStop: () => stop,
      sleep: async (milliseconds: number) => {
        delays.push(milliseconds);
      },
      pollIntervalMs: 5,
      fetchPage: async () => {
        throw new Error("network");
      },
      resources: { close() {} } as never,
      closeOnStop: false,
    });
    assert.deepEqual(delays, [1000, 2000, 5, 1000]);

    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock: createClock(T1) });
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ minimum: 4, selection: { mode: "categories", categoryUrls: [PANTS] } }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    let failures = 0;
    const original = foundation.service.claimNextMonitorJob.bind(foundation.service);
    foundation.service.claimNextMonitorJob = async (input) => {
      if (failures < 2) {
        failures += 1;
        throw new Error("database unavailable");
      }
      return original(input);
    };
    let finished = false;
    let polls = 0;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      shouldStop: () => finished,
      sleep: async () => {
        polls += 1;
        const jobs = await foundation.store.listJobs({ organizationId: ORG_A, monitorId: monitor.id, limit: 1 });
        if ((jobs[0] && jobs[0].status !== "queued" && jobs[0].status !== "processing") || polls > 40) finished = true;
      },
      pollIntervalMs: 1,
      fetchPage: catalogFetch(),
      now: foundation.clock.now,
    });
    assert.equal((await foundation.store.listJobs({ organizationId: ORG_A, monitorId: monitor.id, limit: 1 }))[0]?.status, "completed");
  });

  it("stops during claim backoff without another claim", async () => {
    let claims = 0;
    let stop = false;
    await runAthenaMonitorWorker({
      service: {
        async claimNextMonitorJob() {
          claims += 1;
          throw new Error("database unavailable");
        },
      } as never,
      store: {} as never,
      shouldStop: () => stop,
      sleep: async () => {
        stop = true;
      },
      pollIntervalMs: 1,
      fetchPage: async () => {
        throw new Error("network");
      },
      resources: { close() {} } as never,
      closeOnStop: false,
    });
    assert.equal(claims, 1);
  });
});

describe("force-fresh category continuity against the persistence contract", () => {
  it("refreshes categories without deleting coverage and finishes a second execution", async () => {
    const clock = createClock("2026-11-26T09:00:00.000Z");
    const memory = createMemoryMonitorStore({ now: clock.now });
    const fake = createConstraintClient();
    const remote = await createSupabaseMonitorStore(fake.client as never);
    const store: MonitorStore = {
      ...memory,
      async ensureSharedSource(source) {
        const saved = await remote.ensureSharedSource(source);
        await memory.ensureSharedSource(saved);
        return saved;
      },
      getSharedSourceByHost: (host) => remote.getSharedSourceByHost(host),
      getSharedSourceByRegisteredId: (id) => remote.getSharedSourceByRegisteredId(id),
      listSharedSources: () => remote.listSharedSources(),
      recordSourceDiscovery: (input) => remote.recordSourceDiscovery(input),
      recordTechnicalAccess: (input) => remote.recordTechnicalAccess(input),
      refreshSharedCategories: (input) => remote.refreshSharedCategories(input),
      listSharedCategories: (id) => remote.listSharedCategories(id),
      readSharedDiscoverySnapshot: (id) => remote.readSharedDiscoverySnapshot(id),
      saveDiscoveryCoverage: (coverage) => remote.saveDiscoveryCoverage(coverage),
      listDiscoveryCoverage: (id) => remote.listDiscoveryCoverage(id),
    };
    const service = createMonitorService({
      store,
      now: clock.now,
      resolvePlan: async () => "full" as const,
      requireOrganizationContext: async () => ({ organizationId: ORG_A, userId: USER_A }),
    });
    let homes = 0;
    const urls: string[] = [];
    const fetchPage: MonitorPageFetch = async (request) => {
      urls.push(request.url);
      const parsed = new URL(request.url);
      if (parsed.pathname === "/") {
        homes += 1;
        const links =
          homes === 1
            ? [
                { href: CHEM, name: "Chemisiers & Tuniques" },
                { href: PANTS, name: "Pantalons" },
                { href: ROBES, name: "Robes" },
              ]
            : [
                { href: CHEM, name: "Chemisiers & Tuniques" },
                { href: PANTS, name: "Pantalons femme" },
              ];
        return { ok: true, finalUrl: request.url, status: 200, bodyText: categoryHome(links) };
      }
      if (request.url === CHEM) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: familyAnchor("901") };
      }
      if (request.url === PANTS) {
        return {
          ok: true,
          finalUrl: request.url,
          status: 200,
          bodyText: `${familyAnchor("902")}<a href="${pantsPage(1)}">1</a><a href="${pantsPage(2)}">2</a>`,
        };
      }
      if (request.url === pantsPage(2)) {
        return {
          ok: true,
          finalUrl: request.url,
          status: 200,
          bodyText: `${familyAnchor("903")}<a href="${pantsPage(1)}">1</a><a href="${pantsPage(2)}">2</a>`,
        };
      }
      const family = parsed.pathname.match(/-p-(\d+)-coul-/);
      if (family?.[1]) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
      }
      return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
    };
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Historical search",
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [CHEM, PANTS] },
      }),
    });
    const configuration = (await store.getMonitor(ORG_A, monitor.id))?.configuration;
    await service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const first = await claimAndRun({ service, store, fetchPage, now: clock.now });
    assert.equal(first.outcome, "completed");
    const sharedId = await sourceId(store);
    const categories = await store.listSharedCategories(sharedId);
    const pants = categories.find((item) => item.categoryKey === PANTS_KEY);
    const chem = categories.find((item) => item.categoryKey === CHEM_KEY);
    const robes = categories.find((item) => item.categoryKey === ROBES_KEY);
    assert.ok(pants && chem && robes);
    const historicalCoverage = await store.listDiscoveryCoverage(sharedId);
    assert.ok(historicalCoverage.length >= 2);
    const historicalObservations = await store.listObservations(ORG_A, first.job.id);
    assert.ok(historicalObservations.length >= 3);
    const historicalPublicIds = historicalObservations.map((item) => item.publicObservationId);

    clock.advance(1000);
    const replacement = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Force fresh search",
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [CHEM, PANTS] },
      }),
    });
    await service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: replacement.id,
      forceFresh: true,
    });
    const second = await claimAndRun({ service, store, fetchPage, now: clock.now, forceFresh: true });
    assert.equal(second.outcome, "completed");
    assert.equal(fake.deletes(), 0);
    const refreshed = await store.listSharedCategories(sharedId);
    assert.equal(refreshed.find((item) => item.categoryKey === PANTS_KEY)?.id, pants.id);
    assert.equal(refreshed.find((item) => item.categoryKey === CHEM_KEY)?.id, chem.id);
    assert.equal(refreshed.find((item) => item.categoryKey === ROBES_KEY)?.id, robes.id);
    assert.equal(refreshed.find((item) => item.categoryKey === PANTS_KEY)?.displayName, "Pantalons femme");
    assert.equal(refreshed.find((item) => item.categoryKey === ROBES_KEY)?.discoveryStatus, "current");
    const coverageAfter = await store.listDiscoveryCoverage(sharedId);
    for (const historical of historicalCoverage) {
      const preserved = coverageAfter.find((item) => item.id === historical.id);
      assert.ok(preserved);
      assert.equal(preserved?.categoryId, historical.categoryId);
      assert.deepEqual(preserved?.familyIds, historical.familyIds);
    }
    assert.ok(coverageAfter.length > historicalCoverage.length);
    const firstAfter = await store.getJob(ORG_A, first.job.id);
    assert.equal(firstAfter?.status, "completed");
    const firstObservations = await store.listObservations(ORG_A, first.job.id);
    assert.deepEqual(
      firstObservations.map((item) => item.id),
      historicalObservations.map((item) => item.id),
    );
    assert.deepEqual(
      firstObservations.map((item) => item.publicObservationId),
      historicalPublicIds,
    );
    const secondObservations = await store.listObservations(ORG_A, second.job.id);
    assert.ok(secondObservations.length >= 3);
    assert.equal(second.job.id === first.job.id, false);
    assert.equal(urls.filter((url) => url === pantsPage(2)).length >= 2, true);
    assert.ok(urls.some((url) => url.includes("-p-901-")));
    assert.equal((await store.getMonitor(ORG_A, monitor.id))?.configuration.name, configuration?.name);
    assert.equal(JSON.stringify(configuration), JSON.stringify((await store.getMonitor(ORG_A, monitor.id))?.configuration));
  });
});

function catalogFetch(): MonitorPageFetch {
  return async (request) => {
    const parsed = new URL(request.url);
    if (parsed.pathname === "/") {
      return {
        ok: true,
        finalUrl: request.url,
        status: 200,
        bodyText: categoryHome([{ href: PANTS, name: "Pantalons" }]),
      };
    }
    if (request.url === PANTS) {
      return { ok: true, finalUrl: request.url, status: 200, bodyText: familyAnchor("901") };
    }
    const family = parsed.pathname.match(/-p-(\d+)-coul-/);
    if (family?.[1]) {
      return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
    }
    return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
  };
}

async function claimAndRun(input: {
  service: ReturnType<typeof createMonitorService>;
  store: MonitorStore;
  fetchPage: MonitorPageFetch;
  now: () => Date;
  forceFresh?: boolean;
}): Promise<{ job: MonitorJob; outcome: string }> {
  let claimed = await input.service.claimNextMonitorJob();
  assert.ok(claimed);
  let outcome: string = claimed.disposition;
  let job = claimed.job;
  if (claimed.disposition !== "claimed") return { job, outcome };
  for (let pass = 0; pass < 6; pass += 1) {
    const result = await executeMonitorJob({
      service: input.service,
      store: input.store,
      job,
      fetchPage: input.fetchPage,
      now: input.now,
      forceFresh: input.forceFresh === true || job.progress.forceFresh === true,
    });
    job = result.job;
    outcome = result.outcome;
    if (result.outcome !== "yielded") break;
    claimed = await input.service.claimNextMonitorJob();
    if (!claimed || claimed.job.id !== job.id) break;
    job = claimed.job;
  }
  return { job, outcome };
}
