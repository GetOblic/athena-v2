/**
 * Fetch lifecycle accounting — final review fixtures.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { DeepScrapeFetchLifecycle } from "../../services/websiteLearning/deepScrape/crawler/fetchLifecycle";
import { buildRankedCrawlPlan } from "../../services/websiteLearning/deepScrape/crawler/rankedCrawlPlan";
import { scoreDeepScrapeCandidate } from "../../services/websiteLearning/deepScrape/crawler/urlRelevance";
import { evaluateExtractedPageUsefulness } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = path.join(__dirname, "../..");

function makeLifecycle() {
  return new DeepScrapeFetchLifecycle({
    organizationId: "org-life",
    jobId: "job-life",
    sourceType: "brain",
    domain: "getoblic.com",
  });
}

function muteLogs(run: () => void): void {
  const original = console.log;
  console.log = (() => {}) as typeof console.log;
  try {
    run();
  } finally {
    console.log = original;
  }
}

describe("Deep scrape fetch lifecycle accounting", () => {
  it("documents hard invariants and shared wiring", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const life = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/fetchLifecycle.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /DeepScrapeFetchLifecycle/);
    assert.match(adapter, /assertCompleteOrThrow/);
    assert.match(adapter, /finalizePlaywrightPending/);
    assert.match(adapter, /PLAYWRIGHT_CHROMIUM_UNAVAILABLE/);
    assert.match(adapter, /PLAYWRIGHT_BUDGET_EXCEEDED/);
    assert.match(cheerio, /markPlaywrightPending/);
    assert.match(cheerio, /markHandlerEntered/);
    assert.match(life, /terminalHandlerCandidates === requestHandlersEntered/);
    assert.match(
      life,
      /rankedCandidatesSelected === rankedHandlersEntered \+ rankedSkippedBeforeFetch/,
    );
    assert.doesNotMatch(life, /sourceType\s*===\s*["']brain["']/);
  });

  it("separates never-started ranked skips from handler-terminal invariant", () => {
    muteLogs(() => {
      const life = makeLifecycle();
      const ranked = Array.from(
        { length: 50 },
        (_, i) => `https://getoblic.com/p/${i}`,
      );
      life.setRankedSelected(50);
      ranked.forEach((url, rank) => {
        life.markRanked(url, {
          rank,
          score: 100 - rank,
          provenance: "sitemap",
        });
      });

      // Only 3 handlers enter; remaining 47 never start.
      for (const url of ranked.slice(0, 3)) {
        life.markHandlerEntered(url);
        life.markAccepted(url);
      }

      const summary = life.assertCompleteOrThrow();
      assert.equal(summary.requestHandlersEntered, 3);
      assert.equal(summary.terminalHandlerCandidates, 3);
      assert.equal(summary.playwrightPending, 0);
      assert.equal(summary.rankedCandidatesSelected, 50);
      assert.equal(summary.rankedHandlersEntered, 3);
      assert.equal(summary.rankedSkippedBeforeFetch, 47);
      assert.equal(
        summary.rankedCandidatesSelected,
        summary.rankedHandlersEntered + summary.rankedSkippedBeforeFetch,
      );
      // Handler invariant must ignore the 47 skips.
      assert.equal(
        summary.terminalHandlerCandidates,
        summary.requestHandlersEntered,
      );
    });
  });

  it("GetOblic shape: 47 playwright_pending without finalize leaves handlers open", () => {
    muteLogs(() => {
      const life = makeLifecycle();
      life.setRankedSelected(50);
      const homepage = "https://getoblic.com/";
      const forbidden = [
        "https://getoblic.com/admin",
        "https://getoblic.com/private",
      ];
      const pending = Array.from(
        { length: 47 },
        (_, i) => `https://getoblic.com/page-${i + 1}`,
      );

      const all = [homepage, ...forbidden, ...pending];
      all.forEach((url, rank) => {
        life.markRanked(url, {
          rank,
          score: 200 - rank,
          provenance: "primary_navigation",
        });
      });

      life.markHandlerEntered(homepage);
      life.markAccepted(homepage);
      for (const url of forbidden) {
        life.markHandlerEntered(url);
        life.markRejected(url, "HTTP_403", { statusCode: 403 });
      }
      for (const url of pending) {
        life.markHandlerEntered(url);
        life.markPlaywrightPending(url, "PAGE_NO_USABLE_TEXT");
      }

      const mid = life.summary();
      assert.equal(mid.requestHandlersEntered, 50);
      assert.equal(mid.pagesAccepted, 1);
      assert.equal(mid.pagesRejected, 2);
      assert.equal(mid.playwrightPending, 47);
      assert.equal(mid.playwrightProcessed, 0);
      assert.equal(life.listHandlerEnteredNonTerminal().length, 47);
    });
  });

  it("GetOblic shape: PW skip terminalizes all 50 handlers with explicit reasons", () => {
    muteLogs(() => {
      const life = makeLifecycle();
      life.setRankedSelected(50);
      const homepage = "https://getoblic.com/";
      const forbidden = [
        "https://getoblic.com/admin",
        "https://getoblic.com/private",
      ];
      const pending = Array.from(
        { length: 47 },
        (_, i) => `https://getoblic.com/app/${i + 1}`,
      );
      const all = [homepage, ...forbidden, ...pending];
      all.forEach((url, rank) => {
        life.markRanked(url, {
          rank,
          score: 200 - rank,
          provenance: "primary_navigation",
        });
      });

      life.markHandlerEntered(homepage);
      life.markAccepted(homepage);
      for (const url of forbidden) {
        life.markHandlerEntered(url);
        life.markRejected(url, "HTTP_403", { statusCode: 403 });
      }
      for (const url of pending) {
        life.markHandlerEntered(url);
        life.markPlaywrightPending(url, "PAGE_NO_USABLE_TEXT");
      }

      const skipped = life.finalizePlaywrightPending(
        "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
      );
      assert.equal(skipped, 47);
      const summary = life.assertCompleteOrThrow();
      assert.equal(summary.requestHandlersEntered, 50);
      assert.equal(summary.terminalHandlerCandidates, 50);
      assert.equal(summary.playwrightPending, 0);
      assert.equal(summary.pagesAccepted, 1);
      assert.equal(summary.pagesRejected, 49);
      assert.equal(
        summary.terminalReasons.PLAYWRIGHT_CHROMIUM_UNAVAILABLE,
        47,
      );
      assert.equal(summary.terminalReasons.HTTP_403, 2);
      assert.equal(summary.fetchesAttempted, 50);
      assert.equal(
        summary.rankedCandidatesSelected,
        summary.rankedHandlersEntered + summary.rankedSkippedBeforeFetch,
      );
    });
  });

  it("double-terminalize is a no-op", () => {
    muteLogs(() => {
      const life = makeLifecycle();
      life.setRankedSelected(1);
      const url = "https://getoblic.com/";
      life.markRanked(url, { rank: 0, score: 120, provenance: "unknown" });
      life.markHandlerEntered(url);
      life.markAccepted(url);
      life.markRejected(url, "SHOULD_NOT_APPLY");
      life.markRequestFailed(url, "SHOULD_NOT_APPLY");
      const summary = life.assertCompleteOrThrow();
      assert.equal(summary.pagesAccepted, 1);
      assert.equal(summary.pagesRejected, 0);
      assert.equal(summary.terminalReasons.accepted, 1);
    });
  });

  it("Playwright retry does not double-count playwrightProcessed", () => {
    muteLogs(() => {
      const life = makeLifecycle();
      life.setRankedSelected(1);
      const url = "https://getoblic.com/spa";
      life.markRanked(url, {
        rank: 0,
        score: 180,
        provenance: "primary_navigation",
      });
      life.markHandlerEntered(url);
      life.markPlaywrightPending(url, "PAGE_NO_USABLE_TEXT");
      life.markPlaywrightStarted(url);
      life.markPlaywrightStarted(url); // retry
      life.markAccepted(url, { browserFallbackUsed: true });
      const summary = life.assertCompleteOrThrow();
      assert.equal(summary.playwrightProcessed, 1);
      assert.equal(summary.requestHandlersEntered, 1);
      assert.equal(summary.terminalHandlerCandidates, 1);
    });
  });

  it("silent-exit wiring remains in Cheerio/Playwright/adapter", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const pw = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/playwrightCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /markPlaywrightPending\(fallbackUrl/);
    assert.match(adapter, /PLAYWRIGHT_BUDGET_EXCEEDED/);
    assert.match(pw, /acceptance_cap_playwright/);
    assert.match(pw, /markRejected/);
    assert.match(pw, /markAccepted/);
    assert.match(pw, /markRequestFailed/);
  });

  it("Laser Perfection-style page can rank and pass existing quality gates", () => {
    const root = "https://www.laserpfection.com/";
    const homepage = canonicalizePageUrl(root)!;
    const plan = buildRankedCrawlPlan({
      rootUrl: homepage,
      homepageUrl: homepage,
      candidates: [
        { url: homepage, provenance: "unknown" },
        {
          url: "https://www.laserpfection.com/products/",
          provenance: "primary_navigation",
        },
        {
          url: "https://www.laserpfection.com/products/skinmedica-2/",
          provenance: "primary_navigation",
        },
        {
          url: "https://www.laserpfection.com/services/",
          provenance: "primary_navigation",
        },
      ],
    });
    assert.ok(
      plan.selected.some((entry) =>
        entry.arborescence.normalizedPath.includes("skinmedica"),
      ),
    );
    const product = scoreDeepScrapeCandidate({
      url: "https://www.laserpfection.com/products/skinmedica-2/",
      rootUrl: homepage,
      provenance: "primary_navigation",
      anchorText: "SkinMedica",
    });
    assert.equal(product.rejectedBeforeFetch, false);
    const usefulness = evaluateExtractedPageUsefulness({
      title: "SkinMedica Products",
      headings: ["Medical-grade skincare"],
      text:
        "SkinMedica offers physician-dispensed skincare treatments designed to improve skin tone, texture, and clarity for clinical aesthetic patients.",
      pageType: "products",
    });
    assert.equal(usefulness.accepted, true);
  });
});
