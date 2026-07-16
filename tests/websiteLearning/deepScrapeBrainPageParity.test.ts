import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  formatDeepIntelligenceForBrainPrompt,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  assertDeepScrapePageParity,
  BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED,
  buildPromotableDeepWebsiteIntelligence,
  countDeepPages,
  DeepScrapePageParityError,
  listValidDeepPages,
  toCompactDeepCrawledPages,
} from "../../services/websiteLearning/deepScrape/deepScrapePageContract";
import { formatDeepScrapeErrorMessage } from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";

const ROOT = path.join(__dirname, "../..");

function makeIntel(pages: Array<{ url: string; title: string; page_type: string; excerpt: string }>): DeepWebsiteIntelligence {
  return {
    provider: "deep_v1",
    url: "https://example.com",
    scraped_at: new Date().toISOString(),
    pages_analyzed: pages.length,
    pages,
    business_knowledge: {
      positioning: "Training",
      about: "About",
      products: "",
      services: "Services",
      solutions: "",
      pricing: "",
      training: "Courses",
      faq: "",
      team: "",
      testimonials: "",
      case_studies: "",
      target_audience: "Pros",
      messaging: "",
      value_proposition: "Value",
      differentiators: "",
      trust_signals: "",
      contact_information: "hi@example.com",
      brand_tone: "Warm",
      cta: "Book",
    },
    crawl_summary: {
      pages_analyzed: pages.length,
      services_discovered: 1,
      faqs_discovered: 0,
      testimonials_discovered: 0,
      team_pages_discovered: 0,
      commercial_pages_discovered: 1,
    },
    positioning: "Training",
    products: "",
    services: "Services",
    about: "About",
    target_audience: "Pros",
    messaging: "",
    value_proposition: "Value",
    cta: "Book",
    differentiators: "",
    trust_signals: "",
    contact_information: "hi@example.com",
    brand_tone: "Warm",
    headings: pages.map((page) => page.title).join("\n"),
    paragraphs: "About",
  };
}

describe("Brain deep scrape multi-page parity", () => {
  it("1. three accepted distinct pages survive compact serialization and promotion payload", () => {
    const synthesisInput = [
      {
        url: "https://example.com/",
        title: "Home",
        pageType: "homepage",
        text: "Welcome homepage content for tattoo coaching.",
      },
      {
        url: "https://example.com/services",
        title: "Services",
        pageType: "services",
        text: "Services page with coaching packages and pricing notes.",
      },
      {
        url: "https://example.com/training",
        title: "Training",
        pageType: "training",
        text: "Training curriculum details for artists.",
      },
    ];

    const compact = toCompactDeepCrawledPages(synthesisInput);
    assert.equal(compact.length, 3);
    assert.equal(countDeepPages(compact), 3);

    const intel = makeIntel(
      compact.map((page) => ({
        url: page.url,
        title: page.title ?? "",
        page_type: page.page_type,
        excerpt: page.excerpt,
      })),
    );
    const promoted = buildPromotableDeepWebsiteIntelligence(intel);
    assert.equal(promoted.pages.length, 3);
    assert.equal(promoted.pages_analyzed, 3);
    assert.equal(promoted.crawl_summary.pages_analyzed, 3);
    assert.deepEqual(
      promoted.pages.map((page) => new URL(page.url).pathname),
      ["/", "/services", "/training"],
    );

    assertDeepScrapePageParity({
      acceptedPageCount: 3,
      synthesisInputPageCount: 3,
      crawlResultPageCount: 3,
      promotedPageCount: 3,
      lastDeepScrapePages: 3,
      promotedPages: promoted.pages,
    });

    const brainPrompt = formatDeepIntelligenceForBrainPrompt(promoted);
    assert.match(brainPrompt, /3 pages analyzed/);
    assert.match(brainPrompt, /\/services/);
    assert.match(brainPrompt, /\/training/);
    assert.match(brainPrompt, /CRAWLED PAGES/);
  });

  it("2. Prospect promotion helper uses the same multi-page builder (no Brain-only fork)", () => {
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /buildPromotableDeepWebsiteIntelligence/);
    assert.match(executor, /promoteProspectIntelligence/);
    assert.match(executor, /promoteBrainIntelligence/);
    // Shared helper — not a duplicated Brain-only serializer.
    assert.equal(
      (executor.match(/buildPromotableDeepWebsiteIntelligence/g) || []).length >= 2,
      true,
    );
  });

  it("3. duplicate normalized URLs collapse to distinct count of two", () => {
    const pages = [
      {
        url: "https://example.com/services",
        title: "Services",
        page_type: "services",
        excerpt: "A",
      },
      {
        url: "https://example.com/services/",
        title: "Services Dup",
        page_type: "services",
        excerpt: "B",
      },
      {
        url: "https://example.com/training",
        title: "Training",
        page_type: "training",
        excerpt: "C",
      },
    ];
    const distinct = listValidDeepPages(pages);
    assert.equal(distinct.length, 2);
    const promoted = buildPromotableDeepWebsiteIntelligence(makeIntel(pages));
    assert.equal(promoted.pages_analyzed, 2);
  });

  it("4. legitimate one-page brochure remains valid", () => {
    const intel = makeIntel([
      {
        url: "https://brochure.example.com/",
        title: "Brochure",
        page_type: "homepage",
        excerpt: "Single page business site",
      },
    ]);
    const promoted = buildPromotableDeepWebsiteIntelligence(intel);
    assert.equal(promoted.pages_analyzed, 1);
    assertDeepScrapePageParity({
      acceptedPageCount: 1,
      synthesisInputPageCount: 1,
      crawlResultPageCount: 1,
      promotedPageCount: 1,
      lastDeepScrapePages: 1,
      promotedPages: promoted.pages,
    });
  });

  it("5. accidental multi→one collapse throws BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED", () => {
    assert.throws(
      () =>
        assertDeepScrapePageParity({
          acceptedPageCount: 3,
          synthesisInputPageCount: 3,
          crawlResultPageCount: 3,
          promotedPageCount: 1,
          promotedPages: [
            {
              url: "https://example.com/",
              title: "Home",
              page_type: "homepage",
              excerpt: "Only homepage",
            },
          ],
        }),
      (error: unknown) =>
        error instanceof DeepScrapePageParityError &&
        error.code === BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED,
    );
  });

  it("6. parity failure is terminal / non-retryable in executor classification", () => {
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    const types = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeJobTypes.ts"),
      "utf8",
    );
    assert.match(executor, /BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED/);
    assert.match(
      executor,
      /BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED[\s\S]{0,120}\? false/,
    );
    assert.match(
      formatDeepScrapeErrorMessage("BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED"),
      /multi-page website corpus could not be saved consistently/i,
    );
    assert.match(types, /BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED/);
  });

  it("7. legacy one-page deep intelligence still formats for Brain retrain", () => {
    const legacy = makeIntel([
      {
        url: "https://legacy.example.com/",
        title: "Legacy",
        page_type: "homepage",
        excerpt: "Old single-page deep scrape",
      },
    ]);
    const prompt = formatDeepIntelligenceForBrainPrompt(legacy);
    assert.match(prompt, /1 pages analyzed/);
    assert.match(prompt, /legacy\.example\.com/);
    assert.match(prompt, /Old single-page deep scrape/);
  });

  it("Brain promote verifies readback and last_deep_scrape_pages uses promoted count", () => {
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /brain_deep_scrape_page_parity_verified/);
    assert.match(executor, /brain_deep_scrape_identity_promoted/);
    assert.match(executor, /select\(\"website_intelligence\"\)/);
    assert.match(executor, /last_deep_scrape_pages: promotedPageCount/);
    assert.match(executor, /readDeepIntelligencePageCount/);
    // Collapsed checkpoint must not be reused.
    assert.match(executor, /progressAccepted > 1 && pageCount <= 1/);
  });

  it("synthesize no longer uses trailing object spread that can overwrite pages", () => {
    const synthesize = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/synthesize.ts"),
      "utf8",
    );
    assert.match(synthesize, /toCompactDeepCrawledPages/);
    assert.doesNotMatch(synthesize, /\.\.\.flat/);
  });

  it("observability registers Brain page-boundary events", () => {
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    for (const event of [
      "brain_deep_scrape_pages_collected",
      "brain_deep_scrape_synthesis_input_prepared",
      "brain_deep_scrape_crawl_result_persisted",
      "brain_deep_scrape_identity_promoted",
      "brain_deep_scrape_page_parity_verified",
      "brain_deep_scrape_page_parity_failed",
    ]) {
      assert.match(observability, new RegExp(`"${event}"`));
    }
  });
});
