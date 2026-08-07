import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEO_REPORT_DISCLAIMER,
  type SeoIntelligencePackage,
} from "../../services/seo/seoReportTypes";
import {
  SeoReportPackageValidationError,
  isCompleteSeoIntelligencePackage,
  validateSeoIntelligencePackage,
} from "../../services/seo/seoReportValidation";

function validPackage(
  overrides: Partial<SeoIntelligencePackage> = {},
): SeoIntelligencePackage {
  return {
    reportName: "Visibility & Authority Report",
    briefMode: "inferred",
    executiveAssessment: {
      overallAssessment: "Strong service signal, weak intent coverage.",
      strengths: ["Clear positioning", "Solid service overview"],
      weaknesses: ["Thin FAQ coverage", "Limited case proof"],
      seoReadiness: "Developing — content foundations exist, intent gaps remain.",
      businessVisibilityAssessment:
        "Buyers can understand the offer, but many pain points are underrepresented.",
      summary: "Prioritize intent and trust content before expansion pages.",
    },
    contentCoverage: {
      wellCoveredServices: ["Strategy consulting"],
      weaklyCoveredServices: ["Implementation support"],
      missingServices: ["Offer clarity workshops"],
      missingCustomerQuestions: ["How long until results?"],
      missingTrustContent: ["Named case studies"],
      missingEducationalContent: ["Buyer guides"],
      missingConversionContent: ["Booking landing page"],
      analysis: "Deep scrape shows services and about pages dominate.",
      athenaEvidence: ["Deep Scrape services", "Brain opportunities"],
    },
    customerIntent: {
      representedIntents: ["Learn about services"],
      missingIntents: [
        {
          intent: "Compare diagnostic approaches",
          source: "Persona: Growth founders",
          websiteGap: "No comparison content",
          recommendation: "Add comparison page for diagnostic vs DIY",
        },
        {
          intent: "Validate trust before booking",
          source: "Community discussions",
          websiteGap: "Sparse testimonials",
          recommendation: "Publish proof and case narrative pages",
        },
      ],
      painPointGaps: ["Fragmented messaging"],
      buyerIntentSummary: "Intent is more commercial than educational pages imply.",
      athenaEvidence: ["Personas", "Discussions"],
    },
    commercialOpportunities: {
      opportunities: [
        {
          contentType: "FAQ page",
          title: "Strategy call FAQ",
          rationale: "Discussions repeatedly ask timing and fit questions.",
          expectedImpact: "Capture commercial investigation demand",
          athenaEvidence: ["Discussions"],
        },
        {
          contentType: "Case study",
          title: "Offer clarity case study",
          rationale: "Trust content is thin relative to persona skepticism.",
          expectedImpact: "Improve conversion confidence",
          athenaEvidence: ["Deep Scrape testimonials", "Personas"],
        },
        {
          contentType: "Service page",
          title: "Implementation support page",
          rationale: "Service is weakly covered versus Brain opportunities.",
          expectedImpact: "Expand organic service visibility",
          athenaEvidence: ["Brain opportunities", "Deep Scrape"],
        },
      ],
      summary: "Focus on FAQ, proof, and underrepresented service pages.",
    },
    trustAndAuthority: {
      trustSignals: "Limited beyond brand tone.",
      testimonials: "Sparse.",
      caseStudies: "Missing.",
      expertPositioning: "Present in about/messaging.",
      authorityMessaging: "Strong in positioning, weak in proof.",
      differentiation: "Clear operator-led angle.",
      callsToAction: "Present but generic.",
      consistency: "Messaging is consistent across scraped pages.",
      recommendations: [
        "Publish two case studies tied to persona pain points.",
        "Strengthen CTA path from educational pages.",
      ],
      athenaEvidence: ["Deep Scrape trust_signals", "Deep Scrape case_studies"],
    },
    ninetyDayRoadmap: {
      overview: "Close intent and trust gaps before expanding topical coverage.",
      items: [
        {
          priority: "P0",
          recommendation: "Publish FAQ covering booking and fit questions",
          reason: "High-intent discussion questions are missing on-site",
          expectedBusinessImpact: "Better capture of ready buyers",
          estimatedEffort: "medium",
          athenaEvidence: ["Discussions", "Deep Scrape FAQ"],
        },
        {
          priority: "P1",
          recommendation: "Add one case study page",
          reason: "Trust content is thin",
          expectedBusinessImpact: "Higher conversion confidence",
          estimatedEffort: "medium",
          athenaEvidence: ["Deep Scrape", "Personas"],
        },
        {
          priority: "P1",
          recommendation: "Expand weakly covered implementation service page",
          reason: "Brain opportunities show demand",
          expectedBusinessImpact: "Broader service visibility",
          estimatedEffort: "high",
          athenaEvidence: ["Brain opportunities"],
        },
        {
          priority: "P2",
          recommendation: "Create educational guide for offer clarity",
          reason: "Educational content gaps align with persona motivations",
          expectedBusinessImpact: "Earlier-funnel organic visibility",
          estimatedEffort: "low",
          athenaEvidence: ["Personas", "Communities"],
        },
      ],
    },
    disclaimer: SEO_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 2,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-05T00:00:00.000Z",
      pages: [
        {
          title: "Home",
          url: "https://example.com/",
          pageType: "homepage",
        },
        {
          title: null,
          url: "https://example.com/about",
          pageType: "about",
        },
      ],
    },
    ...overrides,
  };
}

describe("seo report output contract", () => {
  it("accepts a complete valid package", () => {
    const pkg = validateSeoIntelligencePackage(validPackage());
    assert.equal(pkg.reportName, "Visibility & Authority Report");
    assert.equal(pkg.generationType, "intelligence");
    assert.equal(pkg.ninetyDayRoadmap.items.length, 4);
    assert.equal(pkg.websitePagesAnalyzed.pages.length, 2);
    assert.equal(pkg.websitePagesAnalyzed.pages[1]?.title, null);
    assert.equal(isCompleteSeoIntelligencePackage(pkg), true);
  });

  it("defaults missing websitePagesAnalyzed to an empty immutable snapshot", () => {
    const { websitePagesAnalyzed: _omit, ...legacy } = validPackage();
    const pkg = validateSeoIntelligencePackage(legacy);
    assert.equal(pkg.websitePagesAnalyzed.pages.length, 0);
    assert.equal(pkg.websitePagesAnalyzed.pagesAnalyzedCount, 0);
  });

  it("rejects websitePagesAnalyzed inventories larger than 50 pages", () => {
    assert.throws(
      () =>
        validateSeoIntelligencePackage(
          validPackage({
            websitePagesAnalyzed: {
              pagesAnalyzedCount: 51,
              sourceUrl: "https://example.com",
              scrapedAt: "2026-08-05T00:00:00.000Z",
              pages: Array.from({ length: 51 }, (_, i) => ({
                title: `Page ${i}`,
                url: `https://example.com/p-${i}`,
                pageType: "other",
              })),
            },
          }),
        ),
      SeoReportPackageValidationError,
    );
  });

  it("rejects incomplete packages", () => {
    assert.throws(
      () =>
        validateSeoIntelligencePackage(
          validPackage({
            commercialOpportunities: {
              summary: "thin",
              opportunities: [],
            },
          }),
        ),
      SeoReportPackageValidationError,
    );
  });

  it("rejects Phase-1 technical SEO topics", () => {
    assert.throws(
      () =>
        validateSeoIntelligencePackage(
          validPackage({
            executiveAssessment: {
              ...validPackage().executiveAssessment,
              overallAssessment: "Fix crawl budget and canonical tags first.",
            },
          }),
        ),
      (error: unknown) =>
        error instanceof SeoReportPackageValidationError &&
        error.details.some((detail) => /technical SEO|canonical|crawl budget/i.test(detail)),
    );
  });

  it("rejects external SEO metric claims", () => {
    assert.throws(
      () =>
        validateSeoIntelligencePackage(
          validPackage({
            commercialOpportunities: {
              summary: "High-volume Semrush opportunities",
              opportunities: validPackage().commercialOpportunities.opportunities,
            },
          }),
        ),
      SeoReportPackageValidationError,
    );
  });
});
