import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { en } from "../../lib/tenantI18n/messages/en";
import {
  SEO_REPORT_DISCLAIMER,
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoIntelligencePackage,
  type SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";
import { flattenSeoProspectPdfDocument } from "../../services/seo/seoProspectPdf/seoProspectPdfTypes";
import { renderSeoProspectPdf } from "../../services/seo/seoProspectPdf/renderSeoProspectPdf";
import { buildVisibilityStrategyPdfModel, visibilityStrategyPdfContainsForbidden } from "../../services/seo/seoProspectPdf/visibilityStrategyPdfAdapter";
import { buildTechnicalHealthPdfModel, technicalHealthPdfContainsForbidden } from "../../services/seo/seoProspectPdf/technicalHealthPdfAdapter";
import { analyzeTechnicalSeoEvidence } from "../../services/seo/seoTechnicalAnalyzer";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

function intelligencePackage(): SeoIntelligencePackage {
  return {
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
      athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
    },
    customerIntent: {
      representedIntents: ["Learn about services"],
      missingIntents: [
        {
          intent: "Compare diagnostic approaches",
          source: "Persona: Growth founders",
          websiteGap: "No comparison content",
          recommendation: "Add comparison page",
        },
      ],
      painPointGaps: ["Fragmented messaging"],
      buyerIntentSummary: "Intent is more commercial than educational.",
      athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
    },
    commercialOpportunities: {
      opportunities: [
        {
          contentType: "FAQ page",
          title: "Strategy call FAQ",
          rationale: "Timing questions keep appearing.",
          expectedImpact: "Capture ready buyers",
          athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
        },
      ],
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
      athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
    },
    ninetyDayRoadmap: {
      overview: "Close intent and trust gaps.",
      items: [
        {
          priority: "P0",
          recommendation: "Publish FAQ covering booking questions",
          reason: "High-intent questions are missing",
          expectedBusinessImpact: "Better capture of ready buyers",
          estimatedEffort: "medium",
          athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
        },
        {
          priority: "P3",
          recommendation: "Create an educational guide",
          reason: "Educational gaps remain",
          expectedBusinessImpact: "Earlier-funnel visibility",
          estimatedEffort: "low",
          athenaEvidence: ["INTERNAL_SIGNAL_SHOULD_NOT_PRINT"],
        },
      ],
    },
    disclaimer: SEO_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 1,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-05T00:00:00.000Z",
      pages: [
        {
          title: "Home",
          url: "https://example.com/very/long/path/that-should-wrap-safely",
          pageType: "homepage",
        },
      ],
    },
  };
}

function technicalPackage(): SeoTechnicalPackage {
  const technicalCoverage = analyzeTechnicalSeoEvidence({
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-07T00:00:00.000Z",
    pages_analyzed: 1,
    pages: [
      {
        url: "https://example.com/",
        title: "Home",
        page_type: "homepage",
        excerpt: "Home",
        meta_description: "Home description that is long enough for band tests",
        headings: [{ level: 1, text: "Home" }],
        canonical_url: "https://example.com/",
        self_canonical: true,
        http_status: 200,
        redirect_count: 0,
        content_chars: 1200,
        schema_summary: { types: ["Organization"], raw_json_ld_count: 1 },
        internal_link_count: 5,
        image_alt: { total: 2, with_alt: 1, missing_alt: 1 },
      },
    ],
    business_knowledge: emptyBusinessKnowledge(),
    crawl_summary: {
      pages_analyzed: 1,
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
  });

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
    technicalCoverage,
    pageMetadata: [
      {
        url: "https://example.com/very/long/path/that-should-wrap-safely",
        currentTitle: "Home",
        recommendedTitle: "Clinic Home | Example",
        currentDescription: "Home description that is long enough for band tests",
        recommendedDescription: "Recommended home meta description",
        h1Observation: "One H1 present",
        recommendedH1: "Example Clinic",
        canonicalObservation: "Self-canonical",
        robotsObservation: null,
        httpStatus: 200,
        issueFlags: ["missing-alt"],
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
          affectedPages: ["https://example.com/"],
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
      pagesAnalyzedCount: 1,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-07T00:00:00.000Z",
      pages: [
        {
          title: "Home",
          url: "https://example.com/very/long/path/that-should-wrap-safely",
          pageType: "homepage",
        },
      ],
    },
  };
}

const parties = {
  subject: { organizationId: "org-subject", name: "Prospect Clinic" },
  sender: { organizationId: "org-sender", name: "Licensee Studio" },
};

describe("SEO prospect PDF adapters", () => {
  it("builds a visibility strategy document without internal Athena evidence", () => {
    const model = buildVisibilityStrategyPdfModel({
      pkg: intelligencePackage(),
      messages: en,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
    });
    const flat = flattenSeoProspectPdfDocument(model);
    assert.equal(model.lens, "Visibility Strategy");
    assert.match(flat, /Prioritize intent and trust content/);
    assert.match(flat, /Publish FAQ covering booking questions/);
    assert.match(flat, /Create an educational guide/);
    assert.match(flat, /Strategy call FAQ/);
    assert.match(flat, /https:\/\/example.com\/very\/long\/path/);
    assert.match(flat, /About this analysis/);
    assert.match(flat, /Appendix/);
    assert.match(flat, /Website Pages Analyzed/);
    assert.match(flat, /FAQ page/);
    assert.equal(model.sections[0]?.role, "snapshot");
    assert.equal(model.sections[1]?.role, "snapshot");
    assert.equal(model.sections.at(-2)?.role, "appendix");
    assert.equal(model.sections.at(-1)?.role, "methodology");
    assert.ok(
      model.sections.some((section) =>
        section.blocks.some((block) => block.type === "categoryList"),
      ),
    );
    assert.ok(
      model.sections.some((section) =>
        section.blocks.some((block) => block.type === "callout"),
      ),
    );
    assert.doesNotMatch(flat, /INTERNAL_SIGNAL_SHOULD_NOT_PRINT/);
    assert.equal(visibilityStrategyPdfContainsForbidden(flat), false);
  });

  it("builds a technical health document with page metadata and no crawl-page dump", () => {
    const pkg = technicalPackage();
    const model = buildTechnicalHealthPdfModel({
      pkg,
      messages: en,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
    });
    const flat = flattenSeoProspectPdfDocument(model);
    assert.equal(model.lens, "Website Technical Health");
    assert.match(flat, /Close metadata gaps/);
    assert.match(flat, /Deterministic metadata coverage findings/);
    assert.match(flat, /https:\/\/example.com\/very\/long\/path/);
    assert.match(flat, /"@type":"Service"/);
    assert.match(flat, /Implementation Notes/);
    assert.match(flat, /Appendix/);
    assert.match(flat, /Page-Level Technical Analysis/);
    assert.match(flat, /homepage/);
    assert.doesNotMatch(flat, /Website Pages Analyzed/);
    assert.doesNotMatch(flat, /Page-level metadata/);
    assert.equal(model.sections[0]?.role, "snapshot");
    assert.equal(model.sections[1]?.role, "snapshot");
    assert.equal(model.sections.at(-2)?.role, "methodology");
    assert.equal(model.sections.at(-1)?.role, "appendix");
    assert.ok(
      model.sections.some((section) =>
        section.blocks.some((block) => block.type === "metricRows"),
      ),
    );
    assert.doesNotMatch(flat, /INTERNAL_SIGNAL_SHOULD_NOT_PRINT/);
    assert.equal(technicalHealthPdfContainsForbidden(flat), false);
    assert.ok(!flat.includes(JSON.stringify(pkg.technicalCoverage.pages)));
  });

  it("renders a PDF buffer without persisting files", async () => {
    const brand = { identity: null, logo: null, profilePicture: null };
    const visibility = await renderSeoProspectPdf({
      pkg: intelligencePackage(),
      parties,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
      brand,
    });
    const technical = await renderSeoProspectPdf({
      pkg: technicalPackage(),
      parties,
      language: "en",
      reportDateIso: "2026-09-16T00:00:00.000Z",
      brand,
    });
    for (const pdf of [visibility, technical]) {
      assert.ok(Buffer.isBuffer(pdf));
      assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
      assert.ok(pdf.length > 500);
      const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [])
        .length;
      assert.ok(pageCount >= 3);
      assert.ok(pageCount <= 8);
    }
  });
});
