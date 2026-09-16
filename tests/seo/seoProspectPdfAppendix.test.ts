import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { en } from "../../lib/tenantI18n/messages/en";
import {
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";
import { flattenSeoProspectPdfDocument } from "../../services/seo/seoProspectPdf/seoProspectPdfTypes";
import { renderSeoProspectPdf } from "../../services/seo/seoProspectPdf/renderSeoProspectPdf";
import { buildTechnicalHealthPdfModel } from "../../services/seo/seoProspectPdf/technicalHealthPdfAdapter";
import { buildVisibilityStrategyPdfModel } from "../../services/seo/seoProspectPdf/visibilityStrategyPdfAdapter";
import { analyzeTechnicalSeoEvidence } from "../../services/seo/seoTechnicalAnalyzer";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const LONG_URL =
  "https://example.com/services/strategy/diagnostic-and-implementation-support/very/long/path/that-should-wrap-safely";

function technicalCoverage() {
  return analyzeTechnicalSeoEvidence({
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-07T00:00:00.000Z",
    pages_analyzed: 2,
    pages: [
      {
        url: LONG_URL,
        title: "FAQ",
        page_type: "faq",
        excerpt: "FAQ",
        meta_description:
          "A long current meta description used to verify appendix comparison text is preserved.",
        headings: [{ level: 1, text: "Questions" }],
        canonical_url: "https://example.com/faq",
        self_canonical: false,
        http_status: 200,
        redirect_count: 0,
        content_chars: 1800,
        schema_summary: { types: ["FAQPage"], raw_json_ld_count: 1 },
        internal_link_count: 4,
        image_alt: { total: 3, with_alt: 1, missing_alt: 2 },
      },
      {
        url: "https://example.com/guide",
        title: "Evergreen guide",
        page_type: "evergreen",
        excerpt: "Guide",
        meta_description: "Guide description",
        headings: [{ level: 1, text: "Guide" }],
        canonical_url: "https://example.com/guide",
        self_canonical: true,
        http_status: 200,
        redirect_count: 0,
        content_chars: 2200,
        schema_summary: { types: ["Article"], raw_json_ld_count: 1 },
        internal_link_count: 6,
        image_alt: { total: 1, with_alt: 1, missing_alt: 0 },
      },
    ],
    business_knowledge: emptyBusinessKnowledge(),
    crawl_summary: {
      pages_analyzed: 2,
      services_discovered: 1,
      faqs_discovered: 1,
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
  });
}

function coveragePackage(): SeoTechnicalPackage {
  return {
    generationType: "technical",
    reportName: "Technical SEO Report",
    briefMode: "inferred",
    executiveEvaluation: {
      overallAssessment: "Solid foundations with metadata gaps.",
      strengths: ["Most pages return 200"],
      criticalIssues: ["Image alt coverage is incomplete"],
      warnings: ["Schema is thin"],
      remediationPriorities: ["Fix alt text first"],
      summary: "Address metadata and image alt gaps next.",
    },
    technicalCoverage: technicalCoverage(),
    pageMetadata: [
      {
        url: LONG_URL,
        currentTitle: "FAQ",
        recommendedTitle: "Clinic FAQ | Example",
        currentDescription:
          "A long current meta description used to verify appendix comparison text is preserved.",
        recommendedDescription:
          "Recommended FAQ description that buyers can scan quickly.",
        h1Observation: "H1: Questions",
        recommendedH1: "Frequently asked questions",
        canonicalObservation: "Non-self canonical → https://example.com/faq",
        robotsObservation: "robots: index,follow",
        httpStatus: 301,
        issueFlags: [
          "title_long",
          "meta_description_long",
          "missing_h1",
          "redirect_chain_candidate",
          "images_missing_alt",
        ],
      },
      {
        url: "https://example.com/guide",
        currentTitle: "Evergreen guide",
        recommendedTitle: null,
        currentDescription: "Guide description",
        recommendedDescription: null,
        h1Observation: "H1: Guide",
        recommendedH1: null,
        canonicalObservation: "Self-canonical",
        robotsObservation: null,
        httpStatus: 200,
        issueFlags: [],
      },
    ],
    siteArchitecture: {
      architectureFindings: ["Homepage links to key service pages"],
      linkingEvidence: ["Average internal links are healthy"],
      weaklyLinkedCandidates: [],
      recommendedLinks: [
        {
          fromUrl: "https://example.com/",
          toUrl: "https://example.com/services",
          recommendedAnchor: "Explore services",
          rationale: "Strengthen commercial path",
        },
      ],
      summary: "Architecture is workable.",
    },
    contentHtmlFindings: {
      headingFindings: ["H1 coverage is strong"],
      metadataFindings: ["Titles are present"],
      contentSizeFindings: ["No thin-content candidates"],
      structuralRecommendations: ["Keep one H1 per page"],
      summary: "HTML structure is generally sound.",
    },
    structuredData: {
      detectedSchemaEvidence: ["Organization schema on homepage"],
      missingOpportunityAssessment: "Service pages lack Service schema",
      recommendedSchemaTypes: ["Service"],
      implementationGuidance: ["Add JSON-LD Service nodes"],
      exampleSnippets: ['{"@type":"Service","name":"Example"}'],
      summary: "Schema opportunity exists.",
    },
    imageSeo: {
      altCoverageSummary: "Half of sampled images lack alt text",
      missingAltFindings: ["Homepage has images missing alt"],
      remediationGuidance: ["Add descriptive alt text"],
      summary: "Improve image accessibility.",
    },
    crawlFindings: {
      statusFindings: ["All analyzed pages returned HTTP 200"],
      redirectFindings: ["No multi-hop redirects detected"],
      canonicalFindings: ["Canonicals are self-referencing"],
      robotsFindings: ["No noindex directives detected"],
      summary: "Crawl health looks stable.",
    },
    actionPlan: {
      overview: "Prioritize metadata completeness.",
      items: [
        {
          priority: "Critical",
          title: "Close metadata gaps",
          affectedPages: [LONG_URL],
          evidence: "Deterministic metadata coverage findings",
          reason: "Missing or weak metadata reduces clarity",
          recommendedAction: "Implement recommended titles",
        },
      ],
    },
    implementationAssets: {
      metadataTableNotes: "Use pageMetadata recommendations.",
      headingRecommendations: ["Keep a single descriptive H1"],
      internalLinkPlan: ["Link About to Services"],
      schemaRecommendations: ["Add Service schema"],
      redirectRecommendations: [],
      developerRemediationInstructions: ["Update title/meta tags"],
    },
    disclaimer: SEO_TECHNICAL_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 2,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-07T00:00:00.000Z",
      pages: [
        {
          title: "Frequently asked questions",
          url: LONG_URL,
          pageType: "faq",
        },
        {
          title: "Evergreen guide",
          url: "https://example.com/guide",
          pageType: "evergreen",
        },
      ],
    },
  };
}

function buildModel(pkg = coveragePackage()) {
  return buildTechnicalHealthPdfModel({
    pkg,
    messages: en,
    language: "en",
    reportDateIso: "2026-09-16T00:00:00.000Z",
  });
}

const parties = {
  subject: { organizationId: "org-subject", name: "Prospect Clinic" },
  sender: { organizationId: "org-sender", name: "Licensee Studio" },
};

describe("SEO-PDF-3A technical appendix consolidation", () => {
  it("preserves every available page-level field in one appendix inventory", () => {
    const pkg = coveragePackage();
    const model = buildModel(pkg);
    const flat = flattenSeoProspectPdfDocument(model);
    const appendix = model.sections.find((section) => section.role === "appendix");
    assert.ok(appendix);
    assert.equal(appendix?.title, "Page-Level Technical Analysis");
    assert.match(flat, /Frequently asked questions/);
    assert.match(flat, new RegExp(LONG_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(flat, /faq/);
    assert.match(flat, /301/);
    assert.match(flat, /FAQ/);
    assert.match(flat, /Clinic FAQ \| Example/);
    assert.match(
      flat,
      /A long current meta description used to verify appendix comparison text is preserved/,
    );
    assert.match(
      flat,
      /Recommended FAQ description that buyers can scan quickly/,
    );
    assert.match(flat, /H1: Questions/);
    assert.match(flat, /Frequently asked questions/);
    assert.match(flat, /Non-self canonical → https:\/\/example.com\/faq/);
    assert.match(flat, /robots: index,follow/);
    assert.match(flat, /title_long/);
    assert.match(flat, /meta_description_long/);
    assert.match(flat, /missing_h1/);
    assert.match(flat, /redirect_chain_candidate/);
    assert.match(flat, /images_missing_alt/);
    assert.match(flat, /evergreen/);
    assert.match(flat, /Evergreen guide/);
    assert.match(flat, /Self-canonical/);
    assert.doesNotMatch(flat, /\bN\/A\b/);
    assert.doesNotMatch(flat, /No change required/);
    assert.doesNotMatch(flat, /Website Pages Analyzed/);
    assert.equal(
      appendix?.blocks.filter((block) => block.type === "pageRecord").length,
      2,
    );
  });

  it("keeps consulting narrative order and skips section 06 in the main body", () => {
    const model = buildModel();
    const titles = model.sections.map((section) => section.title);
    const indexOf = (title: string) => {
      const index = titles.indexOf(title);
      assert.ok(index >= 0, `missing section: ${title}`);
      return index;
    };

    assert.ok(indexOf("Executive Summary") < indexOf("On-page Technical Completeness"));
    assert.ok(
      indexOf("On-page Technical Completeness") < indexOf("Executive Evaluation"),
    );
    assert.ok(
      indexOf("Executive Evaluation") <
        indexOf("Recommended Technical Improvements"),
    );
    assert.ok(
      indexOf("Recommended Technical Improvements") <
        indexOf("What Athena Found"),
    );
    assert.ok(
      indexOf("What Athena Found") <
        indexOf("Site architecture & internal linking"),
    );
    assert.ok(
      indexOf("Site architecture & internal linking") <
        indexOf("Content / HTML findings"),
    );
    assert.ok(
      indexOf("Content / HTML findings") < indexOf("Structured data"),
    );
    assert.ok(indexOf("Structured data") < indexOf("Image SEO"));
    assert.ok(indexOf("Image SEO") < indexOf("Crawl findings"));
    assert.ok(indexOf("Crawl findings") < indexOf("Implementation Notes"));
    assert.ok(indexOf("Implementation Notes") < indexOf("About this analysis"));
    assert.ok(
      indexOf("About this analysis") <
        indexOf("Page-Level Technical Analysis"),
    );
    assert.equal(model.sections.at(-1)?.title, "Page-Level Technical Analysis");
    assert.equal(model.sections.find((section) => section.id === "found")?.number, 5);
    assert.equal(
      model.sections.find((section) => section.id === "architecture")?.number,
      7,
    );
    assert.equal(
      model.sections.find((section) => section.id === "implementation")?.number,
      12,
    );
    assert.ok(!model.sections.some((section) => section.number === 6));
    assert.ok(!model.sections.some((section) => section.id === "page-metadata"));
    assert.doesNotMatch(titles.join("\n"), /Page-level metadata/);
  });

  it("emits exactly one page-inventory appendix for Technical Health", () => {
    const model = buildModel();
    const appendices = model.sections.filter((section) => section.role === "appendix");
    const urls = appendices.flatMap((section) =>
      section.blocks.flatMap((block) => {
        if (block.type === "pageRecord") return [block.url];
        if (block.type === "pageCard") {
          return block.entries
            .filter((entry) => /url/i.test(entry.label))
            .map((entry) => entry.value);
        }
        return [];
      }),
    );
    assert.equal(appendices.length, 1);
    assert.equal(appendices[0]?.title, "Page-Level Technical Analysis");
    assert.equal(new Set(urls).size, urls.length);
    assert.equal(model.sections.filter((section) => section.id === "pages").length, 0);
    assert.equal(
      model.sections.filter((section) => section.id === "page-metadata").length,
      0,
    );
  });

  it("does not change Visibility Strategy's Website Pages appendix", () => {
    const model = buildVisibilityStrategyPdfModel({
      pkg: {
        generationType: "intelligence",
        reportName: "Visibility & Authority Report",
        briefMode: "inferred",
        executiveAssessment: {
          overallAssessment: "Strong service signal, weak intent coverage.",
          strengths: ["Clear positioning"],
          weaknesses: ["Thin FAQ coverage"],
          seoReadiness: "Developing",
          businessVisibilityAssessment: "Buyers can understand the offer.",
          summary: "Prioritize intent and trust content.",
        },
        contentCoverage: {
          wellCoveredServices: ["Strategy consulting"],
          weaklyCoveredServices: ["Implementation support"],
          missingServices: ["Offer clarity workshops"],
          missingCustomerQuestions: ["How long until results?"],
          missingTrustContent: ["Named case studies"],
          missingEducationalContent: ["Buyer guides"],
          missingConversionContent: ["Booking landing page"],
          analysis: "Services and about pages dominate.",
          athenaEvidence: [],
        },
        customerIntent: {
          representedIntents: ["Learn about services"],
          missingIntents: [],
          painPointGaps: ["Fragmented messaging"],
          buyerIntentSummary: "Intent is more commercial than educational.",
          athenaEvidence: [],
        },
        commercialOpportunities: {
          opportunities: [],
          summary: "Focus on FAQ and proof.",
        },
        trustAndAuthority: {
          trustSignals: "Limited beyond brand tone.",
          testimonials: "Sparse.",
          caseStudies: "Missing.",
          expertPositioning: "Present in about/messaging.",
          authorityMessaging: "Strong in positioning.",
          differentiation: "Clear operator-led angle.",
          callsToAction: "Present but generic.",
          consistency: "Messaging is consistent.",
          recommendations: ["Publish two case studies."],
          athenaEvidence: [],
        },
        ninetyDayRoadmap: {
          overview: "Close intent and trust gaps.",
          items: [],
        },
        disclaimer:
          "This SEO Intelligence report is inferred from Athena's organization intelligence.",
        websitePagesAnalyzed: {
          pagesAnalyzedCount: 1,
          sourceUrl: "https://example.com",
          scrapedAt: "2026-08-05T00:00:00.000Z",
          pages: [
            {
              title: "Home",
              url: "https://example.com/",
              pageType: "homepage",
            },
          ],
        },
      },
      messages: en,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
    });
    const flat = flattenSeoProspectPdfDocument(model);
    const appendices = model.sections.filter((section) => section.role === "appendix");
    assert.equal(appendices.length, 1);
    assert.equal(appendices[0]?.title, "Website Pages Analyzed");
    assert.match(flat, /Website Pages Analyzed/);
    assert.doesNotMatch(flat, /Page-Level Technical Analysis/);
    assert.equal(model.sections.at(-1)?.role, "methodology");
  });

  it("renders a denser Technical appendix without a second inventory", async () => {
    const pkg = coveragePackage();
    const pdf = await renderSeoProspectPdf({
      pkg,
      parties,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
      brand: { identity: null, logo: null, profilePicture: null },
    });
    assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [])
      .length;
    assert.ok(pageCount >= 4);
    assert.ok(pageCount <= 12);
  });
});
