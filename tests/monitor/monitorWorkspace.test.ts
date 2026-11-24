import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { TenantAppShell } from "../../components/dashboard/TenantAppShell";
import { TenantNavList, TenantSidebar } from "../../components/dashboard/TenantSidebar";
import { localizeTenantNav } from "../../components/dashboard/tenantNavigation";
import { MonitorWorkspace } from "../../components/monitor/MonitorWorkspace";
import {
  applyFreeUntrainedNavPresentation,
  freeUntrainedLockedNavCopy,
} from "../../lib/organization/freeUntrained";
import { applyMonitorPlanNav } from "../../lib/organization/monitorPlanNav";
import {
  MONITOR_RESULTS_PAGE_SIZE,
  pageMonitorCards,
  presentMonitorProgress,
  shouldPollMonitorJob,
} from "../../lib/monitor/monitorWorkspaceModel";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import {
  cancelJob,
  compareJobs,
  createMonitorForOperator,
  enqueueForOperator,
  inspectWebsite,
  readJob,
  readMonitor,
  readResults,
  refilterJob,
  updateMonitorForOperator,
} from "../../services/monitor/monitorCustomerApi";
import { categoryKeyFromUrl } from "../../services/monitor/monitorWebsiteIdentity";
import {
  ORG_A,
  ORG_B,
  USER_A,
  completedCoverage,
  createFoundation,
  mixedConfiguration,
  observationDraft,
  toscaneConfiguration,
} from "./helpers";

const ROOT = process.cwd();
const PANTS = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
const ROBES = "https://www.toscane-boutique.fr/fr/robes-c-7.htm";
const FEMME = "https://www.toscane-boutique.fr/fr/femme-c-1.htm";

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.keys(value).flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = (value as Record<string, unknown>)[key];
    if (child != null && typeof child === "object") return leafPaths(child, next);
    return [next];
  });
}

function fullService() {
  return createFoundation({ plans: { [ORG_A]: "full", [ORG_B]: "full" } });
}

describe("Monitor customer workspace", () => {
  it("locks Monitor for every Free account and leaves Full navigation open", () => {
    for (const defineKind of ["needs_setup", "ready", "in_progress", "unknown"] as const) {
      const locked = applyMonitorPlanNav(
        applyFreeUntrainedNavPresentation(
          localizeTenantNav(en),
          { athenaPlan: "free", defineKind },
          freeUntrainedLockedNavCopy(en.nav),
        ),
        { athenaPlan: "free" },
        {
          heading: en.upgrade.availableWithFullAthena,
          explanation: en.monitor.lockedExplanation,
        },
      );
      const monitor = locked.find((item) => item.key === "monitor");
      assert.equal(monitor?.disabled, true);
      assert.equal(monitor?.href, undefined);
      assert.equal(monitor?.lockedHeading, "Available with Full Athena");
      assert.match(monitor?.lockedExplanation ?? "", /color and pattern/);
      const mobile = renderToStaticMarkup(
        createElement(TenantNavList, {
          currentPath: "/monitor",
          items: locked,
          yourGrowthLabel: en.nav.yourGrowth,
          utilitiesLabel: en.nav.utilities,
          moreToolsLabel: en.nav.moreTools,
        }),
      );
      const desktop = renderToStaticMarkup(
        createElement(TenantSidebar, {
          currentPath: "/monitor",
          messages: en,
          athenaPlan: "free",
          defineKind,
        }),
      );
      assert.equal(mobile.includes('href="/monitor"'), false);
      assert.equal(desktop.includes('href="/monitor"'), false);
      assert.match(desktop, /Available with Full Athena/);
      if (defineKind === "needs_setup") {
        assert.doesNotMatch(desktop, /upgrade|premium|subscribe|paywall|unlock/i);
      }
    }

    const open = renderToStaticMarkup(
      createElement(TenantAppShell, {
        currentPath: "/monitor",
        messages: en,
        athenaPlan: "full",
        defineKind: "needs_setup",
        children: createElement("p", null, "Workspace"),
      }),
    );
    assert.match(open, /href="\/monitor"/);
    assert.match(open, />5</);
    const page = read("app/monitor/page.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    assert.match(page, /progression\.athenaPlan === "full"/);
    assert.match(shell, /props\.athenaPlan == null/);
    assert.match(shell, /loadAuthoritativeAthenaPlan/);
    assert.doesNotMatch(shell, /loadFreeProgressionState/);
    assert.doesNotMatch(shell, /requireCurrentOrganizationContext|requireTenantContext/);
    assert.match(read("services/organization/freeProgressionState.ts"), /export const loadAuthoritativeAthenaPlan/);
    assert.doesNotMatch(
      read("services/organization/freeProgressionState.ts").slice(
        read("services/organization/freeProgressionState.ts").indexOf("export const loadAuthoritativeAthenaPlan"),
      ),
      /loadHomeDefineResult/,
    );
    assert.match(page, /UpgradeUnavailableCard/);
    assert.match(page, /feature="monitor"/);
    assert.doesNotMatch(page, /redirectIfFreeUntrainedGrowthRoute/);
    assert.doesNotMatch(page, /executeMonitorJob|createMonitorPageFetch/);
  });

  it("keeps the same Monitor sections in desktop and mobile markup", () => {
    const html = renderToStaticMarkup(
      createElement(MonitorWorkspace, { messages: en, locale: "en" }),
    );
    assert.match(html, /data-monitor-layout="responsive"/);
    assert.match(html, /grid-cols-1/);
    assert.match(html, /xl:grid-cols-/);
    assert.match(html, /My Monitors/);
    assert.match(html, /Results/);
    assert.match(html, /History/);
    assert.match(html, /Active Searches/);
    assert.match(html, /Color and pattern monitoring is the initial supported criterion/);
    assert.doesNotMatch(html, /verified bestseller/i);
    const french = renderToStaticMarkup(
      createElement(MonitorWorkspace, { messages: fr, locale: "fr" }),
    );
    assert.match(french, /Mes veilles/);
    assert.match(french, /Recherches en cours/);
  });

  it("rejects Free callers, foreign monitors, empty categories, and client observation ids", async () => {
    const free = createFoundation({ plans: { [ORG_A]: "free" } });
    await assert.rejects(
      () =>
        createMonitorForOperator(free.service, {
          organizationId: ORG_B,
          configuration: toscaneConfiguration(),
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ENTITLEMENT_REQUIRED",
    );

    const { service } = fullService();
    const created = await createMonitorForOperator(service, {
      organizationId: ORG_B,
      configuration: toscaneConfiguration({ name: "Private" }),
    });
    assert.equal(created.monitor.name, "Private");
    assert.equal((await service.listMonitors(ORG_B)).length, 0);
    assert.equal((await service.listMonitors(ORG_A)).length, 1);

    const foreign = await service.createMonitor({
      organizationId: ORG_B,
      userId: null,
      configuration: toscaneConfiguration({ name: "Other account" }),
    });
    await assert.rejects(
      () => readMonitor(service, foreign.id),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      () =>
        createMonitorForOperator(service, {
          configuration: toscaneConfiguration({
            selection: { mode: "categories", categoryUrls: [] },
          }),
        }),
      (error: unknown) =>
        error instanceof MonitorOperationError &&
        error.code === "INVALID_CONFIGURATION" &&
        /at least one discovered category/.test(error.message),
    );
    await assert.rejects(
      () => enqueueForOperator(service, created.monitor.id, { publicObservationIds: ["public"] }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_REQUEST",
    );
  });

  it("saves several websites and categories without rewriting an earlier snapshot", async () => {
    const { service } = fullService();
    const created = await createMonitorForOperator(service, {
      configuration: {
        ...toscaneConfiguration({
          name: "Spring",
          minimum: 4,
          selection: { mode: "categories", categoryUrls: [PANTS, ROBES] },
        }),
        sources: [
          ...toscaneConfiguration({
            selection: { mode: "categories", categoryUrls: [PANTS, ROBES] },
          }).sources,
          mixedConfiguration().sources[1],
        ],
      },
    });
    assert.equal(created.monitor.configuration.sources.length, 2);
    assert.equal(created.monitor.configuration.criterion.minimum, 4);
    const selection = created.monitor.configuration.sources[0]?.selection;
    assert.equal(selection?.mode, "categories");
    if (selection?.mode === "categories") {
      assert.deepEqual(selection.categoryUrls, [PANTS, ROBES]);
      assert.deepEqual(selection.categoryIds, [categoryKeyFromUrl(PANTS), categoryKeyFromUrl(ROBES)]);
    }
    const queued = await enqueueForOperator(service, created.monitor.id, {});
    const updated = await updateMonitorForOperator(service, created.monitor.id, {
      configuration: toscaneConfiguration({ name: "Edited later", minimum: 6 }),
    });
    assert.equal(updated.monitor.name, "Edited later");
    const job = await readJob(service, queued.job.id);
    assert.equal(job.job.configurationSnapshot.name, "Spring");
    assert.equal(job.job.configurationSnapshot.criterion.minimum, 4);
    await assert.rejects(
      () => enqueueForOperator(service, created.monitor.id, { forceFresh: true }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ACTIVE_JOB_EXISTS",
    );
    const cancelled = await cancelJob(service, queued.job.id);
    assert.ok(cancelled.job.cancellationRequestedAt);
  });

  it("resolves source states from the shared registry and does not discover blocked websites", async () => {
    const { service } = fullService();
    let discoveries = 0;
    const discover = async () => {
      discoveries += 1;
      return {
        ok: true as const,
        categories: [
          { displayName: "Femme", canonicalUrl: FEMME, parentCategoryKey: null },
          { displayName: "Pantalons", canonicalUrl: PANTS, parentCategoryKey: categoryKeyFromUrl(FEMME) },
        ],
      };
    };
    const blocked = await inspectWebsite(
      service,
      { websiteUrl: "https://www.breal.net/", refresh: true },
      discover,
    );
    assert.equal(blocked.website.state, "access_unavailable");
    assert.equal(blocked.website.displayName, "Bréal");
    assert.equal(blocked.website.selectable, false);
    assert.equal(discoveries, 0);
    assert.equal("adapterId" in blocked.website, false);

    const unsupported = await inspectWebsite(service, { websiteUrl: "https://example.com/" });
    assert.equal(unsupported.website.state, "unsupported");

    const before = await inspectWebsite(service, { websiteUrl: "https://www.toscane-boutique.fr/" });
    assert.equal(before.website.state, "discovering");
    const refreshed = await inspectWebsite(
      service,
      { websiteUrl: "https://toscane-boutique.fr/", refresh: true },
      discover,
    );
    assert.equal(discoveries, 1);
    assert.equal(refreshed.website.state, "available");
    assert.equal(refreshed.website.categories.length, 2);
    assert.equal(refreshed.website.categories[1]?.parentCategoryKey, categoryKeyFromUrl(FEMME));
    assert.equal(refreshed.website.categories[0]?.productFamilyCount, null);
  });

  it("pages results, keeps partial observations, compares history, and refilters without network", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("website request");
    };
    try {
      const { service, calls } = fullService();
      const monitor = await service.createMonitor({
        organizationId: ORG_A,
        userId: USER_A,
        configuration: mixedConfiguration(),
      });
      const queued = await service.enqueueMonitorJob({
        organizationId: ORG_A,
        monitorId: monitor.id,
        forceFresh: true,
      });
      assert.equal(queued.progress.forceFresh, true);
      const claimed = await service.claimNextMonitorJob();
      assert.equal(claimed?.job.id, queued.id);
      const drafts = Array.from({ length: 25 }, (_, index) =>
        observationDraft(`f${index}`, 4, { productName: `Model ${index}`, category: index % 2 === 0 ? "Pantalons" : "Robes" }),
      );
      await service.persistMonitorObservations({
        jobId: claimed!.job.id,
        claimToken: claimed!.job.claimToken!,
        observations: drafts.slice(0, 20),
      });
      await service.persistMonitorObservations({
        jobId: claimed!.job.id,
        claimToken: claimed!.job.claimToken!,
        observations: drafts.slice(20),
      });
      await service.finalizeMonitorJob({
        jobId: claimed!.job.id,
        claimToken: claimed!.job.claimToken!,
        status: "partial",
        sourceCoverage: completedCoverage(claimed!.job),
      });
      const firstPage = await readResults(service, queued.id, new URLSearchParams({ page: "1" }));
      const secondPage = await readResults(service, queued.id, new URLSearchParams({ page: "2", website: "toscane" }));
      assert.equal(firstPage.pageSize, MONITOR_RESULTS_PAGE_SIZE);
      assert.equal(firstPage.results.length, MONITOR_RESULTS_PAGE_SIZE);
      assert.equal(firstPage.total, 25);
      assert.equal(secondPage.results.length, 1);
      assert.equal(firstPage.job.progress.catalogComplete, false);
      assert.equal(firstPage.job.progress.sources.some((source) => source.status === "blocked" && source.retailer === "Bréal"), true);
      assert.equal(firstPage.results.every((card) => card.retailer === "Toscane"), true);
      assert.equal(firstPage.networkRequests, 0);

      const filtered = await readResults(
        service,
        queued.id,
        new URLSearchParams({ category: "Robes", sort: "variations" }),
      );
      assert.equal(filtered.total, 12);
      assert.equal(filtered.results.length, 12);
      assert.ok(filtered.results.every((card) => card.category === "Robes"));
      const pricedOut = await readResults(
        service,
        queued.id,
        new URLSearchParams({ maxPrice: "10" }),
      );
      assert.equal(pricedOut.total, 0);
      const varied = await readResults(
        service,
        queued.id,
        new URLSearchParams({ minVariations: "4" }),
      );
      assert.equal(varied.total, 25);
      const future = await readResults(
        service,
        queued.id,
        new URLSearchParams({ observedAfter: "2026-11-25T00:00:00.000Z" }),
      );
      assert.equal(future.total, 0);
      const foreign = await service.pageMonitorObservations({
        organizationId: ORG_B,
        jobId: queued.id,
        page: 1,
        pageSize: MONITOR_RESULTS_PAGE_SIZE,
        sourceIds: null,
        category: null,
        minVariations: null,
        maxPrice: null,
        observedAfter: null,
        sort: "observed",
      }).then(
        () => "visible",
        (error: unknown) => error instanceof MonitorOperationError ? error.code : "other",
      );
      assert.equal(foreign, "NOT_FOUND");

      const refiltered = await refilterJob(service, queued.id, { minimum: 4 });
      assert.equal(refiltered.networkRequests, 0);
      assert.ok(refiltered.results.length > 0);
      assert.equal(refiltered.results[0]?.imageUrl?.startsWith("https://"), true);

      const monitorAgain = await service.getMonitor(ORG_A, monitor.id);
      await service.updateMonitor({
        organizationId: ORG_A,
        monitorId: monitor.id,
        configuration: toscaneConfiguration({ name: monitorAgain.name, minimum: 4 }),
      });
      const secondQueued = await service.enqueueMonitorJob({
        organizationId: ORG_A,
        monitorId: monitor.id,
      });
      const secondClaim = await service.claimNextMonitorJob();
      await service.persistMonitorObservations({
        jobId: secondClaim!.job.id,
        claimToken: secondClaim!.job.claimToken!,
        observations: [observationDraft("f0", 5, { priceAmount: "59.00" })],
      });
      await service.finalizeMonitorJob({
        jobId: secondClaim!.job.id,
        claimToken: secondClaim!.job.claimToken!,
        status: "partial",
        sourceCoverage: completedCoverage(secondClaim!.job),
      });
      const compared = await compareJobs(service, {
        baselineJobId: queued.id,
        currentJobId: secondQueued.id,
      });
      assert.equal(compared.comparison.sources.some((source) => source.sourceId === "toscane"), true);
      assert.equal(
        compared.comparison.sources.find((source) => source.sourceId === "breal")?.comparable,
        false,
      );
      const progress = presentMonitorProgress(secondClaim!.job, new Date("2026-11-24T12:05:00.000Z"));
      assert.equal(shouldPollMonitorJob("processing"), true);
      assert.equal(shouldPollMonitorJob(progress.status), progress.status === "queued" || progress.status === "processing");
      assert.equal("percent" in progress, false);
      assert.equal(
        calls.some((call) => call.startsWith("listObservations")),
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("bounds result pages and stops polling terminal jobs", () => {
    const cards = Array.from({ length: 30 }, (_, index) => index);
    const page = pageMonitorCards(cards, 2);
    assert.equal(page.items.length, 30 - MONITOR_RESULTS_PAGE_SIZE);
    assert.equal(page.items[0], MONITOR_RESULTS_PAGE_SIZE);
    assert.equal(page.total, 30);
    assert.equal(shouldPollMonitorJob("completed"), false);
    assert.equal(shouldPollMonitorJob("partial"), false);
    assert.equal(shouldPollMonitorJob("queued"), true);
  });

  it("translates the Monitor dictionary in six languages", () => {
    const dictionaries = [en, fr, es, itMessages, de, pt];
    const canonical = leafPaths(en.monitor);
    assert.ok(canonical.length > 40);
    for (const messages of dictionaries) {
      assert.deepEqual(leafPaths(messages.monitor), canonical);
      for (const path of canonical) {
        const value = path.split(".").reduce<unknown>((current, key) => {
          return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
        }, messages.monitor);
        assert.equal(typeof value, "string");
        assert.ok((value as string).trim().length > 0, path);
      }
    }
    assert.deepEqual(
      [en.nav.monitor, fr.nav.monitor, es.nav.monitor, itMessages.nav.monitor, de.nav.monitor, pt.nav.monitor],
      ["Monitor", "Veille", "Monitorización", "Monitoraggio", "Monitoring", "Monitorização"],
    );
    assert.notEqual(fr.monitor.tabs.monitors, en.monitor.tabs.monitors);
    assert.notEqual(de.monitor.comparison.notFound, en.monitor.comparison.notFound);
  });

  it("does not extract inside enqueue routes and keeps category discovery bounded", () => {
    const enqueue = read("app/api/monitor/[id]/jobs/route.ts");
    const websites = read("app/api/monitor/websites/route.ts");
    const api = read("services/monitor/monitorCustomerApi.ts");
    assert.doesNotMatch(enqueue, /executeMonitorJob|enumerateScope|extractFamily|createMonitorPageFetch/);
    assert.match(websites, /body\.refresh === true/);
    assert.match(api, /CATEGORY_DISCOVERY_TIMEOUT_MS = 8_000/);
    assert.match(api, /CATEGORY_DISCOVERY_LIMIT = 50/);
    assert.match(api, /discoverCategories/);
    assert.doesNotMatch(api, /enumerateScope|extractFamily/);
    assert.match(read("workers/athenaMonitorWorker.ts"), /claimed\.job\.progress\.forceFresh === true/);
    const resultsFn = api.slice(
      api.indexOf("export async function readResults"),
      api.indexOf("export async function refilterJob"),
    );
    assert.doesNotMatch(resultsFn, /listMonitorObservations|listObservations/);
    assert.match(resultsFn, /pageMonitorObservations/);
    assert.match(resultsFn, /listMonitorObservationFacts/);
    const adapter = read("services/monitor/monitorSupabaseStore.ts");
    assert.match(adapter, /page_athena_monitor_observations/);
    assert.match(adapter, /list_athena_monitor_observation_facts/);
    assert.doesNotMatch(read("ecosystem.config.cjs"), /athena-v2-monitor-worker/);
    const pm2 = read("ecosystem.monitor-worker.config.cjs");
    assert.match(pm2, /name: "athena-v2-monitor-worker"/);
    assert.match(pm2, /dist\/worker\/athenaMonitorWorker.js/);
    assert.doesNotMatch(pm2, /SUPABASE|SERVICE_ROLE|SECRET/);
    assert.equal((read("ecosystem.config.cjs").match(/name:/g) ?? []).length, 2);
  });
});
