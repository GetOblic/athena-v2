/**
 * SEO accompanying email (Option A).
 * In-memory and source contracts only. No SQL apply and no provider call.
 */
import "../organization/organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { resolveModelForStage } from "../../lib/llm/modelRouting";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { resolveAssetContinuationDestination } from "../../services/assetContinuation/destinationRegistry";
import {
  buildSeoAccompanyingEmailGrounding,
  buildSeoAccompanyingEmailPrompt,
  buildSeoAccompanyingEmailRecord,
  formatSeoAccompanyingFullEmail,
  readStoredSeoAccompanyingEmail,
  SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
  type SeoAccompanyingEmailRecord,
  type VerifiedSeoCommercialIdentity,
} from "../../services/seo/seoAccompanyingEmail";
import { generateSeoAccompanyingEmail } from "../../services/seo/seoAccompanyingEmailGeneration";
import type { SeoOrganizationContext } from "../../services/seo/seoContextComposer";
import { mapSeoReportRow } from "../../services/seo/seoReportMappers";
import { toPublicSeoReportDetail } from "../../services/seo/seoReportPublic";
import { persistSeoAccompanyingEmailIfAbsent } from "../../services/seo/seoReportService";
import {
  SEO_REPORT_DISCLAIMER,
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoIntelligencePackage,
  type SeoReportPackage,
  type SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";
import { validateSeoIntelligencePackage } from "../../services/seo/seoReportValidation";
import { validateSeoTechnicalPackage } from "../../services/seo/seoTechnicalValidation";
import { analyzeTechnicalSeoEvidence } from "../../services/seo/seoTechnicalAnalyzer";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const ROOT = process.cwd();
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REPORT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_REPORT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ROUTING_KEYS = [
  "OPENROUTER_ANALYSIS_MODEL",
  "OPENROUTER_PREMIUM_MODEL",
  "OPENROUTER_MODEL",
  "OPENROUTER_STRATEGIC_BLUEPRINT_MODEL",
] as const;

const savedEnv = new Map<string, string | undefined>();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

before(() => {
  for (const key of ROUTING_KEYS) savedEnv.set(key, process.env[key]);
});

after(() => {
  for (const key of ROUTING_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function clearRouting(): void {
  for (const key of ROUTING_KEYS) delete process.env[key];
}

function validIntelligence(): SeoIntelligencePackage {
  return validateSeoIntelligencePackage({
    reportName: "Visibility & Authority Report",
    briefMode: "inferred",
    executiveAssessment: {
      overallAssessment: "Strong service signal, weak intent coverage.",
      strengths: ["Clear positioning", "Solid service overview"],
      weaknesses: ["Thin FAQ coverage", "Limited case proof"],
      seoReadiness: "Developing. Content foundations exist and intent gaps remain.",
      businessVisibilityAssessment:
        "Buyers can understand the offer, but many questions are underrepresented.",
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
      analysis: "Services and about pages dominate the learned site.",
      athenaEvidence: ["Deep Scrape services", "Brain opportunities"],
    },
    customerIntent: {
      representedIntents: ["Learn about services"],
      missingIntents: [
        {
          intent: "Compare diagnostic approaches",
          source: "Persona: Growth founders",
          websiteGap: "No comparison content",
          recommendation: "Add a comparison page",
        },
        {
          intent: "Validate trust before booking",
          source: "Community discussions",
          websiteGap: "Sparse testimonials",
          recommendation: "Publish proof and case narrative pages",
        },
      ],
      painPointGaps: ["Fragmented messaging"],
      buyerIntentSummary: "Intent is more commercial than the pages imply.",
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
          athenaEvidence: ["Personas"],
        },
        {
          contentType: "Service page",
          title: "Implementation support page",
          rationale: "Service is weakly covered versus Brain opportunities.",
          expectedImpact: "Expand service discovery",
          athenaEvidence: ["Brain opportunities"],
        },
      ],
      summary: "Focus on FAQ and proof pages.",
    },
    trustAndAuthority: {
      trustSignals: "Limited beyond brand tone.",
      testimonials: "Sparse.",
      caseStudies: "Missing.",
      expertPositioning: "Present in about messaging.",
      authorityMessaging: "Strong in positioning, weak in proof.",
      differentiation: "Clear operator-led angle.",
      callsToAction: "Present but generic.",
      consistency: "Messaging is consistent across learned pages.",
      recommendations: [
        "Publish two case studies tied to persona questions.",
        "Strengthen the path from educational pages.",
      ],
      athenaEvidence: ["Deep Scrape trust signals"],
    },
    ninetyDayRoadmap: {
      overview: "Close intent and trust gaps before expanding coverage.",
      items: [
        {
          priority: "P0",
          recommendation: "Publish FAQ covering booking and fit questions",
          reason: "High-intent questions are missing on the site",
          expectedBusinessImpact: "Better capture of ready buyers",
          estimatedEffort: "medium",
          athenaEvidence: ["Discussions"],
        },
        {
          priority: "P1",
          recommendation: "Add one case study page",
          reason: "Trust content is thin",
          expectedBusinessImpact: "Higher conversion confidence",
          estimatedEffort: "medium",
          athenaEvidence: ["Personas"],
        },
        {
          priority: "P2",
          recommendation: "Create an educational guide for offer clarity",
          reason: "Educational gaps align with persona motivations",
          expectedBusinessImpact: "Earlier organic discovery",
          estimatedEffort: "low",
          athenaEvidence: ["Communities"],
        },
        {
          priority: "P3",
          recommendation: "Expand the implementation service page",
          reason: "The service is weakly covered",
          expectedBusinessImpact: "Broader service discovery",
          estimatedEffort: "high",
          athenaEvidence: ["Brain opportunities"],
        },
      ],
    },
    disclaimer: SEO_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 1,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-05T00:00:00.000Z",
      pages: [
        { title: "Home", url: "https://example.com/", pageType: "homepage" },
      ],
    },
  });
}

function validTechnical(): SeoTechnicalPackage {
  const technicalCoverage = analyzeTechnicalSeoEvidence({
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

  return validateSeoTechnicalPackage({
    generationType: "technical",
    reportName: "Technical SEO Report",
    briefMode: "inferred",
    executiveEvaluation: {
      overallAssessment: "Solid foundations with metadata gaps.",
      strengths: ["Most pages return 200"],
      criticalIssues: ["One page missing title coverage in the sample"],
      warnings: ["Image alt coverage is incomplete"],
      remediationPriorities: ["Fix missing titles and alt text first"],
      summary: "Address metadata and image alt gaps next.",
    },
    technicalCoverage,
    pageMetadata: [
      {
        url: "https://example.com/",
        currentTitle: "Home",
        recommendedTitle: "Clinic Home",
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
      linkingEvidence: ["Internal links are present on the homepage"],
      weaklyLinkedCandidates: [],
      recommendedLinks: [],
      summary: "Architecture is workable.",
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
      implementationGuidance: ["Add Service nodes on service pages"],
      exampleSnippets: ['{"@type":"Service","name":"Example"}'],
      summary: "Schema opportunity exists on commercial pages.",
    },
    imageSeo: {
      altCoverageSummary: "Some sampled images lack alt text",
      missingAltFindings: ["Homepage has images missing alt"],
      remediationGuidance: ["Add descriptive alt text for content images"],
      summary: "Improve image alt coverage.",
    },
    crawlFindings: {
      statusFindings: ["Analyzed pages returned HTTP 200"],
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
          reason: "Weak metadata reduces clarity",
          recommendedAction: "Implement recommended titles and descriptions",
        },
        {
          priority: "High",
          title: "Improve image alt coverage",
          affectedPages: ["https://example.com/"],
          evidence: "Image alt missing counts",
          reason: "Missing alt reduces clarity for images",
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
      metadataTableNotes: "Use the metadata recommendations as the source table.",
      headingRecommendations: ["Keep a single descriptive H1 per page"],
      internalLinkPlan: ["Link About to Services with descriptive anchors"],
      schemaRecommendations: ["Add Service schema on commercial pages"],
      redirectRecommendations: [],
      developerRemediationInstructions: [
        "Update title and meta tags from the metadata table",
      ],
    },
    disclaimer: SEO_TECHNICAL_REPORT_DISCLAIMER,
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 1,
      sourceUrl: "https://example.com",
      scrapedAt: "2026-08-07T00:00:00.000Z",
      pages: [
        { title: "Home", url: "https://example.com/", pageType: "homepage" },
      ],
    },
  });
}

function context(
  overrides: Partial<SeoOrganizationContext> = {},
): SeoOrganizationContext {
  return {
    organizationId: ORG,
    briefMode: "inferred",
    brief: {},
    brainIdentityBlock: "No trusted Brain identity was available.",
    organizationIntelligenceBlock: "",
    deepWebsiteIntelligenceBlock: "",
    executiveIntelligenceBlock: "",
    personasBlock: "",
    communitiesBlock: "",
    adsKeywordThemesBlock: "",
    operatorGuidanceBlock: "",
    composedPromptContext: "",
    websitePagesAnalyzed: {
      pagesAnalyzedCount: 0,
      sourceUrl: null,
      scrapedAt: null,
      pages: [],
    },
    meta: {
      personaCount: 0,
      brainAvailable: false,
      deepIntelligenceAvailable: false,
      executiveIntelligenceAvailable: false,
      adsKeywordThemesAvailable: false,
      totalChars: 0,
      websitePagesSnapshotCount: 0,
    },
    ...overrides,
    meta: {
      personaCount: 0,
      brainAvailable: false,
      deepIntelligenceAvailable: false,
      executiveIntelligenceAvailable: false,
      adsKeywordThemesAvailable: false,
      totalChars: 0,
      websitePagesSnapshotCount: 0,
      ...overrides.meta,
    },
  };
}

const atelier: VerifiedSeoCommercialIdentity = {
  organizationName: "Atelier Nord",
  legalName: "Atelier Nord SAS",
  businessEmail: "studio@atelier-nord.example",
  phone: "+33 6 12 34 56 78",
  decisionMaker: "Camille Bernard",
  jobTitle: "Founder",
  address: "12 rue des Ateliers, Lyon, France",
  category: "Advisory",
  industry: "Professional services",
  website: "https://atelier-nord.example/",
};

function cleanEmail(subject: string, body: string): string {
  return JSON.stringify({ subject, body });
}

const STRATEGIC_BODY =
  "The visibility review is ready. The next step is to publish an FAQ covering booking and fit questions. I can walk through that page with you this week.";
const TECHNICAL_BODY =
  "The technical review is ready. The next step is to implement the recommended titles and descriptions on the analyzed pages. I can walk through that change with you.";

function brainBlock(): string {
  return [
    "ATHENA BRAIN CONTEXT:",
    "ABOUT THE USER:",
    "Atelier de conseil pour les ateliers nordiques.",
    "",
    "USER WEBSITE:",
    "https://atelier-nord.example/",
    "",
    "MASTER IDENTITY PROFILE:",
    JSON.stringify(
      {
        voice: "calm, precise, never salesy",
        language: "fr",
        persona: { positioning: ["Atelier Nord consultative workshops"] },
      },
      null,
      2,
    ),
  ].join("\n");
}

type MemoryRow = {
  id: string;
  organization_id: string;
  status: string;
  package_json: unknown;
  accompanying_email_json: unknown;
};

function memoryDb(rows: MemoryRow[], options?: { error?: string; throw?: boolean }) {
  return {
    from(table: string) {
      if (table !== "seo_reports") throw new Error(`unexpected table ${table}`);
      return {
        update(payload: Record<string, unknown>) {
          const filters: Array<(row: MemoryRow) => boolean> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push(
                (row) =>
                  (row as unknown as Record<string, unknown>)[column] === value,
              );
              return builder;
            },
            is(column: string, value: unknown) {
              filters.push((row) => {
                const actual = (row as unknown as Record<string, unknown>)[
                  column
                ];
                return value == null ? actual == null : actual === value;
              });
              return builder;
            },
            then(
              resolve: (value: { error: { message: string } | null }) => void,
              reject?: (reason: unknown) => void,
            ) {
              try {
                if (options?.throw) {
                  throw new Error("db down");
                }
                const keys = Object.keys(payload);
                if (
                  keys.length !== 1 ||
                  keys[0] !== "accompanying_email_json"
                ) {
                  resolve({
                    error: { message: `unexpected update keys: ${keys.join(",")}` },
                  });
                  return;
                }
                if (options?.error) {
                  resolve({ error: { message: options.error } });
                  return;
                }
                for (const row of rows) {
                  if (filters.every((filter) => filter(row))) {
                    row.accompanying_email_json = payload.accompanying_email_json;
                  }
                }
                resolve({ error: null });
              } catch (error) {
                if (reject) reject(error);
                else throw error;
              }
            },
          };
          return builder;
        },
      };
    },
  };
}

function readyRow(email: unknown = null): MemoryRow {
  return {
    id: REPORT,
    organization_id: ORG,
    status: "Ready",
    package_json: { reportName: "kept" },
    accompanying_email_json: email,
  };
}

async function generatedRecord(
  reportPackage: SeoReportPackage,
  raw: string,
): Promise<SeoAccompanyingEmailRecord | null> {
  const result = await generateSeoAccompanyingEmail({
    organizationId: ORG,
    reportPackage,
    context: context(),
    commercialIdentity: null,
    generate: async () => raw,
  });
  return result.record;
}

describe("SEO accompanying email generation", () => {
  it("grounds a Visibility Strategy email in the validated package and Brain voice", async () => {
    clearRouting();
    const reportPackage = validIntelligence();
    let prompt = "";
    const result = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage,
      context: context({
        brainIdentityBlock: brainBlock(),
        meta: { brainAvailable: true } as SeoOrganizationContext["meta"],
      }),
      commercialIdentity: atelier,
      generate: async (value) => {
        prompt = value;
        return cleanEmail("Point sur votre visibilité", STRATEGIC_BODY);
      },
    });

    assert.equal(result.reason, "generated");
    assert.equal(
      result.record?.generated.subject,
      "Point sur votre visibilité",
    );
    assert.equal(result.record?.generated.body, STRATEGIC_BODY);
    assert.match(prompt, /Publish FAQ covering booking and fit questions/);
    assert.match(prompt, /calm, precise, never salesy/);
    assert.match(prompt, /Atelier Nord consultative workshops/);
    assert.match(prompt, /Atelier de conseil pour les ateliers nordiques/);
    assert.match(prompt, /Trusted Brain language cue: fr/);
    assert.match(prompt, /Camille Bernard/);
    assert.match(prompt, /studio@atelier-nord\.example/);
    assert.match(prompt, /Do not invent recipient names/);
    assert.match(
      prompt,
      /Boundary: do not claim search positions, visitor counts, or promised outcomes/,
    );
    assert.match(prompt, /Subject maximum 140 characters, one line/);
    assert.doesNotMatch(prompt, /Copy Subject|organizations\.language/);
    assert.equal(result.record?.generation.role, "analysis");
    assert.equal(result.record?.generation.stage, "seo_accompanying_email");
    assert.equal(
      result.record?.generation.model,
      "google/gemini-2.5-flash",
    );
    assert.equal(
      buildSeoAccompanyingEmailGrounding(reportPackage).includes(
        "Publish FAQ covering booking and fit questions",
      ),
      true,
    );
  });

  it("grounds a Website Technical Health email in the validated technical package", async () => {
    const reportPackage = validTechnical();
    let calls = 0;
    let prompt = "";
    const result = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage,
      context: context(),
      commercialIdentity: null,
      generate: async (value) => {
        calls += 1;
        prompt = value;
        return cleanEmail("Technical page review", TECHNICAL_BODY);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.reason, "generated");
    assert.match(prompt, /Website Technical Health/);
    assert.match(prompt, /Implement recommended titles and descriptions/);
    assert.match(prompt, /No verified commercial identity/);
    assert.doesNotMatch(prompt, /Camille Bernard|\+33/);
  });

  it("keeps missing Brain and commercial context from failing or inventing details", async () => {
    let loads = 0;
    const result = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage: validIntelligence(),
      context: context({
        organizationId: OTHER_ORG,
        brainIdentityBlock: "SECRET_FOREIGN_BRAIN",
        meta: { brainAvailable: true } as SeoOrganizationContext["meta"],
      }),
      loadCommercialIdentity: async () => {
        loads += 1;
        throw new Error("commercial lookup failed");
      },
      generate: async (prompt) => {
        assert.match(prompt, /No trusted Brain identity was available/);
        assert.match(prompt, /No verified commercial identity/);
        assert.doesNotMatch(prompt, /SECRET_FOREIGN_BRAIN/);
        return cleanEmail("Visibility review", STRATEGIC_BODY);
      },
    });
    assert.equal(loads, 1);
    assert.equal(result.reason, "generated");
    assert.equal(result.record?.generated.body, STRATEGIC_BODY);
  });

  it("keeps creative wording, including names, contact details, and claims", async () => {
    let calls = 0;
    const subject = "Hi\nMarie — guaranteed #1 rankings";
    const body = [
      "Dear Marie,",
      "I am Laurent Cohen. Call +1 555 010 0199 or write marie@example.com.",
      "We guarantee page 1 rankings, more traffic, and 40% more visits.",
      "Best regards, Someone Else.",
      "<b>Next step</b> {{recipient}} [your name]",
      "https://unverified.example/offer",
    ].join(" ");
    const result = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage: validIntelligence(),
      context: context({
        brainIdentityBlock: brainBlock(),
        meta: { brainAvailable: true } as SeoOrganizationContext["meta"],
      }),
      commercialIdentity: null,
      generate: async () => {
        calls += 1;
        return cleanEmail(subject, body);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.reason, "generated");
    assert.equal(result.record?.generated.subject, subject);
    assert.equal(result.record?.generated.body, body);
    assert.equal(result.record?.generation.role, "analysis");
  });

  it("soft-fails a provider error and invalid JSON without retrying", async () => {
    let failures = 0;
    const failed = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage: validIntelligence(),
      context: context(),
      commercialIdentity: null,
      generate: async () => {
        failures += 1;
        throw new Error("provider down");
      },
    });
    assert.equal(failures, 1);
    assert.deepEqual(failed, { record: null, reason: "model_failed" });

    let invalids = 0;
    const invalid = await generateSeoAccompanyingEmail({
      organizationId: ORG,
      reportPackage: validIntelligence(),
      context: context(),
      commercialIdentity: null,
      generate: async () => {
        invalids += 1;
        return "not json";
      },
    });
    assert.equal(invalids, 1);
    assert.deepEqual(invalid, { record: null, reason: "invalid_email" });

    for (const raw of [
      cleanEmail("   ", STRATEGIC_BODY),
      cleanEmail("Visibility review", "   "),
      JSON.stringify({ subject: "Visibility review" }),
      JSON.stringify({ subject: 1, body: STRATEGIC_BODY }),
      "[]",
    ]) {
      let calls = 0;
      const empty = await generateSeoAccompanyingEmail({
        organizationId: ORG,
        reportPackage: validIntelligence(),
        context: context(),
        commercialIdentity: null,
        generate: async () => {
          calls += 1;
          return raw;
        },
      });
      assert.equal(calls, 1);
      assert.deepEqual(empty, { record: null, reason: "invalid_email" });
    }
  });
});

describe("SEO accompanying email persistence and presentation", () => {
  it("writes only a Ready null email for the owning organization", async () => {
    const original = readyRow(
      buildSeoAccompanyingEmailRecord({
        subject: "Original subject stays",
        body: STRATEGIC_BODY,
        model: "google/gemini-2.5-flash",
      }),
    );
    original.id = OTHER_REPORT;
    const fresh = readyRow();
    const foreign = readyRow();
    foreign.organization_id = OTHER_ORG;
    const rows = [original, fresh, foreign];
    const email = buildSeoAccompanyingEmailRecord({
      subject: "New visibility note",
      body: STRATEGIC_BODY,
      model: "google/gemini-2.5-flash",
    });

    const persisted = await persistSeoAccompanyingEmailIfAbsent(
      { reportId: REPORT, organizationId: ORG, email },
      { db: memoryDb(rows) },
    );
    assert.equal(persisted, "persisted");
    assert.deepEqual(fresh.accompanying_email_json, email);
    assert.equal(fresh.status, "Ready");
    assert.deepEqual(fresh.package_json, { reportName: "kept" });
    assert.notEqual(
      (original.accompanying_email_json as SeoAccompanyingEmailRecord).generated
        .subject,
      "New visibility note",
    );
    assert.equal(foreign.accompanying_email_json, null);

    const again = await persistSeoAccompanyingEmailIfAbsent(
      { reportId: REPORT, organizationId: ORG, email },
      { db: memoryDb(rows) },
    );
    assert.equal(again, "persisted");
    assert.equal(
      (fresh.accompanying_email_json as SeoAccompanyingEmailRecord).generated
        .subject,
      "New visibility note",
    );
  });

  it("soft-fails persistence without clearing Ready or package_json", async () => {
    const row = readyRow();
    const email = await generatedRecord(validIntelligence(), cleanEmail(
      "Visibility review",
      STRATEGIC_BODY,
    ));
    assert.ok(email);
    const failed = await persistSeoAccompanyingEmailIfAbsent(
      { reportId: REPORT, organizationId: ORG, email },
      { db: memoryDb([row], { error: "permission denied" }) },
    );
    assert.equal(failed, "persist_failed");
    assert.equal(row.status, "Ready");
    assert.deepEqual(row.package_json, { reportName: "kept" });
    assert.equal(row.accompanying_email_json, null);

    const thrown = await persistSeoAccompanyingEmailIfAbsent(
      { reportId: REPORT, organizationId: ORG, email },
      { db: memoryDb([row], { throw: true }) },
    );
    assert.equal(thrown, "persist_failed");
    assert.equal(row.status, "Ready");
    assert.deepEqual(row.package_json, { reportName: "kept" });
  });

  it("persists creative wording and skips a blank subject", async () => {
    const row = readyRow();
    const email = buildSeoAccompanyingEmailRecord({
      subject: "Hi",
      body: "Dear Marie, guaranteed #1 rankings. Call +1 555 010 0199.",
      model: "google/gemini-2.5-flash",
    });
    const persisted = await persistSeoAccompanyingEmailIfAbsent(
      { reportId: REPORT, organizationId: ORG, email },
      { db: memoryDb([row]) },
    );
    assert.equal(persisted, "persisted");
    assert.deepEqual(row.accompanying_email_json, email);

    const blankRow = readyRow();
    const skipped = await persistSeoAccompanyingEmailIfAbsent(
      {
        reportId: REPORT,
        organizationId: ORG,
        email: {
          ...email,
          generated: { subject: "   ", body: email.generated.body },
        },
      },
      { db: memoryDb([blankRow]) },
    );
    assert.equal(skipped, "skipped");
    assert.equal(blankRow.accompanying_email_json, null);
    assert.equal(blankRow.status, "Ready");
  });

  it("keeps historical Ready rows with a null email renderable", () => {
    const reportPackage = validIntelligence();
    const row = mapSeoReportRow({
      id: REPORT,
      organization_id: ORG,
      user_id: null,
      name: "Historical",
      brief_json: {},
      status: "Ready",
      generation_stage: "completed",
      package_json: reportPackage,
      error_code: null,
      error_message: null,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(row.status, "Ready");
    assert.equal(row.package_json?.reportName, reportPackage.reportName);
    assert.equal(row.accompanying_email, null);
    const detail = toPublicSeoReportDetail(row);
    assert.equal(detail.accompanyingEmail, null);
    assert.ok(detail.package);

    const malformed = mapSeoReportRow({
      id: REPORT,
      organization_id: ORG,
      status: "Ready",
      package_json: reportPackage,
      accompanying_email_json: {
        schemaVersion: SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
        generated: { subject: "Hi", body: "Too short." },
        generation: {
          stage: "seo_accompanying_email",
          model: null,
          role: "analysis",
        },
        edited: {
          subject: "Changed",
          body: "Changed body that is long enough to store.",
        },
      },
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(malformed.status, "Ready");
    assert.equal(malformed.accompanying_email, null);
    assert.equal(toPublicSeoReportDetail(malformed).accompanyingEmail, null);
    assert.equal(readStoredSeoAccompanyingEmail(malformed), null);

    const creativeBody =
      "Dear Marie, guaranteed #1 rankings and 40% more traffic. Call +1 555 010 0199 or write marie@example.com. <b>Next</b> {{name}}.";
    const creative = mapSeoReportRow({
      id: REPORT,
      organization_id: ORG,
      status: "Ready",
      package_json: reportPackage,
      accompanying_email_json: {
        schemaVersion: SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
        generated: { subject: " Hi ", body: ` ${creativeBody} ` },
        generation: {
          stage: "seo_accompanying_email",
          model: "google/gemini-2.5-flash",
          role: "analysis",
        },
      },
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(creative.accompanying_email?.generated.subject, "Hi");
    assert.equal(creative.accompanying_email?.generated.body, creativeBody);
    assert.deepEqual(toPublicSeoReportDetail(creative).accompanyingEmail, {
      subject: "Hi",
      body: creativeBody,
    });

    const blank = readStoredSeoAccompanyingEmail({
      schemaVersion: SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
      generated: { subject: "   ", body: creativeBody },
      generation: {
        stage: "seo_accompanying_email",
        model: null,
        role: "analysis",
      },
    });
    assert.equal(blank, null);
  });

  it("formats copy text and routes Continue to the existing Gmail destination", () => {
    const full = formatSeoAccompanyingFullEmail({
      subject: "Point sur votre visibilité",
      body: STRATEGIC_BODY,
    });
    assert.equal(
      full,
      `Subject: Point sur votre visibilité\n\n${STRATEGIC_BODY}`,
    );
    const destination = resolveAssetContinuationDestination({
      assetType: "email_outreach",
    });
    assert.equal(destination.destinationId, "gmail");
    assert.equal(
      destination.url,
      "https://mail.google.com/mail/u/0/#inbox?compose=new",
    );

    const card = read("components/seo/SeoAccompanyingEmailCard.tsx");
    assert.match(card, /text=\{email\.subject\}/);
    assert.match(card, /text=\{email\.body\}/);
    assert.match(card, /text=\{fullEmail\}/);
    assert.match(card, /formatSeoAccompanyingFullEmail/);
    assert.match(card, /assetType="email_outreach"/);
    assert.match(card, /tracking=\{null\}/g);
    assert.equal((card.match(/tracking=\{null\}/g) ?? []).length, 3);
    assert.doesNotMatch(
      card,
      /ProspectConversationPanel|DeploymentAssets|StrategicAssetBlueprint|asset-interactions/,
    );
    assert.match(card, /status !== "Ready" \|\| !email/);

    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(intelligence, /SeoAccompanyingEmailCard/);
    assert.match(technical, /SeoAccompanyingEmailCard/);
    assert.doesNotMatch(intelligence, /ProspectConversationPanel|DeploymentAssets/);
    assert.doesNotMatch(technical, /ProspectConversationPanel|DeploymentAssets/);
  });

  it("localizes chrome in six locales and leaves generated text verbatim", () => {
    const englishKeys = leafKeys(en.seo.accompanyingEmail).sort();
    for (const messages of [fr, es, itMessages, de, pt] as TenantMessages[]) {
      assert.deepEqual(leafKeys(messages.seo.accompanyingEmail).sort(), englishKeys);
      for (const value of Object.values(messages.seo.accompanyingEmail)) {
        assert.equal(typeof value, "string");
        assert.ok(value.trim().length > 0);
      }
    }
    assert.notEqual(fr.seo.accompanyingEmail.copySubject, en.seo.accompanyingEmail.copySubject);
    const card = read("components/seo/SeoAccompanyingEmailCard.tsx");
    assert.match(card, /\{email\.subject\}/);
    assert.match(card, /\{email\.body\}/);
    assert.doesNotMatch(card, /messages\.seo\.accompanyingEmail\.subject[^L]/);
  });
});

describe("SEO accompanying email worker and routing contracts", () => {
  it("attaches one email after a valid package and still completes Ready", () => {
    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    const early = executor.slice(
      executor.indexOf("Ready reports are immutable"),
      executor.indexOf("const generationType"),
    );
    assert.doesNotMatch(early, /generateSeoAccompanyingEmail/);
    const pipelineAt = executor.indexOf("runSeoGenerationPipeline");
    const emailAt = executor.indexOf("await generateSeoAccompanyingEmail(");
    const completeAt = executor.lastIndexOf("completeSeoGenerationJobWithClaim");
    const persistAt = executor.indexOf("await persistSeoAccompanyingEmailIfAbsent");
    const completedAt = executor.lastIndexOf('return "completed"');
    assert.ok(pipelineAt < emailAt);
    assert.ok(emailAt < completeAt);
    assert.ok(completeAt < persistAt);
    assert.ok(persistAt < completedAt);
    assert.equal(
      (executor.match(/await generateSeoAccompanyingEmail\(/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(executor, /\.update\(/);
    assert.doesNotMatch(
      executor,
      /reserveFreeVisibility|consumeFreeVisibility|free_visibility/,
    );
    const success = executor.slice(completeAt, completedAt);
    assert.doesNotMatch(success, /failSeoGenerationJobWithClaim/);
    assert.match(success, /accompanying_email_persist_failed/);
  });

  it("leaves free Visibility reservation and regeneration isolation unchanged", () => {
    const migration = read(
      "supabase/migrations/20261019000001_add_seo_reports_accompanying_email.sql",
    );
    assert.match(migration, /add column if not exists accompanying_email_json jsonb/);
    assert.doesNotMatch(migration, /^\s*update\s+seo_reports/im);
    assert.doesNotMatch(migration, /free_visibility/);
    assert.doesNotMatch(
      migration,
      /complete_athena_seo_generation_job|claim_athena_seo_generation_job/,
    );

    const orchestration = read("services/seo/seoReportOrchestration.ts");
    const freeVisibility = read("services/seo/freeVisibilityOrchestration.ts");
    const service = read("services/seo/seoReportService.ts");
    assert.match(orchestration, /Regenerate creates a NEW report row/);
    assert.match(orchestration, /return createSeoReportWithJob/);
    assert.doesNotMatch(freeVisibility, /accompanying_email/);
    assert.match(service, /\.eq\("id", input\.reportId\)/);
    assert.match(service, /\.eq\("organization_id", input\.organizationId\)/);
    assert.match(service, /\.eq\("status", "Ready"\)/);
    assert.match(service, /\.is\("accompanying_email_json", null\)/);
    const create = service.slice(
      service.indexOf("export async function createSeoReport"),
      service.indexOf("export async function markSeoReportEnqueueFailed"),
    );
    assert.doesNotMatch(create, /accompanying_email_json/);

    const prompts = read("services/ai/prompts/seo/seoExecutiveAssessmentPrompt.ts");
    assert.doesNotMatch(prompts, /accompanying_email|seo_accompanying_email/);
    const generation = read("services/seo/seoAccompanyingEmailGeneration.ts");
    const emailModule = read("services/seo/seoAccompanyingEmail.ts");
    assert.doesNotMatch(generation, /tenantI18n|organizationLanguage/);
    assert.doesNotMatch(generation, /findSeoAccompanyingEmailViolations/);
    assert.equal((generation.match(/await generate\(/g) ?? []).length, 1);
    assert.doesNotMatch(
      emailModule,
      /findSeoAccompanyingEmailViolations|PROHIBITED_CLAIM|EMAIL_ADDRESS|NAMED_GREETING|SUBJECT_MIN|BODY_MIN/,
    );
    assert.match(emailModule, /Do not invent recipient names/);
    assert.match(
      emailModule,
      /Boundary: do not claim search positions, visitor counts, or promised outcomes/,
    );
  });

  it("routes seo_accompanying_email through analysis and honors the analysis override", () => {
    clearRouting();
    const defaults = resolveModelForStage("seo_accompanying_email");
    assert.equal(defaults.role, "analysis");
    assert.equal(defaults.model, "google/gemini-2.5-flash");
    assert.equal(
      resolveModelForStage("seo_executive_assessment").role,
      "premiumStrategicOutput",
    );
    assert.equal(resolveModelForStage("seo_roadmap").role, "premiumStrategicOutput");

    process.env.OPENROUTER_ANALYSIS_MODEL = "openai/gpt-test-analysis";
    process.env.OPENROUTER_PREMIUM_MODEL = "anthropic/claude-sonnet-4";
    process.env.OPENROUTER_STRATEGIC_BLUEPRINT_MODEL =
      "anthropic/claude-sonnet-4.6";
    const overridden = resolveModelForStage("seo_accompanying_email");
    assert.equal(overridden.role, "analysis");
    assert.equal(overridden.model, "openai/gpt-test-analysis");
    assert.equal(
      resolveModelForStage("seo_section_analysis").model,
      "openai/gpt-test-analysis",
    );
    assert.equal(
      resolveModelForStage("seo_executive_assessment").model,
      "anthropic/claude-sonnet-4",
    );
    assert.notEqual(
      resolveModelForStage("strategic_blueprint").model,
      overridden.model,
    );

    const prompt = buildSeoAccompanyingEmailPrompt({
      generationType: "intelligence",
      brainAvailable: true,
      brainIdentityBlock: brainBlock(),
      languageCue: "fr",
      voice: "calm, precise, never salesy",
      positioning: "Atelier Nord consultative workshops",
      commercialIdentity: atelier,
      grounding: "Report-grounded next step: Publish FAQ covering booking and fit questions",
    });
    assert.match(prompt, /calm, precise, never salesy/);
    assert.equal(prompt.includes(en.seo.accompanyingEmail.copyFull), false);
  });
});
