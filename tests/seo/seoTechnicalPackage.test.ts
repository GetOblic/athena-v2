import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTechnicalSeoEvidence } from "../../services/seo/seoTechnicalAnalyzer";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";
import {
  SeoReportPackageValidationError,
  validateSeoIntelligencePackage,
} from "../../services/seo/seoReportValidation";
import {
  isCompleteSeoTechnicalPackage,
  validateSeoTechnicalPackage,
} from "../../services/seo/seoTechnicalValidation";

function technicalCoverage() {
  return analyzeTechnicalSeoEvidence({
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-07T00:00:00.000Z",
    pages_analyzed: 3,
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
      {
        url: "https://example.com/about",
        title: "About",
        page_type: "about",
        excerpt: "About",
        meta_description: "About description with enough characters present here",
        headings: [{ level: 1, text: "About" }],
        canonical_url: "https://example.com/about",
        self_canonical: true,
        http_status: 200,
        content_chars: 900,
      },
      {
        url: "https://example.com/services",
        title: "Services",
        page_type: "services",
        excerpt: "Services",
        meta_description: "Services description with enough characters present",
        headings: [{ level: 1, text: "Services" }],
        canonical_url: "https://example.com/services",
        self_canonical: true,
        http_status: 200,
        content_chars: 1000,
      },
    ],
    business_knowledge: emptyBusinessKnowledge(),
    crawl_summary: {
      pages_analyzed: 3,
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
}

function validTechnicalPackage(
  overrides: Partial<SeoTechnicalPackage> = {},
): SeoTechnicalPackage {
  return {
    generationType: "technical",
    reportName: "Technical SEO Report",
    briefMode: "inferred",
    executiveEvaluation: {
      overallAssessment: "Solid foundations with metadata gaps.",
      strengths: ["Most pages return 200"],
      criticalIssues: ["One page missing title coverage in corpus sample"],
      warnings: ["Image alt coverage is incomplete"],
      remediationPriorities: ["Fix missing titles and alt text first"],
      summary: "Address metadata and image alt gaps next.",
    },
    technicalCoverage: technicalCoverage(),
    pageMetadata: [
      {
        url: "https://example.com/",
        currentTitle: "Home",
        recommendedTitle: "Clinic Home | Example",
        currentDescription: "Home description that is long enough for band tests",
        recommendedDescription: "Recommended home meta description",
        h1Observation: "One H1 present",
        recommendedH1: "Example Clinic",
        canonicalObservation: "Self-canonical",
        robotsObservation: null,
      },
    ],
    siteArchitecture: {
      architectureFindings: ["Homepage links to key service pages"],
      linkingEvidence: ["Average internal links are healthy on homepage"],
      weaklyLinkedCandidates: [],
      recommendedLinks: [],
      summary: "Architecture is workable with selective linking improvements.",
    },
    contentHtmlFindings: {
      headingFindings: ["H1 coverage is strong"],
      metadataFindings: ["Titles are present on analyzed pages"],
      contentSizeFindings: ["No thin-content candidates in this sample"],
      structuralRecommendations: ["Keep one H1 per page"],
      summary: "HTML structure is generally sound.",
    },
    structuredData: {
      detectedSchemaEvidence: ["Organization schema on homepage"],
      missingOpportunityAssessment: "Service pages lack Service schema",
      recommendedSchemaTypes: ["Service"],
      implementationGuidance: ["Add JSON-LD Service nodes on service pages"],
      exampleSnippets: ['{"@type":"Service","name":"Example"}'],
      summary: "Schema opportunity exists on commercial pages.",
    },
    imageSeo: {
      altCoverageSummary: "Half of sampled images lack alt text",
      missingAltFindings: ["Homepage has images missing alt"],
      remediationGuidance: ["Add descriptive alt text for content images"],
      summary: "Improve image accessibility and SEO alt coverage.",
    },
    crawlFindings: {
      statusFindings: ["All analyzed pages returned HTTP 200"],
      redirectFindings: ["No multi-hop redirects detected"],
      canonicalFindings: ["Canonicals are self-referencing"],
      robotsFindings: ["No noindex directives detected"],
      summary: "Crawl health looks stable for analyzed pages.",
    },
    actionPlan: {
      overview: "Prioritize metadata completeness and image alt remediation.",
      items: [
        {
          priority: "Critical",
          title: "Close metadata gaps",
          affectedPages: ["https://example.com/"],
          evidence: "Deterministic metadata coverage findings",
          reason: "Missing or weak metadata reduces clarity",
          recommendedAction: "Implement recommended titles/descriptions",
        },
        {
          priority: "High",
          title: "Improve image alt coverage",
          affectedPages: ["https://example.com/"],
          evidence: "Image alt missing counts from Website Intelligence",
          reason: "Missing alt reduces accessibility and image SEO",
          recommendedAction: "Add descriptive alt attributes",
        },
        {
          priority: "Improvement",
          title: "Add Service schema",
          affectedPages: ["https://example.com/services"],
          evidence: "Schema coverage shows Organization only",
          reason: "Service pages can expose structured offers",
          recommendedAction: "Implement Service JSON-LD",
        },
      ],
    },
    implementationAssets: {
      metadataTableNotes: "Use pageMetadata recommendations as the source table.",
      headingRecommendations: ["Keep a single descriptive H1 per page"],
      internalLinkPlan: ["Link About to Services with descriptive anchors"],
      schemaRecommendations: ["Add Service schema on commercial pages"],
      redirectRecommendations: [],
      developerRemediationInstructions: [
        "Update title/meta tags from the metadata table",
        "Add missing image alt attributes",
      ],
    },
    disclaimer: SEO_TECHNICAL_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 3,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-07T00:00:00.000Z",
      pages: [
        {
          title: "Home",
          url: "https://example.com/",
          pageType: "homepage",
        },
      ],
    },
    ...overrides,
  };
}

describe("technical SEO package validation", () => {
  it("accepts a complete technical package", () => {
    const pkg = validateSeoTechnicalPackage(validTechnicalPackage());
    assert.equal(pkg.generationType, "technical");
    assert.equal(isCompleteSeoTechnicalPackage(pkg), true);
    assert.equal(
      pkg.pageMetadata.length,
      pkg.technicalCoverage.pages.length,
    );
  });

  it("downgrades orphan Critical when executive has no criticalIssues", () => {
    const pkg = validateSeoTechnicalPackage(
      validTechnicalPackage({
        executiveEvaluation: {
          ...validTechnicalPackage().executiveEvaluation,
          criticalIssues: [],
        },
        actionPlan: {
          overview: "No executive critical",
          items: [
            {
              priority: "Critical",
              title: "Close metadata gaps",
              affectedPages: ["https://example.com/"],
              evidence: "metadata",
              reason: "metadata",
              recommendedAction: "Fix titles",
            },
            {
              priority: "High",
              title: "Improve image alt coverage",
              affectedPages: ["https://example.com/"],
              evidence: "alt",
              reason: "alt",
              recommendedAction: "Add alt",
            },
            {
              priority: "Improvement",
              title: "Add Service schema",
              affectedPages: ["https://example.com/services"],
              evidence: "schema",
              reason: "schema",
              recommendedAction: "Add schema",
            },
          ],
        },
      }),
    );
    assert.equal(
      pkg.actionPlan.items.some((item) => item.priority === "Critical"),
      false,
    );
  });

  it("rejects unsupported metric claims", () => {
    assert.throws(
      () =>
        validateSeoTechnicalPackage(
          validTechnicalPackage({
            executiveEvaluation: {
              ...validTechnicalPackage().executiveEvaluation,
              overallAssessment:
                "PageSpeed and Core Web Vitals are poor; Search Console shows index issues.",
            },
          }),
        ),
      (error: unknown) =>
        error instanceof SeoReportPackageValidationError &&
        error.details.some((detail) =>
          /PageSpeed|Core Web Vitals|Search Console|unsupported/i.test(detail),
        ),
    );
  });

  it("rejects backlink / ranking fabrications", () => {
    assert.throws(
      () =>
        validateSeoTechnicalPackage(
          validTechnicalPackage({
            actionPlan: {
              overview: "Grow rankings",
              items: [
                {
                  priority: "High",
                  title: "Build backlinks",
                  affectedPages: [],
                  evidence: "none",
                  reason: "Need domain authority",
                  recommendedAction: "Buy backlinks to improve ranking position",
                },
                {
                  priority: "Improvement",
                  title: "Track traffic",
                  affectedPages: [],
                  evidence: "none",
                  reason: "Organic traffic unknown",
                  recommendedAction: "Estimate organic traffic",
                },
                {
                  priority: "Critical",
                  title: "Fix titles",
                  affectedPages: ["https://example.com/"],
                  evidence: "missing titles",
                  reason: "metadata gap",
                  recommendedAction: "Add titles",
                },
              ],
            },
          }),
        ),
      SeoReportPackageValidationError,
    );
  });

  it("does not validate technical packages through intelligence validator", () => {
    assert.throws(
      () => validateSeoIntelligencePackage(validTechnicalPackage()),
      SeoReportPackageValidationError,
    );
  });
});
