import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEO_REPORT_DISCLAIMER,
  type SeoIntelligencePackage,
} from "../../services/seo/seoReportTypes";
import {
  buildSeoExecutiveOverview,
  createEvidenceDeduper,
  formatStarRating,
  groupRoadmapItems,
  inferFutureActionKinds,
  priorityVisual,
  seoScoreBandFromValue,
} from "../../services/seo/seoReportPresentation";

function samplePackage(): SeoIntelligencePackage {
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
      ],
      painPointGaps: ["Fragmented messaging"],
      buyerIntentSummary: "Intent is more commercial than educational pages imply.",
      athenaEvidence: ["Personas", "Deep Scrape services"],
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
      recommendations: ["Publish two case studies tied to persona pain points."],
      athenaEvidence: ["Deep Scrape trust_signals"],
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
          priority: "P2",
          recommendation: "Create educational guide for offer clarity",
          reason: "Educational content gaps align with persona motivations",
          expectedBusinessImpact: "Earlier-funnel organic visibility",
          estimatedEffort: "low",
          athenaEvidence: ["Personas"],
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
          url: "https://example.com/",
          pageType: "homepage",
        },
      ],
    },
  };
}

describe("seo report presentation", () => {
  it("builds executive overview signals without changing package contracts", () => {
    const overview = buildSeoExecutiveOverview(samplePackage());
    assert.ok(overview.overallScore.value >= 1);
    assert.ok(overview.overallScore.stars >= 1);
    assert.match(overview.biggestOpportunity, /FAQ|Strategy/i);
    assert.match(overview.biggestRisk, /Thin FAQ|Fragmented/i);
    assert.match(overview.recommendedNextAction, /FAQ/i);
    assert.equal(formatStarRating(3), "★★★☆☆");
  });

  it("deduplicates repeated evidence across sections", () => {
    const take = createEvidenceDeduper();
    assert.deepEqual(take(["Deep Scrape services", "Brain"]), [
      "Deep Scrape services",
      "Brain",
    ]);
    assert.deepEqual(take(["deep scrape services", "Personas"]), ["Personas"]);
  });

  it("maps priority visuals and future action kinds for later execution", () => {
    const items = groupRoadmapItems(samplePackage().ninetyDayRoadmap.items);
    assert.equal(items[0]?.visual.label, "High Priority");
    assert.ok(
      inferFutureActionKinds({
        contentType: "FAQ page",
        title: "Strategy call FAQ",
      }).includes("generate_faq"),
    );
    assert.equal(priorityVisual("P3").label, "Long-Term Investment");
  });

  it("classifies score bands from numeric thresholds and keeps English as final label only", () => {
    assert.equal(seoScoreBandFromValue(80), "strong");
    assert.equal(seoScoreBandFromValue(79), "solid");
    assert.equal(seoScoreBandFromValue(65), "solid");
    assert.equal(seoScoreBandFromValue(64), "developing");
    assert.equal(seoScoreBandFromValue(50), "developing");
    assert.equal(seoScoreBandFromValue(49), "emerging");
    assert.equal(seoScoreBandFromValue(35), "emerging");
    assert.equal(seoScoreBandFromValue(34), "early");
    const overview = buildSeoExecutiveOverview(samplePackage());
    const englishFromBand = {
      strong: "Strong",
      solid: "Solid",
      developing: "Developing",
      emerging: "Emerging",
      early: "Early",
    } as const;
    assert.equal(typeof overview.overallScore.value, "number");
    assert.equal(
      overview.overallScore.label,
      englishFromBand[seoScoreBandFromValue(overview.overallScore.value)],
    );
  });
});
