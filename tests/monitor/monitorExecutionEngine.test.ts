/**
 * Gate 3C dedicated Monitor worker execution.
 * Uses the in-memory store and injected HTTP fixtures. No Supabase and no live catalog.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseMonitorConfiguration } from "../../services/monitor/monitorConfig";
import { executeMonitorJob } from "../../services/monitor/monitorEngine";
import { monitorReportedCompletion } from "../../services/monitor/monitorExecution";
import { createMonitorResources } from "../../services/monitor/monitorHttp";
import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import { productionAdapterFor } from "../../services/monitor/monitorRegistry";
import { ATHENA_MONITOR_FRESHNESS, ATHENA_MONITOR_WORKER_DEFAULTS } from "../../services/monitor/monitorRuntime";
import { discoverSolusquareCategories } from "../../services/monitor/solusquareAdapter";
import { sfraProductionAdapter } from "../../services/monitor/sfraAdapter";
import type { MonitorPageFetch } from "../../services/monitor/monitorAdapter";
import type { MonitorJob } from "../../services/monitor/monitorTypes";
import { runAthenaMonitorWorker, bindMonitorWorkerSignals } from "../../workers/athenaMonitorWorker";
import {
  ORG_A,
  ORG_B,
  createClock,
  createFoundation,
  toscaneConfiguration,
} from "./helpers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const ROBES = "https://www.toscane-boutique.fr/fr/robes-c-7.htm";
const FEMME = "https://www.toscane-boutique.fr/fr/femme-c-1.htm";
const UNKNOWN = "https://www.toscane-boutique.fr/fr/inconnu-c-404.htm";

function homeHtml(): string {
  return `<nav><ul>
    <li>
      <a href="${FEMME}">Femme</a>
      <ul>
        <li><a href="${PANTS}">Pantalons</a></li>
        <li><a href="${ROBES}">Robes</a></li>
      </ul>
    </li>
    <li><a href="https://www.toscane-boutique.fr/fr/carte-cadeau-c-90.htm">Carte cadeau</a></li>
    <li><a href="https://www.toscane-boutique.fr/mon-compte">Mon compte</a></li>
  </ul></nav>`;
}

function listingHtml(ids: readonly string[], next?: string): string {
  const links = ids
    .map((id) => `<a href="https://www.toscane-boutique.fr/fr/pantalons/modele-p-${id}-coul-1.htm">Modele ${id}</a>`)
    .join("");
  const rel = next ? `<a rel="next" href="${next}">Suivant</a>` : "";
  return `<html><body>${links}${rel}</body></html>`;
}

function productHtml(id: string, colors: readonly string[]): string {
  const swatches = colors
    .map(
      (name, index) =>
        `<li id="p${id}-${index + 1}" data-params="{ colorLbl: '${name}', colorID: '${index + 1}' }"></li>`,
    )
    .join("");
  return `<html><head>
    <link rel="canonical" href="https://www.toscane-boutique.fr/fr/pantalons/modele-p-${id}-coul-1.htm" />
    <meta property="og:image" content="https://cdn.toscane-boutique.fr/products_images/prod_${id}/front.jpg" />
    <meta property="product:brand" content="Toscane" />
    <script type="application/ld+json">{"@type":"Product","name":"Modele ${id}","offers":{"@type":"Offer","price":"49.00","priceCurrency":"EUR"}}</script>
  </head><body>
    <div data-params="{ prodID: ${id} }" data-gtm_item_name="Modele ${id}"></div>
    <ul>${swatches}<li data-cid="1">36</li><li data-cid="1">Longueur 32</li></ul>
  </body></html>`;
}

function sitemapXml(ids: readonly string[]): string {
  const locs = ids
    .map((id) => `<url><loc>https://www.toscane-boutique.fr/fr/pantalons/modele-p-${id}-coul-1.htm</loc></url>`)
    .join("");
  return `<?xml version="1.0"?><urlset>${locs}</urlset>`;
}

type Catalog = {
  pants: string[];
  robes: string[];
  colors?: string[];
  failProducts?: boolean;
};

function createFixtureFetch(catalog: Catalog, clock?: { advance(ms: number): void }): {
  fetchPage: MonitorPageFetch;
  urls: string[];
} {
  const urls: string[] = [];
  const colors = catalog.colors ?? ["Noir", "Camel", "Marine", "Anthracite"];
  const fetchPage: MonitorPageFetch = async (input) => {
    if (input.signal?.aborted) {
      return { ok: false, finalUrl: input.url, status: 0, bodyText: null, errorCode: "ABORTED" };
    }
    urls.push(input.url);
    clock?.advance(1000);
    const parsed = new URL(input.url);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      return { ok: true, finalUrl: input.url, status: 200, bodyText: homeHtml() };
    }
    if (parsed.pathname.endsWith("/pantalons-c-42.htm")) {
      return { ok: true, finalUrl: input.url, status: 200, bodyText: listingHtml(catalog.pants) };
    }
    if (parsed.pathname.endsWith("/robes-c-7.htm")) {
      return { ok: true, finalUrl: input.url, status: 200, bodyText: listingHtml(catalog.robes) };
    }
    if (parsed.pathname.endsWith("/sitemap.xml")) {
      return { ok: true, finalUrl: input.url, status: 200, bodyText: sitemapXml([...catalog.pants, ...catalog.robes]) };
    }
    const family = parsed.pathname.match(/-p-(\d+)-coul-/);
    if (family?.[1]) {
      if (catalog.failProducts) {
        return { ok: false, finalUrl: input.url, status: 500, bodyText: null, errorCode: "HTTP_500" };
      }
      return { ok: true, finalUrl: input.url, status: 200, bodyText: productHtml(family[1], colors) };
    }
    return { ok: false, finalUrl: input.url, status: 404, bodyText: null, errorCode: "HTTP_404" };
  };
  return { fetchPage, urls };
}

async function claimAndRun(input: {
  service: ReturnType<typeof createFoundation>["service"];
  store: ReturnType<typeof createFoundation>["store"];
  fetchPage: MonitorPageFetch;
  now: () => Date;
  forceFresh?: boolean;
  shouldStop?: () => boolean;
  resources?: ReturnType<typeof createMonitorResources>;
  maxPasses?: number;
}): Promise<{ job: MonitorJob; outcome: string }> {
  let claimed = await input.service.claimNextMonitorJob();
  assert.ok(claimed);
  let outcome: string = claimed.disposition;
  let job = claimed.job;
  if (claimed.disposition !== "claimed") return { job, outcome };
  for (let pass = 0; pass < (input.maxPasses ?? 6); pass += 1) {
    const result = await executeMonitorJob({
      service: input.service,
      store: input.store,
      job,
      fetchPage: input.fetchPage,
      now: input.now,
      forceFresh: input.forceFresh,
      shouldStop: input.shouldStop,
      resources: input.resources,
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

describe("production adapters", () => {
  it("discovers published category names, nested parents, and skips gift cards", () => {
    const categories = discoverSolusquareCategories(homeHtml(), "https://www.toscane-boutique.fr/");
    const pants = categories.find((category) => category.displayName === "Pantalons");
    assert.equal(pants?.canonicalUrl, PANTS);
    assert.equal(pants?.parentCategoryKey, "fr/femme-c-1.htm");
    assert.equal(categories.some((category) => /cadeau/i.test(category.displayName)), false);
    assert.equal(categories.some((category) => category.displayName === "Mon compte"), false);
  });

  it("keeps SFRA sources registered and explicitly access_blocked", async () => {
    assert.equal(productionAdapterFor("breal")?.id, "sfra");
    assert.equal(productionAdapterFor("bonobo")?.id, "sfra");
    assert.equal(productionAdapterFor("cache-cache")?.id, "sfra");
    assert.equal(productionAdapterFor("toscane")?.id, "solusquare");
    const blocked = await sfraProductionAdapter.extractFamily({
      familyId: "1",
      productUrl: "https://www.breal.net/jean.html",
      registrableDomain: "breal.net",
      fetchPage: async () => {
        throw new Error("SFRA fetch must not run");
      },
      timeoutMs: 1000,
      observedAt: "2026-11-24T12:00:00.000Z",
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "access_blocked");
  });

  it("rejects an empty category selection instead of treating it as the whole catalog", () => {
    assert.throws(
      () =>
        parseMonitorConfiguration(
          toscaneConfiguration({
            selection: { mode: "categories", categoryUrls: [] },
          }),
        ),
      /category/i,
    );
  });
});

describe("dedicated monitor execution", () => {
  it("discovers categories, deduplicates overlapping families, and keeps whole-catalog explicit", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100", "200"], robes: ["100", "300"] }, clock);
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS, ROBES] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const finished = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(finished.outcome, "completed");
    assert.equal(fixture.urls.some((url) => url.includes("sitemap")), false);
    const rows = await foundation.store.listObservations(ORG_A, finished.job.id);
    assert.deepEqual(rows.map((row) => row.familyId).sort(), ["100", "200", "300"]);
    const shared = rows.find((row) => row.familyId === "100");
    assert.deepEqual(shared?.categoryIds, ["fr/pantalons-c-42.htm", "fr/robes-c-7.htm"]);
    assert.equal(fixture.urls.filter((url) => url.includes("-p-100-")).length, 1);
    assert.equal(shared?.payload.lengths?.[0], "Longueur 32");
    assert.deepEqual(shared?.payload.sizes, ["36"]);
    assert.equal(shared?.payload.price.amount, "49.00");
    assert.equal(shared?.payload.price.currency, "EUR");
    assert.equal(shared?.payload.distinctVariationCount, 4);
    assert.match(shared?.payload.imageUrl ?? "", /^https:\/\//);
    const categories = await foundation.service.listDiscoveredCategories(ORG_A, "https://www.toscane-boutique.fr/");
    assert.equal(categories.categories.some((category) => category.displayName === "Pantalons"), true);
    assert.equal(categories.categories.some((category) => /cadeau/i.test(category.displayName)), false);
    const report = monitorReportedCompletion({
      progress: finished.job.progress,
      sourceCoverage: finished.job.sourceCoverage,
    });
    assert.equal(report.ratio, 1);
    assert.equal(report.discoveryComplete, true);
    assert.equal(report.extractionComplete, true);
  });

  it("enumerates an explicit whole catalog from the sitemap", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: ["200"] }, clock);
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({ selection: { mode: "whole_catalog" } }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const finished = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(finished.outcome, "completed");
    assert.equal(fixture.urls.some((url) => url.endsWith("/sitemap.xml")), true);
    assert.equal(finished.job.sourceCoverage[0]?.discoveryScopeKey, "whole_catalog");
    const rows = await foundation.store.listObservations(ORG_A, finished.job.id);
    assert.deepEqual(rows.map((row) => row.familyId).sort(), ["100", "200"]);
  });

  it("reuses fresh categories, coverage, and public observations, and refetches when they are stale or forced", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: [] }, clock);
    const firstMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        minimum: 3,
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: firstMonitor.id });
    const first = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(first.outcome, "completed");
    const fetchesAfterFirst = fixture.urls.length;
    const secondMonitor = await foundation.service.createMonitor({
      organizationId: ORG_B,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Other threshold",
        minimum: 5,
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_B, monitorId: secondMonitor.id });
    const second = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(second.outcome, "completed");
    assert.equal(fixture.urls.length, fetchesAfterFirst);
    const orgA = await foundation.store.listObservations(ORG_A, first.job.id);
    const orgB = await foundation.store.listObservations(ORG_B, second.job.id);
    assert.equal(orgA[0]?.thresholdMatch, true);
    assert.equal(orgB[0]?.thresholdMatch, false);
    assert.equal(orgA[0]?.publicObservationId, orgB[0]?.publicObservationId);
    assert.equal(orgB[0]?.reused, true);
    assert.equal((await foundation.store.listObservations(ORG_A, second.job.id)).length, 0);
    const shared = await foundation.store.getSharedSourceByHost("toscane-boutique.fr");
    const publicRows = await foundation.store.listPublicObservations(shared!.id);
    assert.equal(publicRows.length, 1);
    assert.equal(JSON.stringify(publicRows).includes(ORG_A), false);
    assert.equal(JSON.stringify(publicRows).includes(ORG_B), false);
    const beforeForce = fixture.urls.length;
    const beforeRefilter = fixture.urls.length;
    const refiltered = await foundation.service.refilterMonitorJob({
      organizationId: ORG_A,
      jobId: first.job.id,
      minimum: 5,
    });
    assert.equal(refiltered.networkRequests, 0);
    assert.equal(fixture.urls.length, beforeRefilter);
    assert.equal(orgA[0]?.payload.price.amount, "49.00");

    clock.advance(60 * 60 * 1000);
    const forcedMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Forced",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: forcedMonitor.id });
    const forced = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
      forceFresh: true,
    });
    assert.equal(forced.outcome, "completed");
    assert.equal(fixture.urls.slice(beforeForce).some((url) => url.includes("-p-100-")), true);
    assert.equal((await foundation.store.listObservations(ORG_A, first.job.id))[0]?.payload.price.amount, "49.00");

    clock.advance(ATHENA_MONITOR_FRESHNESS.productObservationMs + 1000);
    const staleMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Stale",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    const beforeStale = fixture.urls.length;
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: staleMonitor.id });
    const stale = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(stale.outcome, "completed");
    assert.ok(fixture.urls.length > beforeStale);
  });

  it("yields large catalogs fairly and preserves a partial run against the previous baseline", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const pants = Array.from({ length: 21 }, (_, index) => String(1000 + index));
    const fixture = createFixtureFetch({ pants, robes: ["7"] }, clock);
    const large = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Large",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    const small = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Small",
        selection: { mode: "categories", categoryUrls: [ROBES] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: large.id });
    clock.advance(1);
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: small.id });
    const first = await foundation.service.claimNextMonitorJob();
    assert.equal(first?.job.monitorId, large.id);
    const yielded = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: first!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(yielded.outcome, "yielded");
    assert.equal(yielded.job.status, "processing");
    assert.equal(yielded.job.progress.phase, "discover");
    assert.equal(yielded.job.progress.familiesDiscovered, 20);
    assert.equal(yielded.job.progress.familiesAnalyzed, 0);
    assert.ok(monitorReportedCompletion({ progress: yielded.job.progress, sourceCoverage: yielded.job.sourceCoverage }).ratio < 1);
    const second = await foundation.service.claimNextMonitorJob();
    assert.equal(second?.job.monitorId, small.id);
    const smallDone = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: second!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(smallDone.outcome, "completed");
    const resumed = await foundation.service.claimNextMonitorJob();
    assert.equal(resumed?.job.monitorId, large.id);
    let job = resumed!.job;
    let outcome = "yielded";
    for (let pass = 0; pass < 6 && outcome === "yielded"; pass += 1) {
      const result = await executeMonitorJob({
        service: foundation.service,
        store: foundation.store,
        job,
        fetchPage: fixture.fetchPage,
        now: clock.now,
      });
      job = result.job;
      outcome = result.outcome;
      if (outcome === "yielded") {
        const again = await foundation.service.claimNextMonitorJob();
        assert.equal(again?.job.id, job.id);
        job = again!.job;
      }
    }
    assert.equal(outcome, "completed");
    assert.equal((await foundation.store.listObservations(ORG_A, job.id)).length, 21);
    assert.equal(fixture.urls.filter((url) => /-p-10\d\d-/.test(url)).length, 21);
    const saved = await foundation.store.getMonitor(ORG_A, large.id);
    assert.equal(saved?.lastSuccessfulJobId, job.id);
  });

  it("keeps the previous successful baseline when a later extraction is partial", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const catalog = { pants: ["100"], robes: [] as string[], failProducts: false };
    const fixture = createFixtureFetch(catalog, clock);
    const baselineMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: baselineMonitor.id });
    const baseline = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(baseline.outcome, "completed");
    clock.advance(60 * 60 * 1000);
    catalog.failProducts = true;
    const retryMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Retry",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: retryMonitor.id });
    const partial = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
      forceFresh: true,
    });
    assert.equal(partial.outcome, "partial");
    assert.equal(partial.job.sourceCoverage[0]?.failedFamilyIds?.includes("100"), true);
    assert.equal((await foundation.store.getMonitor(ORG_A, baselineMonitor.id))?.lastSuccessfulJobId, baseline.job.id);
    const comparison = await foundation.service.compareMonitorJobs({
      organizationId: ORG_A,
      baselineJobId: baseline.job.id,
      currentJobId: partial.job.id,
    });
    assert.equal(comparison.sources[0]?.comparable, false);
    assert.deepEqual(comparison.sources[0]?.notFound, []);
  });

  it("fails closed for an unknown category and leaves blocked SFRA sources blocked", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: [] }, clock);
    const unknown = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [UNKNOWN] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: unknown.id });
    const failed = await claimAndRun({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.job.sourceCoverage[0]?.errorCode, "UNKNOWN_CATEGORY");
    assert.equal(fixture.urls.some((url) => url.includes("-p-")), false);
    assert.equal(fixture.urls.some((url) => url.includes("sitemap")), false);

    const breal = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: {
        ...toscaneConfiguration(),
        name: "Breal only",
        sources: [
          {
            sourceId: "breal",
            websiteUrl: "https://www.breal.net/",
            selection: { mode: "categories", categoryUrls: ["https://www.breal.net/jeans-femme-sc_010300"] },
          },
        ],
      },
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: breal.id });
    const blocked = await foundation.service.claimNextMonitorJob();
    assert.equal(blocked?.disposition, "blocked");
    assert.equal(blocked?.job.status, "blocked");
    assert.equal(blocked?.job.sourceCoverage[0]?.errorCode, "PRODUCTION_ACCESS_BLOCKED");
    assert.equal(fixture.urls.some((url) => url.includes("breal")), false);
  });

  it("interrupts safely, rejects a stale claim, cancels terminally, and stops on entitlement downgrade", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100", "200"], robes: [] }, clock);
    let stop = false;
    const resources = createMonitorResources();
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const claimed = await foundation.service.claimNextMonitorJob();
    const originalFetch = fixture.fetchPage;
    const stoppingFetch: MonitorPageFetch = async (request) => {
      const result = await originalFetch(request);
      if (request.url.includes("-p-")) stop = true;
      return result;
    };
    const interrupted = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: claimed!.job,
      fetchPage: stoppingFetch,
      now: clock.now,
      shouldStop: () => stop,
      resources,
    });
    assert.equal(interrupted.outcome, "interrupted");
    assert.equal(interrupted.job.status, "processing");
    assert.notEqual(interrupted.job.status, "completed");
    stop = false;
    const reclaimed = await foundation.service.claimNextMonitorJob();
    assert.equal(reclaimed?.job.id, claimed?.job.id);
    assert.notEqual(reclaimed?.job.claimToken, claimed?.job.claimToken);
    const resumed = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: reclaimed!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
      resources,
    });
    assert.equal(resumed.outcome, "completed");
    assert.equal((await foundation.store.listObservations(ORG_A, resumed.job.id)).length, 2);

    const staleMonitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        name: "Stale claim",
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: staleMonitor.id });
    const staleClaim = await foundation.service.claimNextMonitorJob();
    clock.advance(ATHENA_MONITOR_WORKER_DEFAULTS.leaseSeconds * 1000 + 1000);
    const stale = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: staleClaim!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(stale.outcome, "interrupted");
    assert.notEqual(stale.job.status, "completed");
    await assert.rejects(
      () =>
        foundation.service.persistMonitorObservations({
          jobId: staleClaim!.job.id,
          claimToken: staleClaim!.job.claimToken!,
          observations: [],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "STALE_CLAIM",
    );
  });

  it("keeps an explicit cancellation terminal", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: [] }, clock);
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const cancelClaim = await foundation.service.claimNextMonitorJob();
    await foundation.service.requestMonitorCancellation({ organizationId: ORG_A, jobId: cancelClaim!.job.id });
    const cancelled = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: cancelClaim!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(cancelled.outcome, "cancelled");
    assert.equal(cancelled.job.status, "cancelled");
    assert.equal(await foundation.service.claimNextMonitorJob(), null);
  });

  it("stops a downgraded organization without deleting historical monitors", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: [] }, clock);
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const entitledClaim = await foundation.service.claimNextMonitorJob();
    foundation.plans.set(ORG_A, "free");
    const downgraded = await executeMonitorJob({
      service: foundation.service,
      store: foundation.store,
      job: entitledClaim!.job,
      fetchPage: fixture.fetchPage,
      now: clock.now,
    });
    assert.equal(downgraded.outcome, "blocked");
    assert.equal(downgraded.job.status, "blocked");
    assert.equal((await foundation.store.getMonitor(ORG_A, monitor.id))?.id, monitor.id);
    await assert.rejects(
      () => foundation.service.getMonitor(ORG_A, monitor.id),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ENTITLEMENT_REQUIRED",
    );
  });

  it("stops claiming on shutdown and closes worker resources", async () => {
    const clock = createClock();
    const foundation = createFoundation({ plans: { [ORG_A]: "full" }, clock });
    const fixture = createFixtureFetch({ pants: ["100"], robes: [] }, clock);
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration({
        selection: { mode: "categories", categoryUrls: [PANTS] },
      }),
    });
    const queued = await foundation.service.enqueueMonitorJob({ organizationId: ORG_A, monitorId: monitor.id });
    const resources = createMonitorResources();
    let stopping = true;
    await runAthenaMonitorWorker({
      service: foundation.service,
      store: foundation.store,
      fetchPage: fixture.fetchPage,
      resources,
      now: clock.now,
      shouldStop: () => stopping,
      closeOnStop: true,
      sleep: async () => {
        stopping = true;
      },
    });
    assert.equal(resources.closed, true);
    assert.equal((await foundation.store.getJob(ORG_A, queued.id))?.status, "queued");
    let signaled = false;
    const unbind = bindMonitorWorkerSignals(() => {
      signaled = true;
    });
    process.emit("SIGTERM");
    unbind();
    assert.equal(signaled, true);
  });

  it("builds the dedicated monitor worker bundle", () => {
    const result = spawnSync("npm", ["run", "build:monitor-worker"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(path.join(ROOT, "dist/worker/athenaMonitorWorker.js")), true);
  });
});
