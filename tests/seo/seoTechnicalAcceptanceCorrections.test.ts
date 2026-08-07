import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  classifyRedirectInterpretation,
  analyzeTechnicalSeoEvidence,
  formatTechnicalEvidenceForPrompt,
} from "../../services/seo/seoTechnicalAnalyzer";
import {
  filterEvidenceBackedRecommendedLinks,
  hasRedirectChainRemediationEvidence,
  textClaimsRedirectChainRemediation,
} from "../../services/seo/seoTechnicalInternalLinks";
import { buildCompletePageMetadataMatrix } from "../../services/seo/seoTechnicalPageMetadata";
import {
  actionPlanHasOrphanCritical,
  normalizeActionPlanSeverityConsistency,
  SEO_TECHNICAL_PRIORITIES,
} from "../../services/seo/seoTechnicalSeverity";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";
import { validateSeoTechnicalPackage } from "../../services/seo/seoTechnicalValidation";
import { assessTechnicalSeoEvidenceSufficiency } from "../../services/seo/seoTechnicalEvidence";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function intel(
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

const basePages: DeepWebsiteIntelligence["pages"] = [
  {
    url: "https://example.com/",
    title: "Home",
    page_type: "homepage",
    excerpt: "Home",
    meta_description: "Home description that is long enough for band tests here",
    headings: [{ level: 1, text: "Home" }],
    canonical_url: "https://example.com/",
    self_canonical: true,
    http_status: 200,
    redirect_count: 0,
    content_chars: 1200,
    schema_summary: { types: ["Organization"], raw_json_ld_count: 1 },
    internal_link_count: 5,
    internal_links_sample: [
      {
        url: "https://example.com/services",
        anchor: "Services",
        provenance: "nav",
      },
    ],
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
    redirect_count: 1,
    content_chars: 900,
    internal_link_count: 1,
    internal_links_sample: [],
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
    redirect_count: 2,
    content_chars: 1000,
    internal_link_count: 2,
  },
];

function validPackage(
  overrides: Partial<SeoTechnicalPackage> = {},
): SeoTechnicalPackage {
  const technicalCoverage = analyzeTechnicalSeoEvidence(intel(basePages));
  return {
    generationType: "technical",
    reportName: "Technical SEO Report",
    briefMode: "inferred",
    executiveEvaluation: {
      overallAssessment: "Solid foundations with selective gaps.",
      strengths: ["Most pages return 200"],
      criticalIssues: [],
      warnings: ["Image alt coverage is incomplete"],
      remediationPriorities: ["Improve image alt coverage"],
      summary: "Address image alt and weak linking next.",
    },
    technicalCoverage,
    pageMetadata: [
      {
        url: "https://example.com/",
        currentTitle: "Home",
        recommendedTitle: "Clinic Home | Example",
        currentDescription:
          "Home description that is long enough for band tests here",
        recommendedDescription: "Recommended home meta description",
        h1Observation: "H1: Home",
        recommendedH1: null,
        canonicalObservation: "Self-canonical",
        robotsObservation: null,
      },
    ],
    siteArchitecture: {
      architectureFindings: ["Homepage links to key service pages"],
      linkingEvidence: ["Sample edge homepage → services is evidenced"],
      weaklyLinkedCandidates: ["https://example.com/about (1)"],
      recommendedLinks: [
        {
          fromUrl: "https://example.com/",
          toUrl: "https://example.com/services",
          recommendedAnchor: "explore our services",
          rationale: "Polish evidenced nav link anchor",
        },
        {
          fromUrl: "https://example.com/about",
          toUrl: "https://example.com/services",
          recommendedAnchor: "invented",
          rationale: "Unsupported invented edge",
        },
      ],
      summary: "Use evidenced edges only.",
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
      statusFindings: ["Analyzed pages mostly return HTTP 200"],
      redirectFindings: [
        "Single-hop final-200 on /about is informational",
        "Multi-hop redirect chain candidate on /services",
      ],
      canonicalFindings: ["Canonicals are self-referencing"],
      robotsFindings: ["No noindex directives detected"],
      summary: "Crawl health is mostly stable.",
    },
    actionPlan: {
      overview: "Prioritize evidenced technical gaps.",
      items: [
        {
          priority: "High",
          title: "Improve image alt coverage",
          affectedPages: ["https://example.com/"],
          evidence: "Image alt missing counts from Website Intelligence",
          reason: "Missing alt reduces accessibility and image SEO",
          recommendedAction: "Add descriptive alt attributes",
        },
        {
          priority: "High",
          title: "Address redirect chain on services",
          affectedPages: ["https://example.com/services"],
          evidence: "redirectCount=2 on services page",
          reason: "Multi-hop redirects dilute crawl efficiency",
          recommendedAction: "Collapse redirect chain to a single hop",
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
      metadataTableNotes:
        "Use the complete pageMetadata matrix across the analyzed corpus.",
      headingRecommendations: ["Keep a single descriptive H1 per page"],
      internalLinkPlan: ["Polish evidenced homepage → services anchor"],
      schemaRecommendations: ["Add Service schema on commercial pages"],
      redirectRecommendations: [
        "Collapse multi-hop redirect chain on /services",
      ],
      developerRemediationInstructions: [
        "Update title/meta tags from the metadata matrix",
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

describe("1 — redirect interpretation accuracy", () => {
  it("classifies none / single-hop final-200 / multi-hop chain candidates", () => {
    assert.equal(classifyRedirectInterpretation(0, 200), "none");
    assert.equal(
      classifyRedirectInterpretation(1, 200),
      "single_hop_final_200",
    );
    assert.equal(
      classifyRedirectInterpretation(2, 200),
      "redirect_chain_candidate",
    );
    assert.equal(classifyRedirectInterpretation(3, 301), "redirect_chain_candidate");
  });

  it("single-hop final-200 is informational and not remediation debt", () => {
    const evidence = analyzeTechnicalSeoEvidence(intel(basePages));
    assert.equal(evidence.crawl.singleHopFinal200Pages, 1);
    assert.equal(evidence.crawl.redirectChainCandidatePages, 1);
    assert.equal(evidence.crawl.redirectPages, 2);
    assert.equal(hasRedirectChainRemediationEvidence(evidence), true);

    const singleOnly = analyzeTechnicalSeoEvidence(
      intel([
        {
          ...basePages[0]!,
          redirect_count: 0,
        },
        {
          ...basePages[1]!,
          redirect_count: 1,
          http_status: 200,
        },
        {
          ...basePages[2]!,
          redirect_count: 0,
        },
      ]),
    );
    assert.equal(singleOnly.crawl.singleHopFinal200Pages, 1);
    assert.equal(singleOnly.crawl.redirectChainCandidatePages, 0);
    assert.equal(hasRedirectChainRemediationEvidence(singleOnly), false);
    assert.equal(
      textClaimsRedirectChainRemediation("Optimize Redirect Chains"),
      true,
    );

    const pkg = validateSeoTechnicalPackage(
      validPackage({
        technicalCoverage: singleOnly,
        actionPlan: {
          overview: "No false redirect debt",
          items: [
            {
              priority: "High",
              title: "Optimize Redirect Chains",
              affectedPages: ["https://example.com/about"],
              evidence: "redirectCount=1 final 200",
              reason: "Should not become remediation",
              recommendedAction: "Optimize redirect chains on about",
            },
            {
              priority: "High",
              title: "Improve image alt coverage",
              affectedPages: ["https://example.com/"],
              evidence: "missing alt",
              reason: "alt gaps",
              recommendedAction: "Add alt text",
            },
            {
              priority: "Improvement",
              title: "Add Service schema",
              affectedPages: ["https://example.com/services"],
              evidence: "schema gap",
              reason: "schema",
              recommendedAction: "Add Service JSON-LD",
            },
            {
              priority: "Improvement",
              title: "Keep metadata healthy",
              affectedPages: ["https://example.com/"],
              evidence: "titles present",
              reason: "maintain",
              recommendedAction: "Keep titles current",
            },
          ],
        },
        implementationAssets: {
          ...validPackage().implementationAssets,
          redirectRecommendations: [
            "Optimize Redirect Chains on /about",
            "Note: single-hop normalization observed on /about",
          ],
        },
      }),
    );
    assert.equal(
      pkg.actionPlan.items.some((item) =>
        /optimize redirect chains/i.test(item.title),
      ),
      false,
    );
    assert.equal(
      pkg.implementationAssets.redirectRecommendations.some((item) =>
        textClaimsRedirectChainRemediation(item),
      ),
      false,
    );
  });

  it("multi-hop remains eligible for redirect-chain remediation", () => {
    const evidence = analyzeTechnicalSeoEvidence(intel(basePages));
    assert.ok(
      evidence.crawl.redirectChainCandidates.some(
        (row) => row.url === "https://example.com/services" && row.redirectCount >= 2,
      ),
    );
    const pkg = validateSeoTechnicalPackage(validPackage());
    assert.ok(
      pkg.actionPlan.items.some((item) =>
        /redirect chain/i.test(item.title + item.recommendedAction),
      ),
    );
    assert.ok(pkg.implementationAssets.redirectRecommendations.length >= 1);
  });

  it("prompt packaging exposes redirect interpretation rules", () => {
    const block = formatTechnicalEvidenceForPrompt(
      analyzeTechnicalSeoEvidence(intel(basePages)),
    );
    assert.match(block, /single_hop_final_200/);
    assert.match(block, /redirect_chain_candidate/);
    assert.match(block, /MUST NOT by itself generate redirect-chain remediation/);
  });
});

describe("2 — severity consistency", () => {
  it("shares Critical/High/Improvement taxonomy", () => {
    assert.deepEqual([...SEO_TECHNICAL_PRIORITIES], [
      "Critical",
      "High",
      "Improvement",
    ]);
    const actionPrompt = read(
      "services/ai/prompts/seo/seoTechnicalActionPlanPrompt.ts",
    );
    assert.match(actionPrompt, /Do NOT require that every severity tier appears/);
    assert.match(actionPrompt, /Critical ONLY when/);
  });

  it("normalizes Action Plan Critical when executive has none", () => {
    const orphan = {
      overview: "Plan",
      items: [
        {
          priority: "Critical" as const,
          title: "Fix H1",
          affectedPages: ["https://example.com/"],
          evidence: "multiple H1",
          reason: "heading polish",
          recommendedAction: "Keep one H1",
        },
        {
          priority: "High" as const,
          title: "Alt text",
          affectedPages: [],
          evidence: "alt",
          reason: "alt",
          recommendedAction: "Add alt",
        },
        {
          priority: "Improvement" as const,
          title: "Schema",
          affectedPages: [],
          evidence: "schema",
          reason: "schema",
          recommendedAction: "Add schema",
        },
      ],
    };
    const executive = {
      overallAssessment: "ok",
      strengths: ["ok"],
      criticalIssues: [] as string[],
      warnings: ["warn"],
      remediationPriorities: ["next"],
      summary: "summary",
    };
    assert.equal(actionPlanHasOrphanCritical(orphan, executive), true);
    const normalized = normalizeActionPlanSeverityConsistency(orphan, executive);
    assert.equal(
      normalized.items.every((item) => item.priority !== "Critical"),
      true,
    );
    assert.equal(normalized.items[0]?.priority, "High");
  });

  it("validation prevents cross-section Critical contradiction", () => {
    const pkg = validateSeoTechnicalPackage(
      validPackage({
        executiveEvaluation: {
          ...validPackage().executiveEvaluation,
          criticalIssues: [],
        },
        actionPlan: {
          overview: "Forced critical without executive critical",
          items: [
            {
              priority: "Critical",
              title: "Tune meta description length",
              affectedPages: ["https://example.com/"],
              evidence: "description band short",
              reason: "metadata polish",
              recommendedAction: "Lengthen meta description",
            },
            {
              priority: "High",
              title: "Improve image alt coverage",
              affectedPages: ["https://example.com/"],
              evidence: "alt missing",
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
    assert.equal(pkg.executiveEvaluation.criticalIssues.length, 0);
    assert.equal(
      pkg.actionPlan.items.some((item) => item.priority === "Critical"),
      false,
    );
  });

  it("preserves Critical when executive critical evidence exists", () => {
    const pkg = validateSeoTechnicalPackage(
      validPackage({
        executiveEvaluation: {
          ...validPackage().executiveEvaluation,
          criticalIssues: ["Multiple analyzed pages return HTTP 404"],
        },
        actionPlan: {
          overview: "Critical crawl failures",
          items: [
            {
              priority: "Critical",
              title: "Resolve hard HTTP errors",
              affectedPages: ["https://example.com/missing"],
              evidence: "HTTP 404 distribution",
              reason: "Broken pages block crawl",
              recommendedAction: "Fix or redirect 404 pages",
            },
            {
              priority: "High",
              title: "Improve image alt coverage",
              affectedPages: ["https://example.com/"],
              evidence: "alt missing",
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
    assert.ok(pkg.actionPlan.items.some((item) => item.priority === "Critical"));
  });
});

describe("3 — complete page-level metadata matrix", () => {
  it("includes every analyzed page including healthy pages", () => {
    const evidence = analyzeTechnicalSeoEvidence(intel(basePages));
    const matrix = buildCompletePageMetadataMatrix(evidence, [
      {
        url: "https://example.com/",
        recommendedTitle: "Clinic Home | Example",
        recommendedDescription: "Recommended home meta",
      },
    ]);
    assert.equal(matrix.length, evidence.pages.length);
    assert.equal(matrix.length, 3);
    const home = matrix.find((row) => row.url === "https://example.com/");
    const about = matrix.find((row) => row.url === "https://example.com/about");
    assert.equal(home?.recommendedTitle, "Clinic Home | Example");
    assert.equal(about?.recommendedTitle, null);
    assert.equal(about?.currentTitle, "About");
    assert.ok(Array.isArray(about?.issueFlags));
    assert.ok(about?.issueFlags?.includes("single_hop_redirect_informational"));
  });

  it("validation rebuilds complete matrix from technicalCoverage.pages", () => {
    const pkg = validateSeoTechnicalPackage(
      validPackage({
        pageMetadata: [
          {
            url: "https://example.com/",
            currentTitle: "Home",
            recommendedTitle: "Clinic Home | Example",
            currentDescription: null,
            recommendedDescription: "Recommended",
            h1Observation: null,
            recommendedH1: null,
            canonicalObservation: null,
            robotsObservation: null,
          },
        ],
      }),
    );
    assert.equal(pkg.pageMetadata.length, pkg.technicalCoverage.pages.length);
    assert.ok(
      pkg.pageMetadata.every((row) => typeof row.httpStatus !== "undefined"),
    );
    assert.ok(
      pkg.pageMetadata.some(
        (row) =>
          row.url === "https://example.com/about" &&
          row.recommendedTitle == null,
      ),
    );
  });

  it("recommendations prompt no longer treats sparse pageMetadata as inventory", () => {
    const prompt = read(
      "services/ai/prompts/seo/seoTechnicalRecommendationsPrompt.ts",
    );
    assert.match(prompt, /OPTIONAL AI overlays only/);
    assert.match(prompt, /Do NOT treat sparse pageMetadata as the page inventory/);
    assert.doesNotMatch(
      prompt,
      /omit healthy pages when unnecessary\. Prefer actionable rows over noise/,
    );
  });
});

describe("4 — evidence-backed internal linking", () => {
  it("exposes internal link samples in analyzer/package evidence", () => {
    const evidence = analyzeTechnicalSeoEvidence(intel(basePages));
    assert.ok(evidence.internalLinks.linkEdgeSamples.length >= 1);
    assert.equal(
      evidence.internalLinks.linkEdgeSamples[0]?.sourceUrl,
      "https://example.com/",
    );
    assert.equal(
      evidence.internalLinks.linkEdgeSamples[0]?.destinationUrl,
      "https://example.com/services",
    );
    assert.equal(evidence.internalLinks.linkEdgeSamples[0]?.anchor, "Services");
    const block = formatTechnicalEvidenceForPrompt(evidence);
    assert.match(block, /INTERNAL LINK EDGE SAMPLES/);
    assert.match(block, /internalLinksSample/);
  });

  it("rejects invented unsupported source→destination edges", () => {
    const evidence = analyzeTechnicalSeoEvidence(intel(basePages));
    const filtered = filterEvidenceBackedRecommendedLinks(
      [
        {
          fromUrl: "https://example.com/",
          toUrl: "https://example.com/services",
          recommendedAnchor: "explore our services",
          rationale: "evidenced",
        },
        {
          fromUrl: "https://example.com/about",
          toUrl: "https://example.com/services",
          recommendedAnchor: "invented",
          rationale: "not evidenced",
        },
      ],
      evidence,
    );
    assert.equal(filtered.kept.length, 1);
    assert.equal(filtered.rejectedUnsupported, 1);

    const pkg = validateSeoTechnicalPackage(validPackage());
    assert.equal(pkg.siteArchitecture.recommendedLinks.length, 1);
    assert.equal(
      pkg.siteArchitecture.recommendedLinks[0]?.fromUrl,
      "https://example.com/",
    );
    assert.match(
      pkg.siteArchitecture.linkingEvidence.join(" "),
      /evidence-backed|omitted|Sample edge/i,
    );
  });
});

describe("5 — /seo workspace positioning + dual CTAs", () => {
  it("positions workspace for both SEO Intelligence and Technical SEO", () => {
    const page = read("app/seo/page.tsx");
    assert.match(page, /SEO Workspace/);
    assert.match(page, /Generate SEO Intelligence/);
    assert.match(page, /Generate Technical SEO/);
    assert.match(page, /evidence-backed technical optimization/);
    assert.doesNotMatch(page, /not a traditional crawler audit/);
  });

  it("exposes orange + green CTAs on library empty and populated states", () => {
    const library = read("components/seo/SeoLibraryClient.tsx");
    assert.match(library, /Generate SEO Intelligence/);
    assert.match(library, /Generate Technical SEO/);
    assert.match(library, /--athena-orange/);
    assert.match(library, /--athena-success/);
    assert.equal(
      (library.match(/Generate Technical SEO/g) ?? []).length >= 2,
      true,
    );
  });
});

describe("regression guards", () => {
  it("keeps technical evidence gate compatible", () => {
    const assessment = assessTechnicalSeoEvidenceSufficiency(intel(basePages));
    assert.equal(assessment.sufficient, true);
  });

  it("does not alter Deep Scrape redirect continuation module", () => {
    const redirect = read(
      "services/websiteLearning/deepScrape/crawler/redirectContinuation.ts",
    );
    assert.match(redirect, /Continue a redirect chain/);
    assert.match(redirect, /redirectCount/);
  });

  it("strategic SEO prompt constraints remain separate", () => {
    const strategic = read("services/ai/prompts/seo/seoSharedConstraints.ts");
    assert.match(strategic, /SEO_SHARED/);
    const technical = read(
      "services/ai/prompts/seo/seoTechnicalSharedConstraints.ts",
    );
    assert.match(technical, /SEO_TECHNICAL_REDIRECT_INTERPRETATION_RULES/);
    assert.notEqual(strategic, technical);
  });
});
