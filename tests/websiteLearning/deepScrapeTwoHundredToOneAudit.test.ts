/**
 * Regression: prior 200-queue / forefront defect is replaced by ranked plan.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { buildRankedCrawlPlan } from "../../services/websiteLearning/deepScrape/crawler/rankedCrawlPlan";
import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = path.join(__dirname, "../..");
const ROOT_URL = "https://getoblic.com/";
const HOMEPAGE = canonicalizePageUrl(ROOT_URL)!;

describe("Deep scrape 200→1 scheduling defect regression", () => {
  it("documents new policy owners (inventory / ranked / fetch / accept)", () => {
    const policy = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawlPolicy.ts"),
      "utf8",
    );
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

    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory, 500);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates, 100);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts, 100);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
    assert.match(policy, /maxDiscoveryInventory:\s*500/);
    assert.match(policy, /maxRankedCandidates:\s*100/);
    assert.match(policy, /maxFetchAttempts:\s*100/);
    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /maxRequestsPerCrawlOverride = 1/);
    assert.match(
      cheerio,
      /maxRequestsPerCrawl:\s*ctx\.maxRequestsPerCrawlOverride \?\?/,
    );
  });

  it("navigation candidates participate in top-ranked plan after homepage; noise excluded", () => {
    const primaryNavExisting = [
      "https://getoblic.com/about",
      "https://getoblic.com/services",
      "https://getoblic.com/pricing",
      "https://getoblic.com/contact",
      "https://getoblic.com/solutions",
    ];
    const primaryNavNew = [
      "https://getoblic.com/company",
      "https://getoblic.com/platform",
      "https://getoblic.com/demo",
    ];
    const seedUrls = [
      ...primaryNavExisting,
      ...Array.from(
        { length: 194 },
        (_, i) => `https://getoblic.com/blog/post-${i + 1}`,
      ),
    ];

    const plan = buildRankedCrawlPlan({
      rootUrl: ROOT_URL,
      homepageUrl: HOMEPAGE,
      candidates: [
        { url: HOMEPAGE, provenance: "unknown" },
        ...seedUrls.map((url) => ({ url, provenance: "sitemap" as const })),
        ...[...primaryNavExisting, ...primaryNavNew].map((url) => ({
          url,
          provenance: "primary_navigation" as const,
          anchorText: "Nav",
        })),
      ],
    });

    assert.equal(plan.selected[0]?.normalizedUrl, HOMEPAGE);
    assert.ok(plan.selected.length <= DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates);

    for (const url of [...primaryNavExisting, ...primaryNavNew]) {
      const canonical = canonicalizePageUrl(url)!;
      assert.ok(
        plan.selected.some((entry) => entry.normalizedUrl === canonical),
        `${canonical} must be in ranked plan (not blocked by sitemap fill)`,
      );
    }

    const blogSelected = plan.secondarySelected.filter((entry) =>
      entry.arborescence.normalizedPath.startsWith("/blog/"),
    ).length;
    assert.ok(blogSelected < plan.secondarySelected.length);
  });

  it("Prospect/Brain share Phase A ranked-plan path", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(adapter, /sourceType\s*===\s*["']brain["']/);
    assert.match(adapter, /buildRankedCrawlPlan/);
  });
});
