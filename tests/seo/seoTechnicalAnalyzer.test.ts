import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { analyzeTechnicalSeoEvidence } from "../../services/seo/seoTechnicalAnalyzer";

function intel(pages: DeepWebsiteIntelligence["pages"]): DeepWebsiteIntelligence {
  return {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-07T00:00:00.000Z",
    pages_analyzed: pages.length,
    pages,
    business_knowledge: emptyBusinessKnowledge(),
    crawl_summary: {
      pages_analyzed: pages.length,
      services_discovered: 1,
      faqs_discovered: 0,
      testimonials_discovered: 0,
      team_pages_discovered: 0,
      commercial_pages_discovered: 1,
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

describe("deterministic technical SEO analyzer", () => {
  const evidence = analyzeTechnicalSeoEvidence(
    intel([
      {
        url: "https://example.com/",
        title: "Same Title",
        page_type: "homepage",
        excerpt: "Home",
        meta_description: "Same description for testing duplicates",
        headings: [{ level: 1, text: "Home" }],
        canonical_url: "https://example.com/",
        self_canonical: true,
        http_status: 200,
        redirect_count: 0,
        content_chars: 1500,
        schema_summary: { types: ["Organization"], raw_json_ld_count: 1 },
        internal_link_count: 8,
        robots_meta: "index,follow",
        image_alt: { total: 4, with_alt: 2, missing_alt: 2 },
      },
      {
        url: "https://example.com/a",
        title: "Same Title",
        page_type: "about",
        excerpt: "About",
        meta_description: "Same description for testing duplicates",
        headings: [
          { level: 1, text: "About" },
          { level: 1, text: "Extra" },
        ],
        canonical_url: "https://example.com/",
        self_canonical: false,
        http_status: 200,
        redirect_count: 1,
        content_chars: 120,
        schema_summary: { types: [], raw_json_ld_count: 0 },
        internal_link_count: 1,
        robots_meta: "noindex",
        image_alt: { total: 2, with_alt: 0, missing_alt: 2 },
      },
      {
        url: "https://example.com/b",
        title: null,
        page_type: "services",
        excerpt: "Services",
        meta_description: null,
        headings: [],
        canonical_url: null,
        self_canonical: true,
        http_status: 404,
        redirect_count: 0,
        content_chars: 900,
        internal_link_count: 3,
      },
    ]),
  );

  it("computes metadata findings", () => {
    assert.equal(evidence.metadata.missingTitles, 1);
    assert.equal(evidence.metadata.missingMetaDescriptions, 1);
    assert.equal(evidence.metadata.duplicateTitles[0]?.count, 2);
    assert.equal(evidence.metadata.duplicateMetaDescriptions[0]?.count, 2);
  });

  it("computes heading findings", () => {
    assert.equal(evidence.headings.missingH1, 1);
    assert.equal(evidence.headings.multipleH1, 1);
  });

  it("computes canonical findings", () => {
    assert.equal(evidence.canonicals.nonSelfCanonical, 1);
    assert.equal(evidence.canonicals.missingCanonical, 1);
    assert.equal(evidence.canonicals.inconsistentCandidates.length, 1);
  });

  it("computes status/redirect findings", () => {
    assert.equal(evidence.crawl.httpStatusDistribution["200"], 2);
    assert.equal(evidence.crawl.httpStatusDistribution["404"], 1);
    assert.equal(evidence.crawl.redirectPages, 1);
    assert.equal(evidence.crawl.singleHopFinal200Pages, 1);
    assert.equal(evidence.crawl.redirectChainCandidatePages, 0);
    assert.equal(evidence.crawl.pageTypeDistribution.homepage, 1);
  });

  it("computes schema and image-alt findings", () => {
    assert.equal(evidence.schema.pagesWithSchema, 1);
    assert.equal(evidence.schema.typeDistribution.Organization, 1);
    assert.equal(evidence.images.imagesMissingAlt, 4);
    assert.ok(evidence.images.altCoveragePercent != null);
  });

  it("flags thin content and weak linking only with evidence", () => {
    assert.equal(evidence.content.thinContentCandidates.length, 1);
    assert.equal(evidence.internalLinks.weakLinkingCandidates[0]?.url, "https://example.com/a");
    assert.equal(evidence.robots.noindexCandidates.length, 1);
  });
});
