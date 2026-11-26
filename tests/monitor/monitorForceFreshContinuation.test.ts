/**
 * Force-fresh discovery must continue across batch yields.
 * The fixture is an in-memory catalog. It does not call a retailer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MonitorPageFetch } from "../../services/monitor/monitorAdapter";
import { executeMonitorJob } from "../../services/monitor/monitorEngine";
import {
  classifyDiscoveryContinuation,
  monitorExecutionFreshnessCutoff,
} from "../../services/monitor/monitorExecution";
import { buildSharedPublicObservation } from "../../services/monitor/monitorObservation";
import { latestCoverageForScope } from "../../services/monitor/monitorReuse";
import { ATHENA_MONITOR_WORKER_DEFAULTS } from "../../services/monitor/monitorRuntime";
import { categoryKeyFromUrl } from "../../services/monitor/monitorWebsiteIdentity";
import { ORG_A, createClock, createFoundation, toscaneConfiguration } from "./helpers";

const CHEM = "https://www.toscane-boutique.fr/fr/chemisiers-tuniques-c-15.htm";
const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const CHEM_PAGE_2 = "https://www.toscane-boutique.fr/fr/chemisiers-tuniques-c-15-page-2.htm";
const CHEM_KEY = categoryKeyFromUrl(CHEM);
const PANTS_KEY = categoryKeyFromUrl(PANTS);
const CHEM_PAGE_1 = Array.from({ length: 25 }, (_, index) => String(1001 + index));
const CHEM_PAGE_2_IDS = Array.from({ length: 20 }, (_, index) => String(1026 + index));
const PANTS_IDS = Array.from({ length: 21 }, (_, index) => String(2001 + index));
const INVENTORY = [...CHEM_PAGE_1, ...CHEM_PAGE_2_IDS, ...PANTS_IDS];
const HISTORICAL_OBSERVATION_ID = "44444444-4444-4444-8444-444444444444";

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

function homeHtml(): string {
  return `<nav><ul>
    <li><a href="${CHEM}">Chemisiers</a></li>
    <li><a href="${PANTS}">Pantalons</a></li>
  </ul></nav>`;
}

function familySetKey(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

describe("force-fresh batch continuation", () => {
  it("classifies same-page continuation, forward pagination, and repeated no-progress", () => {
    const page = CHEM;
    const next = CHEM_PAGE_2;
    const first = CHEM_PAGE_1.slice(0, 20);
    const rest = CHEM_PAGE_1.slice(20);
    assert.equal(
      classifyDiscoveryContinuation({
        accumulatedFamilyIds: first,
        returnedFamilyIds: rest,
        previousResumeUrl: page,
        nextResumeUrl: page,
        done: false,
      }),
      "same_page",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        accumulatedFamilyIds: CHEM_PAGE_1,
        returnedFamilyIds: CHEM_PAGE_2_IDS,
        previousResumeUrl: page,
        nextResumeUrl: next,
        done: false,
      }),
      "forward",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        accumulatedFamilyIds: first,
        returnedFamilyIds: first,
        previousResumeUrl: page,
        nextResumeUrl: page,
        done: false,
      }),
      "no_progress",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        accumulatedFamilyIds: first,
        returnedFamilyIds: [],
        previousResumeUrl: page,
        nextResumeUrl: null,
        done: true,
      }),
      "complete",
    );
    assert.equal(
      classifyDiscoveryContinuation({
        accumulatedFamilyIds: first,
        returnedFamilyIds: first,
        previousResumeUrl: page,
        nextResumeUrl: page,
        done: false,
        errorCode: "PAGINATION_LOOP",
      }),
      "forward",
    );
  });

  it("continues a force-fresh catalog across claims, pages, and extraction batches", async () => {
    assert.equal(ATHENA_MONITOR_WORKER_DEFAULTS.batchSize, 20);
    assert.ok(INVENTORY.length > 40);
    assert.ok(CHEM_PAGE_1.length > 20);
    const clock = createClock("2026-11-26T08:00:00.000Z");
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const historicalAt = clock.now().toISOString();
    const published = await foundation.service.recordSharedCategoryDiscovery({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      discoveredAt: historicalAt,
      authoritativeTaxonomy: false,
      categories: [
        {
          categoryKey: CHEM_KEY,
          displayName: "Chemisiers",
          canonicalUrl: CHEM,
          parentCategoryKey: null,
          discoveredAt: historicalAt,
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
        {
          categoryKey: PANTS_KEY,
          displayName: "Pantalons",
          canonicalUrl: PANTS,
          parentCategoryKey: null,
          discoveredAt: historicalAt,
          discoveryStatus: "current",
          productFamilyCount: null,
          productFamilyCountBasis: null,
        },
      ],
    });
    const chem = published.categories.find((category) => category.categoryKey === CHEM_KEY);
    const pants = published.categories.find((category) => category.categoryKey === PANTS_KEY);
    assert.ok(chem && pants);
    const historicalChem = await foundation.service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      coverage: {
        scopeKind: "category",
        categoryId: chem.id,
        scopeKey: CHEM_KEY,
        status: "partial",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt: historicalAt,
        familyIds: CHEM_PAGE_1.slice(0, 20),
        familyCount: 20,
      },
    });
    const historicalPants = await foundation.service.recordSharedDiscoveryCoverage({
      organizationId: ORG_A,
      websiteUrl: "https://www.toscane-boutique.fr/",
      coverage: {
        scopeKind: "category",
        categoryId: pants.id,
        scopeKey: PANTS_KEY,
        status: "completed",
        adapterId: "solusquare",
        adapterVersion: "2",
        schemaVersion: 1,
        discoveredAt: historicalAt,
        familyIds: ["9"],
        familyCount: 1,
      },
    });
    const source = await foundation.store.getSharedSourceByHost("toscane-boutique.fr");
    assert.ok(source);
    await foundation.store.savePublicObservation(
      buildSharedPublicObservation({
        id: HISTORICAL_OBSERVATION_ID,
        source,
        familyId: "1001",
        canonicalUrl: productUrl("1001"),
        payload: {
          version: 1,
          productName: "Historical blouse",
          category: "Chemisiers",
          price: { amount: "10.00", currency: "EUR" },
          colorPatternIds: ["c1", "c2", "c3", "c4"],
          colorPatternNames: ["Noir", "Camel", "Marine", "Anthracite"],
          distinctVariationCount: 4,
          sizes: ["36"],
          lengths: ["32"],
          imageUrl: "https://cdn.toscane-boutique.fr/products_images/prod_1001/front.jpg",
          thresholdMatch: true,
        },
        observedAt: historicalAt,
        categoryIds: [CHEM_KEY],
        createdAt: historicalAt,
      }),
    );

    clock.advance(2 * 60 * 60 * 1000);
    const urls: string[] = [];
    const fetchPage: MonitorPageFetch = async (request) => {
      urls.push(request.url);
      clock.advance(1000);
      const pathname = new URL(request.url).pathname;
      if (pathname === "/" || pathname === "") {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: homeHtml() };
      }
      if (request.url === CHEM) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: listing(CHEM_PAGE_1, CHEM_PAGE_2) };
      }
      if (request.url === CHEM_PAGE_2) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: listing(CHEM_PAGE_2_IDS) };
      }
      if (request.url === PANTS) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: listing(PANTS_IDS) };
      }
      const family = pathname.match(/-p-(\d+)-coul-/);
      if (family?.[1]) {
        return { ok: true, finalUrl: request.url, status: 200, bodyText: productHtml(family[1]) };
      }
      return { ok: false, finalUrl: request.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
    };

    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Force fresh continuation",
        minimum: 4,
        selection: { mode: "categories", categoryUrls: [CHEM, PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: monitor.id,
      forceFresh: true,
    });

    let claimed = await foundation.service.claimNextMonitorJob();
    assert.ok(claimed && claimed.disposition === "claimed");
    let job = claimed.job;
    const cutoff = monitorExecutionFreshnessCutoff(job, true);
    assert.equal(cutoff, job.startedAt);
    assert.ok(cutoff);
    assert.ok(Date.parse(historicalAt) < Date.parse(cutoff));
    const discoveredSets: string[][] = [];
    const analyzedCounts: number[] = [];
    let sawExtract = false;
    let outcome = "yielded";
    for (let pass = 0; pass < 24 && outcome === "yielded"; pass += 1) {
      const before = Date.parse(clock.now().toISOString());
      const result = await executeMonitorJob({
        service: foundation.service,
        store: foundation.store,
        job,
        fetchPage,
        now: clock.now,
        forceFresh: true,
      });
      job = result.job;
      outcome = result.outcome;
      assert.equal(monitorExecutionFreshnessCutoff(job, true), cutoff);
      assert.ok(Date.parse(clock.now().toISOString()) > before);
      const cursor = job.executionCursor.sources.find((source) => source.sourceId === "toscane");
      assert.ok(cursor);
      if (job.progress.phase === "discover" || discoveredSets.length === 0) {
        discoveredSets.push(Object.keys(cursor.familyUrls ?? {}));
      }
      if (job.progress.phase === "extract") {
        sawExtract = true;
        analyzedCounts.push(job.progress.familiesAnalyzed);
      }
      if (outcome !== "yielded") break;
      clock.advance(1000);
      claimed = await foundation.service.claimNextMonitorJob();
      assert.equal(claimed?.job.id, job.id);
      job = claimed!.job;
      assert.equal(job.startedAt, cutoff);
      const reclaimed = job.executionCursor.sources.find((source) => source.sourceId === "toscane");
      const previous = discoveredSets[discoveredSets.length - 1] ?? [];
      for (const familyId of previous) {
        assert.equal(reclaimed?.familyUrls?.[familyId] != null, true);
      }
    }

    assert.equal(outcome, "completed");
    assert.equal(job.status, "completed");
    assert.equal(sawExtract, true);
    assert.deepEqual(discoveredSets[0]?.sort(), CHEM_PAGE_1.slice(0, 20).sort());
    assert.ok(discoveredSets.some((ids, index) => index > 0 && ids.length > discoveredSets[0]!.length));
    for (let index = 1; index < discoveredSets.length; index += 1) {
      const previous = new Set(discoveredSets[index - 1]);
      for (const familyId of previous) assert.equal(discoveredSets[index]?.includes(familyId), true);
    }
    assert.ok(analyzedCounts.length >= 2);
    for (let index = 1; index < analyzedCounts.length; index += 1) {
      assert.ok(analyzedCounts[index]! > analyzedCounts[index - 1]!);
    }
    assert.equal(urls.filter((url) => url === CHEM).length >= 2, true);
    assert.equal(urls.filter((url) => url === CHEM).length < 8, true);
    assert.equal(urls.includes(CHEM_PAGE_2), true);
    assert.equal(urls.includes(PANTS), true);
    assert.equal(urls.filter((url) => url.includes("-p-1001-")).length, 1);
    const productFetches = urls.filter((url) => /-p-\d+-coul-/.test(url));
    assert.equal(productFetches.length, INVENTORY.length);
    assert.equal(new Set(productFetches).size, INVENTORY.length);

    const saved = await foundation.store.getJob(ORG_A, job.id);
    assert.ok(saved);
    assert.equal(saved.status, "completed");
    assert.equal(saved.progress.familiesDiscovered, INVENTORY.length);
    assert.equal(saved.progress.familiesAnalyzed, INVENTORY.length);
    assert.equal(saved.progress.familiesReused, 0);
    assert.equal(saved.sourceCoverage[0]?.familiesDiscovered, INVENTORY.length);
    assert.equal(saved.sourceCoverage[0]?.familiesAnalyzed, INVENTORY.length);
    assert.equal(saved.sourceCoverage[0]?.discoveryStatus, "completed");
    const observations = await foundation.store.listObservations(ORG_A, job.id);
    assert.equal(observations.length, INVENTORY.length);
    assert.deepEqual(observations.map((observation) => observation.familyId).sort(), [...INVENTORY].sort());
    assert.equal(observations.every((observation) => observation.reused === false), true);
    assert.equal(
      observations.some((observation) => observation.publicObservationId === HISTORICAL_OBSERVATION_ID),
      false,
    );

    const coverage = await foundation.store.listDiscoveryCoverage(source.id);
    const preservedChem = coverage.find((row) => row.id === historicalChem.id);
    const preservedPants = coverage.find((row) => row.id === historicalPants.id);
    assert.equal(preservedChem?.status, "partial");
    assert.deepEqual(preservedChem?.familyIds, CHEM_PAGE_1.slice(0, 20));
    assert.equal(preservedPants?.status, "completed");
    assert.deepEqual(preservedPants?.familyIds, ["9"]);
    const currentChem = latestCoverageForScope(coverage, CHEM_KEY);
    const currentPants = latestCoverageForScope(coverage, PANTS_KEY);
    assert.equal(currentChem?.status, "completed");
    assert.equal(currentChem?.familyCount, CHEM_PAGE_1.length + CHEM_PAGE_2_IDS.length);
    assert.equal(currentPants?.status, "completed");
    assert.equal(currentPants?.familyCount, PANTS_IDS.length);
    assert.ok(currentChem && Date.parse(currentChem.discoveredAt) >= Date.parse(cutoff));
    assert.ok(currentPants && Date.parse(currentPants.discoveredAt) >= Date.parse(cutoff));
    assert.equal(saved.sourceCoverage[0]?.discoveryCoverageId === historicalChem.id, false);
    assert.equal(saved.sourceCoverage[0]?.discoveryCoverageId === historicalPants.id, false);
    const counts = new Map<string, number>();
    for (const row of coverage) {
      const key = `${row.scopeKey}|${row.status}|${familySetKey(row.familyIds)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const count of counts.values()) assert.ok(count <= 2);
    assert.ok(coverage.length < 20);
    assert.ok(saved.attemptCount < 30);
  });
});
