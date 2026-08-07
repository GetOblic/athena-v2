import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  assessTechnicalSeoEvidenceSufficiency,
  deepCrawledPageHasTechnicalEvidence,
  websiteIntelligenceHasTechnicalSeoEvidence,
} from "../../services/seo/seoTechnicalEvidence";

function baseIntel(
  pages: DeepWebsiteIntelligence["pages"],
): DeepWebsiteIntelligence {
  return {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-07T00:00:00.000Z",
    pages_analyzed: pages.length,
    pages,
    business_knowledge: emptyBusinessKnowledge(),
    crawl_summary: {
      pages_analyzed: pages.length,
      services_discovered: 0,
      faqs_discovered: 0,
      testimonials_discovered: 0,
      team_pages_discovered: 0,
      commercial_pages_discovered: 0,
    },
    positioning: "",
    products: "",
    services: "",
    about: "",
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

describe("technical SEO evidence sufficiency", () => {
  it("rejects legacy thin Website Intelligence pages", () => {
    const legacy = baseIntel([
      {
        url: "https://example.com/",
        title: "Home",
        page_type: "homepage",
        excerpt: "Welcome",
      },
      {
        url: "https://example.com/about",
        title: "About",
        page_type: "about",
        excerpt: "About us",
      },
      {
        url: "https://example.com/services",
        title: "Services",
        page_type: "services",
        excerpt: "Services",
      },
    ]);
    assert.equal(websiteIntelligenceHasTechnicalSeoEvidence(legacy), false);
    assert.equal(deepCrawledPageHasTechnicalEvidence(legacy.pages[0]!), false);
    const assessment = assessTechnicalSeoEvidenceSufficiency(legacy);
    assert.equal(assessment.sufficient, false);
    assert.equal(assessment.code, "TECHNICAL_SEO_EVIDENCE_INSUFFICIENT");
    assert.match(assessment.message ?? "", /refresh|Deep Scrape|Website Intelligence/i);
  });

  it("accepts V23 technical evidence pages", () => {
    const enriched = baseIntel([
      {
        url: "https://example.com/",
        title: "Home",
        page_type: "homepage",
        excerpt: "Welcome",
        meta_description: "Clinic home",
        self_canonical: true,
        http_status: 200,
        content_chars: 1200,
        headings: [{ level: 1, text: "Welcome" }],
      },
      {
        url: "https://example.com/about",
        title: "About",
        page_type: "about",
        excerpt: "About us",
        meta_description: null,
        self_canonical: true,
        http_status: 200,
        content_chars: 800,
      },
      {
        url: "https://example.com/services",
        title: "Services",
        page_type: "services",
        excerpt: "Services",
        meta_description: "Services",
        self_canonical: false,
        http_status: 200,
        content_chars: 900,
      },
    ]);
    assert.equal(websiteIntelligenceHasTechnicalSeoEvidence(enriched), true);
    assert.equal(assessTechnicalSeoEvidenceSufficiency(enriched).sufficient, true);
  });
});
