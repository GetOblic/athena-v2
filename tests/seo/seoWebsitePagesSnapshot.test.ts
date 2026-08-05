import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEEP_WEBSITE_INTELLIGENCE_PROVIDER } from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  emptySeoWebsitePagesAnalyzed,
  snapshotSeoWebsitePagesAnalyzed,
} from "../../services/seo/seoWebsitePagesSnapshot";
import { SEO_WEBSITE_PAGES_ANALYZED_MAX } from "../../services/seo/seoReportTypes";

function deepIntel(pageCount: number) {
  return {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-05T12:00:00.000Z",
    pages_analyzed: pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      title: i === 0 ? null : `Page ${i}`,
      page_type: i === 1 ? "" : i % 2 === 0 ? "services" : "about",
      excerpt: `excerpt ${i}`,
    })),
    business_knowledge: {
      positioning: "p",
      about: "a",
      products: "",
      services: "",
      solutions: "",
      pricing: "",
      training: "",
      faq: "",
      team: "",
      testimonials: "",
      case_studies: "",
      target_audience: "",
      messaging: "",
      value_proposition: "",
      differentiators: "",
      trust_signals: "",
      contact_information: "",
      brand_tone: "",
      cta: "",
    },
    crawl_summary: {
      pages_analyzed: pageCount,
      services_discovered: 0,
      faqs_discovered: 0,
      testimonials_discovered: 0,
      team_pages_discovered: 0,
      commercial_pages_discovered: 0,
    },
    positioning: "p",
    products: "",
    services: "",
    about: "a",
    target_audience: "",
    messaging: "",
    value_proposition: "",
    cta: "",
    differentiators: "",
    trust_signals: "",
    contact_information: "",
    brand_tone: "",
    headings: "",
    paragraphs: "",
  };
}

describe("seo website pages snapshot", () => {
  it("preserves stored Deep Scrape page ordering and handles missing fields", () => {
    const snapshot = snapshotSeoWebsitePagesAnalyzed(deepIntel(3));
    assert.equal(snapshot.pagesAnalyzedCount, 3);
    assert.equal(snapshot.sourceUrl, "https://example.com");
    assert.equal(snapshot.scrapedAt, "2026-08-05T12:00:00.000Z");
    assert.equal(snapshot.pages.length, 3);
    assert.equal(snapshot.pages[0]?.title, null);
    assert.equal(snapshot.pages[0]?.url, "https://example.com/page-0");
    assert.equal(snapshot.pages[0]?.pageType, "services");
    assert.equal(snapshot.pages[1]?.pageType, null);
    assert.deepEqual(
      snapshot.pages.map((page) => page.url),
      [
        "https://example.com/page-0",
        "https://example.com/page-1",
        "https://example.com/page-2",
      ],
    );
  });

  it("caps snapshot at 50 pages for shared deep_v1 capacity", () => {
    const snapshot = snapshotSeoWebsitePagesAnalyzed(deepIntel(60));
    assert.equal(SEO_WEBSITE_PAGES_ANALYZED_MAX, 50);
    assert.equal(snapshot.pages.length, 50);
    assert.equal(snapshot.pagesAnalyzedCount, 60);
    assert.equal(snapshot.pages[49]?.url, "https://example.com/page-49");
  });

  it("returns empty snapshot when deep intelligence is unavailable", () => {
    assert.deepEqual(snapshotSeoWebsitePagesAnalyzed(null), emptySeoWebsitePagesAnalyzed());
  });
});
