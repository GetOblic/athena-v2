/**
 * Corpus binding: primary-nav protection, char budget, stop-reason diagnostics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import {
  orderAcceptedPagesForCorpus,
  selectBoundedCorpusPages,
} from "../../services/websiteLearning/deepScrape/crawler/corpusSelection";
import type { NormalizedPageDocument } from "../../services/websiteLearning/deepScrape/crawler/crawlerTypes";
import type { RankedUrlCandidate } from "../../services/websiteLearning/deepScrape/crawler/urlRelevance";
import { scoreDeepScrapeCandidate } from "../../services/websiteLearning/deepScrape/crawler/urlRelevance";

function page(input: {
  url: string;
  text: string;
  pageType?: string;
  provenance?: string;
  rankScore?: number;
  rankedPlanIndex?: number | null;
}): NormalizedPageDocument {
  return {
    url: input.url,
    canonicalUrl: input.url,
    finalUrl: input.url,
    title: input.url,
    description: null,
    headings: [],
    readableText: input.text,
    meaningfulText: input.text,
    htmlLanguage: "en",
    pageType: input.pageType ?? "evergreen",
    statusCode: 200,
    contentType: "text/html",
    extractionMethod: "cheerio_readability",
    renderedWithBrowser: false,
    discoveredLinks: [],
    structuredBusinessData: {
      types: [],
      organizationName: null,
      businessName: null,
      description: null,
      telephone: null,
      email: null,
      address: null,
      openingHours: [],
      socialLinks: [],
      services: [],
      products: [],
      people: [],
      faqs: [],
      reviews: [],
      rawJsonLdCount: 0,
    },
    contentHash: `hash:${input.url}`,
    fetchedAt: new Date().toISOString(),
    responseBytes: input.text.length,
    redirectCount: 0,
    selfCanonical: true,
    discoveryProvenance: input.provenance,
    rankScore: input.rankScore,
    rankedPlanIndex: input.rankedPlanIndex ?? null,
  };
}

function ranked(
  url: string,
  provenance: RankedUrlCandidate["provenance"],
  rootUrl = "https://example.test/",
): RankedUrlCandidate {
  return scoreDeepScrapeCandidate({
    url,
    rootUrl,
    provenance,
    sameDomain: true,
  });
}

describe("Deep scrape corpus selection", () => {
  it("character ceiling supports ~50 average-size pages", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars, 240_000);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
    // Production GetOblic density ≈ 4.2k chars/page; 50 × 4.2k < 240k.
    const avg = 4_200;
    assert.ok(50 * avg <= DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars);
    // Worst-case synthesis slice remains 50 × 6k under Gemini Flash context.
    const worstPromptChars = 50 * 6_000;
    const estimatedTokens = Math.ceil(worstPromptChars / 4);
    assert.ok(estimatedTokens < 100_000);
  });

  it("50 accepted average-size pages fit the selected corpus budget", () => {
    const home = "https://example.test/";
    const pages: NormalizedPageDocument[] = [
      page({
        url: home,
        text: "h".repeat(4_000),
        pageType: "homepage",
        provenance: "unknown",
        rankedPlanIndex: 0,
      }),
    ];
    const rankedSelected: RankedUrlCandidate[] = [ranked(home, "unknown")];
    for (let i = 1; i <= 49; i += 1) {
      const url = `https://example.test/page-${i}/`;
      pages.push(
        page({
          url,
          text: "x".repeat(4_200),
          provenance: i <= 5 ? "primary_navigation" : "sitemap",
          rankedPlanIndex: i,
        }),
      );
      rankedSelected.push(
        ranked(url, i <= 5 ? "primary_navigation" : "sitemap"),
      );
    }

    // Async acceptance order reversed — must not starve nav pages.
    const shuffled = [...pages].reverse();
    const result = selectBoundedCorpusPages({
      pages: shuffled,
      homepageUrl: home,
      rankedSelected,
    });

    assert.equal(result.pagesIncludedInCorpus, 50);
    assert.equal(result.stopReason, "exhausted");
    assert.ok(
      result.combinedChars <= DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars,
    );
    assert.equal(result.primaryNavigationAccepted, 5);
    assert.equal(result.primaryNavigationIncluded, 5);
  });

  it("primary-navigation pages are included before lower-priority pages under char cap", () => {
    const home = "https://example.test/";
    const faq = "https://example.test/faq/";
    const listing = "https://example.test/listing/biz-1/";
    const rankedSelected = [
      ranked(home, "unknown"),
      ranked(faq, "primary_navigation"),
      ranked(listing, "sitemap"),
    ];

    // Listing accepted first with a huge body; FAQ accepted later.
    const accepted = [
      page({
        url: listing,
        text: "L".repeat(10_000),
        provenance: "sitemap",
        rankedPlanIndex: 2,
      }),
      page({
        url: home,
        text: "H".repeat(1_000),
        pageType: "homepage",
        provenance: "unknown",
        rankedPlanIndex: 0,
      }),
      page({
        url: faq,
        text: "F".repeat(2_000),
        pageType: "faq",
        provenance: "primary_navigation",
        rankedPlanIndex: 1,
      }),
    ];

    const result = selectBoundedCorpusPages({
      pages: accepted,
      homepageUrl: home,
      rankedSelected,
      maxPages: 50,
      // Exactly fills homepage (1000) + FAQ (2000); listing must be excluded.
      maxCombinedChars: 3_000,
    });

    assert.equal(result.pages[0]?.finalUrl, home);
    assert.equal(result.pages[1]?.finalUrl, faq);
    assert.ok(
      result.pages.some((entry) => entry.finalUrl === faq),
      "FAQ primary-nav must survive char bind",
    );
    assert.equal(result.pages.length, 2);
    assert.equal(result.primaryNavigationIncluded, 1);
    assert.equal(result.stopReason, "char_cap");
    assert.ok(result.excludedByCharCap.includes(listing));
  });

  it("async completion order cannot displace navigation pages in ordering", () => {
    const home = "https://example.test/";
    const navA = "https://example.test/about/";
    const navB = "https://example.test/contact/";
    const other = "https://example.test/blog/post-1/";
    const rankedSelected = [
      ranked(home, "unknown"),
      ranked(navA, "primary_navigation"),
      ranked(navB, "primary_navigation"),
      ranked(other, "sitemap"),
    ];
    const accepted = [
      page({ url: other, text: "o", provenance: "sitemap", rankedPlanIndex: 3 }),
      page({
        url: navB,
        text: "b",
        provenance: "primary_navigation",
        rankedPlanIndex: 2,
      }),
      page({
        url: home,
        text: "h",
        pageType: "homepage",
        provenance: "unknown",
        rankedPlanIndex: 0,
      }),
      page({
        url: navA,
        text: "a",
        provenance: "primary_navigation",
        rankedPlanIndex: 1,
      }),
    ];

    const ordered = orderAcceptedPagesForCorpus({
      pages: accepted,
      homepageUrl: home,
      rankedSelected,
    }).map((entry) => entry.finalUrl);

    assert.deepEqual(ordered, [home, navA, navB, other]);
  });

  it("diagnostics distinguish pre-bound acceptance from corpus inclusion", () => {
    const home = "https://example.test/";
    const pages = Array.from({ length: 10 }, (_, i) => {
      const url = i === 0 ? home : `https://example.test/p-${i}/`;
      return page({
        url,
        text: "z".repeat(1_000),
        pageType: i === 0 ? "homepage" : "evergreen",
        provenance: i === 0 ? "unknown" : "sitemap",
        rankedPlanIndex: i,
      });
    });
    const rankedSelected = pages.map((entry, index) =>
      ranked(entry.url, index === 0 ? "unknown" : "sitemap"),
    );

    const result = selectBoundedCorpusPages({
      pages,
      homepageUrl: home,
      rankedSelected,
      maxPages: 50,
      maxCombinedChars: 3_500,
    });

    assert.equal(result.pagesAcceptedBeforeCorpusBound, 10);
    assert.ok(result.pagesIncludedInCorpus < 10);
    assert.equal(result.stopReason, "char_cap");
    assert.equal(
      result.pagesIncludedInCorpus,
      result.pages.length,
    );
  });
});
