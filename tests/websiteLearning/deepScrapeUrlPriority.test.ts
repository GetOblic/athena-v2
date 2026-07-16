import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { extractDiscoveryLinks } from "../../services/websiteLearning/deepScrape/crawler/navigationExtraction";
import { DeepScrapeCandidateRegistry } from "../../services/websiteLearning/deepScrape/crawler/candidateRegistry";
import {
  compareRankedCandidates,
  rankCrawlCandidates,
  scoreDeepScrapeCandidate,
  strongerProvenance,
} from "../../services/websiteLearning/deepScrape/crawler/urlRelevance";
import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = path.join(__dirname, "../..");

describe("Deep scrape site-structure-aware prioritization", () => {
  it("primary-navigation service pages outrank random body links", () => {
    const nav = scoreDeepScrapeCandidate({
      url: "https://example.com/services",
      rootUrl: "https://example.com/",
      provenance: "primary_navigation",
      anchorText: "Services",
    });
    const body = scoreDeepScrapeCandidate({
      url: "https://example.com/misc/random-note",
      rootUrl: "https://example.com/",
      provenance: "content_link",
      anchorText: "Read more",
    });
    assert.ok(nav.totalScore > body.totalScore);
    assert.ok(nav.factors.some((factor) => factor.reason === "PRIMARY_NAVIGATION"));
  });

  it("shallow /services outranks /blog/category/page/4", () => {
    const services = scoreDeepScrapeCandidate({
      url: "https://example.com/services",
      rootUrl: "https://example.com/",
      provenance: "sitemap",
    });
    const blogPage = scoreDeepScrapeCandidate({
      url: "https://example.com/blog/category/page/4",
      rootUrl: "https://example.com/",
      provenance: "sitemap",
    });
    assert.ok(services.totalScore > blogPage.totalScore);
    assert.ok(
      blogPage.factors.some(
        (factor) => factor.reason === "TAG_CATEGORY_ARCHIVE_PAGINATION",
      ),
    );
  });

  it("deeper commercial service detail pages remain eligible", () => {
    const detail = scoreDeepScrapeCandidate({
      url: "https://example.com/services/scalp-micropigmentation",
      rootUrl: "https://example.com/",
      provenance: "primary_navigation",
      anchorText: "Scalp micropigmentation",
    });
    assert.equal(detail.rejectedBeforeFetch, false);
    assert.ok(detail.totalScore > 100);
    assert.equal(detail.arborescence.pathDepth, 2);
    assert.equal(detail.pageType, "services");
  });

  it("footer privacy/terms rank below service/about/pricing", () => {
    const privacy = scoreDeepScrapeCandidate({
      url: "https://example.com/privacy",
      rootUrl: "https://example.com/",
      provenance: "footer_navigation",
    });
    const about = scoreDeepScrapeCandidate({
      url: "https://example.com/about",
      rootUrl: "https://example.com/",
      provenance: "primary_navigation",
    });
    const pricing = scoreDeepScrapeCandidate({
      url: "https://example.com/pricing",
      rootUrl: "https://example.com/",
      provenance: "primary_navigation",
    });
    assert.ok(about.totalScore > privacy.totalScore);
    assert.ok(pricing.totalScore > privacy.totalScore);
  });

  it("query variants and normalized duplicates do not create multiple ranked URLs", () => {
    const ranked = rankCrawlCandidates({
      urls: [
        { url: "https://example.com/services", provenance: "sitemap" },
        {
          url: "https://example.com/services?utm_source=x",
          provenance: "content_link",
        },
        { url: "https://example.com/services/", provenance: "content_link" },
      ],
      rootUrl: "https://example.com/",
      maxQueue: 25,
    });
    const services = ranked.filter((entry) =>
      entry.arborescence.normalizedPath.startsWith("/services"),
    );
    assert.equal(services.length, 1);
  });

  it("content then primary-nav discovery upgrades provenance and score", () => {
    const registry = new DeepScrapeCandidateRegistry();
    const first = registry.observe({
      url: "https://example.com/services",
      rootUrl: "https://example.com/",
      provenance: "content_link",
    });
    const second = registry.observe({
      url: "https://example.com/services",
      rootUrl: "https://example.com/",
      provenance: "primary_navigation",
      anchorText: "Services",
    });
    assert.equal(first.created, true);
    assert.equal(second.upgraded, true);
    assert.equal(second.ranked.provenance, "primary_navigation");
    assert.ok(second.ranked.totalScore > first.ranked.totalScore);
    assert.equal(
      strongerProvenance("content_link", "primary_navigation"),
      "primary_navigation",
    );
  });

  it("equal-score ordering is deterministic", () => {
    const left = scoreDeepScrapeCandidate({
      url: "https://example.com/a-page",
      rootUrl: "https://example.com/",
      provenance: "content_link",
    });
    const right = scoreDeepScrapeCandidate({
      url: "https://example.com/b-page",
      rootUrl: "https://example.com/",
      provenance: "content_link",
    });
    // Force equal totals for comparator contract.
    left.totalScore = 40;
    right.totalScore = 40;
    assert.ok(compareRankedCandidates(left, right) < 0);
    assert.ok(compareRankedCandidates(right, left) > 0);
  });

  it("page-cap skips record PAGE_CAP_LOWER_PRIORITY in cheerio path", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /PAGE_CAP_LOWER_PRIORITY/);
    assert.match(cheerio, /deep_scrape_page_cap_candidate_skipped/);
    assert.match(cheerio, /totalScore/);
    assert.match(cheerio, /provenance/);
  });

  it("Prospect and Brain share the same scoring and queue policy", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const relevance = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/urlRelevance.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /maxRankedCandidates/);
    assert.doesNotMatch(relevance, /sourceType\s*===\s*["']brain["']/);
    assert.doesNotMatch(relevance, /sourceType\s*===\s*["']prospect["']/);
    assert.doesNotMatch(adapter, /sourceType\s*===\s*["']brain["']/);
  });

  it("priority metadata survives Playwright fallback enqueue", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /provenance: entry\.provenance/);
    assert.match(adapter, /totalScore: entry\.totalScore/);
    // Ranked Playwright enqueue is score-sorted FIFO (no forefront reordering).
    assert.match(adapter, /forefront: false/);
  });

  it("navigation extraction classifies nav/footer/content links", () => {
    const html = `<!doctype html><html><body>
      <header><nav class="main-nav">
        <a href="/services">Services</a>
        <a href="/about">About</a>
      </nav></header>
      <main>
        <p>Welcome <a href="/blog/hello">hello</a></p>
      </main>
      <footer><a href="/privacy">Privacy</a></footer>
    </body></html>`;
    const extracted = extractDiscoveryLinks({
      html,
      baseUrl: "https://example.com/",
      registrableDomain: "example.com",
    });
    const byPath = new Map(
      extracted.links.map((link) => [
        canonicalizePageUrl(link.url)!.replace("https://example.com", ""),
        link.provenance,
      ]),
    );
    // canonicalize may keep trailing style; compare path ends.
    const services = extracted.links.find((link) =>
      link.url.includes("/services"),
    );
    const privacy = extracted.links.find((link) =>
      link.url.includes("/privacy"),
    );
    const blog = extracted.links.find((link) => link.url.includes("/blog/"));
    assert.equal(services?.provenance, "primary_navigation");
    assert.equal(privacy?.provenance, "footer_navigation");
    assert.equal(blog?.provenance, "content_link");
    assert.ok(extracted.primaryNavigationCount >= 2);
    void byPath;
  });

  it("queue ranking keeps multi-page commercial sets ahead of noise", () => {
    const ranked = rankCrawlCandidates({
      urls: [
        { url: "https://example.com/", provenance: "sitemap" },
        { url: "https://example.com/services", provenance: "sitemap" },
        { url: "https://example.com/about", provenance: "sitemap" },
        { url: "https://example.com/pricing", provenance: "sitemap" },
        { url: "https://example.com/team", provenance: "sitemap" },
        { url: "https://example.com/contact", provenance: "sitemap" },
        { url: "https://example.com/blog/tag/news", provenance: "sitemap" },
        { url: "https://example.com/search", provenance: "content_link" },
        ...Array.from({ length: 12 }, (_, index) => ({
          url: `https://example.com/blog/post-${index}`,
          provenance: "content_link" as const,
        })),
      ],
      rootUrl: "https://example.com/",
      maxQueue: 25,
    });
    const topPaths = ranked.slice(0, 6).map(
      (entry) => entry.arborescence.normalizedPath,
    );
    assert.ok(topPaths.includes("/services") || topPaths.includes("/about"));
    assert.ok(!topPaths.includes("/search"));
    assert.ok(ranked.length >= 6);
  });

  it("one-page homepage-only ranking still succeeds", () => {
    const ranked = rankCrawlCandidates({
      urls: [{ url: "https://example.com/", provenance: "unknown" }],
      rootUrl: "https://example.com/",
      maxQueue: 25,
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].pageType, "homepage");
    assert.ok(ranked[0].totalScore > 0);
  });

  it("hard-reject media/feed/API patterns before fetch", () => {
    const media = scoreDeepScrapeCandidate({
      url: "https://example.com/wp-content/uploads/a.jpg",
      rootUrl: "https://example.com/",
      provenance: "content_link",
    });
    const feed = scoreDeepScrapeCandidate({
      url: "https://example.com/feed/",
      rootUrl: "https://example.com/",
      provenance: "sitemap",
    });
    assert.equal(media.rejectedBeforeFetch, true);
    assert.equal(feed.rejectedBeforeFetch, true);
  });

  it("observability events are registered", () => {
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    for (const event of [
      "deep_scrape_candidate_scored",
      "deep_scrape_candidate_priority_upgraded",
      "deep_scrape_navigation_extracted",
      "deep_scrape_priority_queue_finalized",
      "deep_scrape_page_cap_candidate_skipped",
      "deep_scrape_ranked_plan_finalized",
      "deep_scrape_homepage_discovery_started",
    ]) {
      assert.match(observability, new RegExp(`"${event}"`));
    }
  });

  it("adapter finalizes ranked plan after homepage discovery, before secondary fetch", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /maxRankedCandidates: DEEP_SCRAPE_CRAWL_POLICY\.maxRankedCandidates/);
    assert.match(adapter, /maxAccepted: DEEP_SCRAPE_CRAWL_POLICY\.maxMeaningfulPages/);
    assert.match(adapter, /maxFetchAttempts/);
    assert.match(adapter, /deep_scrape_homepage_discovery_started/);
  });
});
