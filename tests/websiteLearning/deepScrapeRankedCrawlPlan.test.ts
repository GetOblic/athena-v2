/**
 * Ranked crawl plan + homepage-first scheduling (Phase A shared Prospect/Brain).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildRankedCrawlPlan,
  buildRankedCrawlPlanForSource,
} from "../../services/websiteLearning/deepScrape/crawler/rankedCrawlPlan";
import {
  compareRankedCandidates,
  crawleeForefrontForScore,
  scoreDeepScrapeCandidate,
} from "../../services/websiteLearning/deepScrape/crawler/urlRelevance";
import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = path.join(__dirname, "../..");
const ROOT_URL = "https://example.com/";
const HOMEPAGE = canonicalizePageUrl(ROOT_URL)!;

describe("Deep scrape ranked crawl plan", () => {
  it("A. homepage is first in plan even when sitemap scores higher / would forefront", () => {
    const services = scoreDeepScrapeCandidate({
      url: "https://example.com/services",
      rootUrl: ROOT_URL,
      provenance: "sitemap",
    });
    const homepage = scoreDeepScrapeCandidate({
      url: HOMEPAGE,
      rootUrl: ROOT_URL,
      provenance: "unknown",
    });
    assert.ok(services.totalScore > homepage.totalScore);
    assert.equal(crawleeForefrontForScore(services.totalScore), true);
    assert.equal(crawleeForefrontForScore(homepage.totalScore), false);

    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [
        { url: "https://example.com/services", provenance: "sitemap" },
        { url: "https://example.com/about", provenance: "sitemap" },
        { url: "https://example.com/pricing", provenance: "sitemap" },
        { url: HOMEPAGE, provenance: "unknown" },
      ],
    });

    assert.equal(plan.selected[0]?.normalizedUrl, HOMEPAGE);
    assert.ok(
      plan.secondarySelected.every((entry) => entry.normalizedUrl !== HOMEPAGE),
    );
  });

  it("B. primary navigation outranks sitemap noise and is not blocked by queue saturation", () => {
    const sitemapNoise = Array.from({ length: 200 }, (_, i) => ({
      url: `https://example.com/blog/post-${i + 1}`,
      provenance: "sitemap" as const,
    }));
    const primaryNav = [
      "about",
      "services",
      "pricing",
      "contact",
      "solutions",
      "team",
      "faq",
      "training",
      "products",
      "locations",
    ].map((slug) => ({
      url: `https://example.com/${slug}`,
      provenance: "primary_navigation" as const,
      anchorText: slug,
    }));

    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [
        { url: HOMEPAGE, provenance: "unknown" },
        ...sitemapNoise,
        ...primaryNav,
      ],
    });

    const selectedPaths = new Set(
      plan.selected.map((entry) => entry.arborescence.normalizedPath),
    );
    for (const slug of [
      "about",
      "services",
      "pricing",
      "contact",
      "solutions",
      "team",
      "faq",
      "training",
      "products",
      "locations",
    ]) {
      assert.ok(
        selectedPaths.has(`/${slug}`),
        `expected /${slug} in ranked plan`,
      );
    }
    const leadingSecondary = plan.secondarySelected.slice(0, 10);
    assert.equal(
      leadingSecondary.filter(
        (entry) => entry.provenance === "primary_navigation",
      ).length,
      10,
      "primary navigation must occupy the first secondary slots ahead of blog noise",
    );
    assert.ok(plan.selected.length <= DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates);
  });

  it("C. top-ranked plan is deterministic with tie-breakers", () => {
    const candidates = Array.from({ length: 140 }, (_, i) => ({
      url: `https://example.com/page-${String(i).padStart(3, "0")}`,
      provenance: "content_link" as const,
    }));
    candidates.push({ url: HOMEPAGE, provenance: "unknown" as const });

    const a = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates,
    });
    const b = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [...candidates].reverse(),
    });

    assert.equal(a.selected.length, DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates);
    assert.deepEqual(
      a.selected.map((entry) => entry.normalizedUrl),
      b.selected.map((entry) => entry.normalizedUrl),
    );

    const left = scoreDeepScrapeCandidate({
      url: "https://example.com/alpha",
      rootUrl: ROOT_URL,
      provenance: "sitemap",
    });
    const right = scoreDeepScrapeCandidate({
      url: "https://example.com/beta",
      rootUrl: ROOT_URL,
      provenance: "sitemap",
    });
    if (left.totalScore === right.totalScore) {
      assert.ok(compareRankedCandidates(left, right) < 0);
    }
  });

  it("D. fetch budget and acceptance cap remain separate policy knobs", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates, 100);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts, 100);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory, 500);
    assert.ok(
      DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts >
        DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
    );
    assert.ok(
      DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates >=
        DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
    );

    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: Array.from({ length: 100 }, (_, i) => ({
        url: `https://example.com/item-${i}`,
        provenance: "sitemap" as const,
      })).concat([{ url: HOMEPAGE, provenance: "unknown" }]),
    });
    assert.ok(plan.selected.length <= DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates);
    assert.equal(plan.stats.maxFetchAttempts, 100);
    assert.equal(plan.stats.maxMeaningfulPages, 50);
  });

  it("E. small site without sitemap still selects useful nav pages", () => {
    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [
        { url: HOMEPAGE, provenance: "unknown" },
        {
          url: "https://example.com/services",
          provenance: "primary_navigation",
        },
        {
          url: "https://example.com/about",
          provenance: "primary_navigation",
        },
        {
          url: "https://example.com/contact",
          provenance: "primary_navigation",
        },
      ],
    });
    assert.equal(plan.selected.length, 4);
    assert.equal(plan.stats.homepageIncluded, true);
    assert.ok(
      plan.secondarySelected.every(
        (entry) => entry.provenance === "primary_navigation",
      ),
    );
  });

  it("F. large noisy site: meaningful nav tree dominates final plan", () => {
    const noise = [
      ...Array.from({ length: 100 }, (_, i) => ({
        url: `https://example.com/tag/news-${i}`,
        provenance: "sitemap" as const,
      })),
      ...Array.from({ length: 100 }, (_, i) => ({
        url: `https://example.com/search?q=${i}`,
        provenance: "content_link" as const,
      })),
      ...Array.from({ length: 50 }, (_, i) => ({
        url: `https://example.com/files/doc-${i}.pdf`,
        provenance: "sitemap" as const,
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        url: `https://example.com/blog/archive/post-${i}`,
        provenance: "sitemap" as const,
      })),
    ];
    const nav = ["services", "about", "pricing", "contact", "team"].map(
      (slug) => ({
        url: `https://example.com/${slug}`,
        provenance: "primary_navigation" as const,
      }),
    );

    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [{ url: HOMEPAGE, provenance: "unknown" }, ...noise, ...nav],
    });

    const topSecondary = plan.secondarySelected.slice(0, 8).map(
      (entry) => entry.arborescence.normalizedPath,
    );
    assert.ok(topSecondary.includes("/services"));
    assert.ok(topSecondary.includes("/about"));
    assert.ok(!topSecondary.some((p) => p.startsWith("/tag/")));
    assert.ok(!topSecondary.some((p) => p.includes(".pdf")));
  });

  it("G. observability: page-cap event is acceptance-only; ranked exclusion is distinct", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );

    assert.match(observability, /"deep_scrape_ranked_plan_finalized"/);
    assert.match(observability, /"deep_scrape_ranked_candidate_excluded"/);
    assert.match(
      observability,
      /"deep_scrape_discovery_inventory_candidate_skipped"/,
    );
    assert.match(observability, /"deep_scrape_homepage_discovery_started"/);

    // Page-cap skip is gated only on acceptedPages vs maxAccepted.
    assert.match(
      cheerio,
      /if \(ctx\.acceptedPages\.length >= ctx\.maxAccepted\) \{\s*recordRejection\(ctx, "PAGE_CAP_LOWER_PRIORITY"\)/,
    );
    assert.match(cheerio, /acceptedPageCount: ctx\.acceptedPages\.length/);
    assert.match(cheerio, /maxMeaningfulPages: ctx\.maxAccepted/);
    // Queue capacity must not use page-cap event.
    assert.doesNotMatch(
      cheerio,
      /reason: "queue_capacity"/,
    );
    assert.match(cheerio, /RANKED_PLAN_LOWER_PRIORITY/);
    assert.match(cheerio, /DISCOVERY_INVENTORY_CAPACITY/);

    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /deep_scrape_homepage_discovery_started/);
    assert.match(adapter, /maxRequestsPerCrawlOverride = 1/);
    assert.match(adapter, /forefront: false/);
  });

  it("H. Prospect and Brain produce identical ranked plans for the same candidates", () => {
    const candidates = [
      { url: HOMEPAGE, provenance: "unknown" as const },
      {
        url: "https://example.com/services",
        provenance: "primary_navigation" as const,
      },
      { url: "https://example.com/blog/a", provenance: "sitemap" as const },
      {
        url: "https://example.com/about",
        provenance: "primary_navigation" as const,
      },
    ];
    const prospect = buildRankedCrawlPlanForSource({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates,
      sourceType: "prospect",
    });
    const brain = buildRankedCrawlPlanForSource({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates,
      sourceType: "brain",
    });
    assert.deepEqual(
      prospect.selected.map((entry) => entry.normalizedUrl),
      brain.selected.map((entry) => entry.normalizedUrl),
    );

    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const planModule = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/rankedCrawlPlan.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(adapter, /sourceType\s*===\s*["']brain["']/);
    assert.doesNotMatch(planModule, /sourceType\s*===\s*["']brain["']/);
    assert.match(adapter, /buildRankedCrawlPlan/);
  });

  it("adapter wires homepage-first then ranked secondary fetch within budgets", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /deep_scrape_homepage_discovery_started/);
    assert.match(adapter, /deep_scrape_homepage_discovery_completed/);
    assert.match(adapter, /deep_scrape_ranked_plan_finalized/);
    assert.match(adapter, /deep_scrape_ranked_fetch_started/);
    assert.match(adapter, /secondarySelected/);
    assert.match(
      adapter,
      /maxFetchAttempts - cheerioProcessed/,
    );
    assert.match(
      adapter,
      /maxAccepted: DEEP_SCRAPE_CRAWL_POLICY\.maxMeaningfulPages/,
    );
    assert.match(
      adapter,
      /maxQueueSize: DEEP_SCRAPE_CRAWL_POLICY\.maxRankedCandidates/,
    );
  });
});
