import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SeoOrganizationContext } from "../../services/seo/seoContextComposer";
import { SeoGenerationPipelineError } from "../../services/seo/seoGenerationPipeline";
import {
  runSeoTechnicalGenerationPipeline,
  type SeoTechnicalGenerationPipelineDeps,
} from "../../services/seo/seoTechnicalGenerationPipeline";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const ROOT = process.cwd();
const PLAIN_OVERVIEW =
  "Prioritize metadata completeness and image alt remediation.";
const PRESERVED_OVERVIEW = 'Say "hello" keep \\tmp and It\u2019s ready';

function intelligence(): DeepWebsiteIntelligence {
  return {
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
  };
}

function context(): SeoOrganizationContext {
  return {
    organizationId: "org-technical-json",
    briefMode: "inferred",
    brief: { name: "Technical SEO Report", generationType: "technical" },
    brainIdentityBlock: "",
    organizationIntelligenceBlock: "",
    deepWebsiteIntelligenceBlock: "",
    executiveIntelligenceBlock: "",
    personasBlock: "",
    communitiesBlock: "",
    adsKeywordThemesBlock: "",
    operatorGuidanceBlock: "",
    composedPromptContext: "Organization context",
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
    meta: {
      personaCount: 0,
      brainAvailable: false,
      deepIntelligenceAvailable: true,
      executiveIntelligenceAvailable: false,
      adsKeywordThemesAvailable: false,
      totalChars: 20,
      websitePagesSnapshotCount: 1,
    },
  };
}

function executiveEvaluation() {
  return {
    overallAssessment: "Solid foundations with metadata gaps.",
    strengths: ["Most pages return 200"],
    criticalIssues: ["One page missing title coverage in corpus sample"],
    warnings: ["Image alt coverage is incomplete"],
    remediationPriorities: ["Fix missing titles and alt text first"],
    summary: "Address metadata and image alt gaps next.",
  };
}

function recommendations() {
  return {
    pageMetadata: [],
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
      summary: "Improve image accessibility and image SEO alt coverage.",
    },
    crawlFindings: {
      statusFindings: ["All analyzed pages returned HTTP 200"],
      redirectFindings: ["No multi-hop redirects detected"],
      canonicalFindings: ["Canonicals are self-referencing"],
      robotsFindings: ["No noindex directives detected"],
      summary: "Crawl health looks stable for analyzed pages.",
    },
  };
}

function actionPayload(input?: { overview?: string; notes?: string }) {
  return {
    reportName: "Technical SEO Report",
    actionPlan: {
      overview: input?.overview ?? PLAIN_OVERVIEW,
      items: [
        {
          priority: "Critical",
          title: "Close metadata gaps",
          affectedPages: ["https://example.com/"],
          evidence: "Deterministic metadata coverage findings",
          reason: "Missing or weak metadata reduces clarity",
          recommendedAction: "Implement recommended titles and descriptions",
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
      metadataTableNotes: input?.notes ?? "Use pageMetadata recommendations as the source table.",
      headingRecommendations: ["Keep a single descriptive H1 per page"],
      internalLinkPlan: ["Link About to Services with descriptive anchors"],
      schemaRecommendations: ["Add Service schema on commercial pages"],
      redirectRecommendations: [],
      developerRemediationInstructions: [
        "Update title and meta tags from the metadata table",
        "Add missing image alt attributes",
      ],
    },
  };
}

function actionJson(input?: { overview?: string; notes?: string }): string {
  return JSON.stringify(actionPayload(input));
}

async function runWithResponses(input: {
  executive?: string;
  recommendations?: string;
  action: string;
  failStage?: string;
}) {
  const calls: string[] = [];
  const generateReview: NonNullable<
    SeoTechnicalGenerationPipelineDeps["generateReview"]
  > = async (_prompt, meta) => {
    const stage = meta?.stage ?? "";
    calls.push(stage);
    if (input.failStage && stage === input.failStage) {
      throw new Error("OpenRouter API error: 503 unavailable");
    }
    if (stage === "seo.technical.technical_executive_evaluation") {
      return input.executive ?? JSON.stringify(executiveEvaluation());
    }
    if (stage === "seo.technical.technical_recommendations") {
      return input.recommendations ?? JSON.stringify(recommendations());
    }
    if (stage === "seo.technical.technical_action_plan") {
      return input.action;
    }
    throw new Error(`unexpected stage ${stage}`);
  };

  const deps: SeoTechnicalGenerationPipelineDeps = {
    composeContext: async () => context(),
    loadDeepIntelligence: async () => intelligence(),
    generateReview,
  };

  const result = await runSeoTechnicalGenerationPipeline({
    organizationId: "org-technical-json",
    brief: { name: "Technical SEO Report", generationType: "technical" },
    deps,
  });
  return { result, calls };
}

async function expectActionStageRejection(action: string) {
  const calls: string[] = [];
  const generateReview: NonNullable<
    SeoTechnicalGenerationPipelineDeps["generateReview"]
  > = async (_prompt, meta) => {
    const stage = meta?.stage ?? "";
    calls.push(stage);
    if (stage === "seo.technical.technical_executive_evaluation") {
      return JSON.stringify(executiveEvaluation());
    }
    if (stage === "seo.technical.technical_recommendations") {
      return JSON.stringify(recommendations());
    }
    return action;
  };
  await assert.rejects(
    () =>
      runSeoTechnicalGenerationPipeline({
        organizationId: "org-technical-json",
        brief: { name: "Technical SEO Report", generationType: "technical" },
        deps: {
          composeContext: async () => context(),
          loadDeepIntelligence: async () => intelligence(),
          generateReview,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SeoGenerationPipelineError);
      assert.equal(error.code, "MALFORMED_JSON");
      assert.equal(error.stage, "technical_action_plan");
      assert.equal(error.retryable, true);
      assert.match(
        error.message,
        /malformed JSON at stage technical_action_plan/,
      );
      return true;
    },
  );
  assert.deepEqual(calls, [
    "seo.technical.technical_executive_evaluation",
    "seo.technical.technical_recommendations",
    "seo.technical.technical_action_plan",
  ]);
}

describe("technical SEO JSON recovery", () => {
  it("keeps parser recovery inside the technical pipeline", () => {
    const source = readFileSync(
      join(ROOT, "services/seo/seoTechnicalGenerationPipeline.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /safeParseStrategicBlueprint|parseSocialPlannerStructuredOutput|parseAdsJsonObject|modelRouting|max_tokens|maxTokens/,
    );
    assert.match(source, /MALFORMED_JSON/);
  });

  it("accepts a single JSON object, surrounding whitespace, fences, and harmless prose", async () => {
    const json = actionJson();
    const wrappers = [
      (value: string) => value,
      (value: string) => `  \n${value}\n  `,
      (value: string) => `\n  \`\`\`json\n${value}\n\`\`\`  \n`,
      (value: string) => `  \`\`\`JSON\n${value}\n\`\`\``,
      (value: string) =>
        `Here is the technical action plan:\n${value}\nHope this helps.`,
      (value: string) => `Plan:\n\`\`\`json\n${value}\n\`\`\`\nThanks.`,
    ];

    for (const wrap of wrappers) {
      const { result, calls } = await runWithResponses({ action: wrap(json) });
      assert.equal(result.package.actionPlan.overview, PLAIN_OVERVIEW);
      assert.equal(result.package.actionPlan.items.length, 3);
      assert.equal(result.package.actionPlan.items[0]?.title, "Close metadata gaps");
      assert.equal(calls.length, 3);
    }
  });

  it("repairs trailing commas without rewriting string values", async () => {
    const json = actionJson({ notes: "see a,}" });
    const itemCloser =
      '"recommendedAction":"Implement Service JSON-LD"}]';
    const withNested = json.replace(
      itemCloser,
      '"recommendedAction":"Implement Service JSON-LD",},]',
    );
    assert.notEqual(withNested, json);
    const malformed = withNested.replace(/}$/, ",}");
    const { result, calls } = await runWithResponses({ action: malformed });
    assert.equal(result.package.implementationAssets.metadataTableNotes, "see a,}");
    assert.equal(result.package.actionPlan.items.length, 3);
    assert.equal(calls.length, 3);
  });

  it("repairs smart double quotes used as delimiters and preserves curly apostrophes", async () => {
    const overview = "It\u2019s ready for metadata work";
    const json = actionJson({ overview });
    const encoded = `"overview":${JSON.stringify(overview)}`;
    const smart = json.replace(
      encoded,
      `\u201Coverview\u201D:\u201C${overview}\u201D`,
    );
    const { result, calls } = await runWithResponses({ action: smart });
    assert.equal(result.package.actionPlan.overview, overview);
    assert.equal(calls.length, 3);
  });

  it("preserves curly double quotes that are already inside JSON strings", async () => {
    const overview = "The \u201Cbest\u201D plan";
    const json = actionJson({ overview }).replace(/}$/, ",}");
    const { result } = await runWithResponses({ action: json });
    assert.equal(result.package.actionPlan.overview, overview);
  });

  it("escapes raw control characters inside strings and preserves escaped content", async () => {
    const json = actionJson({
      overview: PRESERVED_OVERVIEW,
      notes: "see a,}",
    });
    const marker = `"overview":${JSON.stringify(PRESERVED_OVERVIEW)}`;
    const valueStart = json.indexOf(marker) + `"overview":"`.length;
    assert.ok(valueStart > `"overview":"`.length);
    const withControls = `${json.slice(0, valueStart)}line1\nline2\t\u0001${json.slice(valueStart)}`;
    const malformed = `${withControls.slice(0, -1)},}`;
    const { result, calls } = await runWithResponses({ action: malformed });
    assert.equal(
      result.package.actionPlan.overview,
      `line1\nline2\t\u0001${PRESERVED_OVERVIEW}`,
    );
    assert.equal(result.package.implementationAssets.metadataTableNotes, "see a,}");
    assert.equal(result.package.actionPlan.items[2]?.recommendedAction, "Implement Service JSON-LD");
    assert.equal(calls.length, 3);
  });

  it("rejects empty content, arrays, primitives, multiple objects, and truncated objects", async () => {
    const json = actionJson();
    const rejected = [
      "",
      "   \n\t  ",
      "[]",
      "[1, 2, 3]",
      `[${json}]`,
      `Here is the list: [${json}]`,
      '"just-a-string"',
      "42",
      "true",
      "false",
      "null",
      `${json}\n${json}`,
      `${json} and also ${json}`,
      `{}${json}`,
      json.slice(0, Math.max(0, json.length - 80)),
      '{ "actionPlan": { "overview": "truncated"',
      "```json\n```",
      "not json at all",
    ];
    for (const action of rejected) {
      await expectActionStageRejection(action);
    }
  });

  it("does not issue another model call after malformed technical_action_plan JSON", async () => {
    await expectActionStageRejection("```json\n{ \"actionPlan\": \n```");
  });

  it("still sends structurally invalid but parseable objects to package validation", async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        runSeoTechnicalGenerationPipeline({
          organizationId: "org-technical-json",
          brief: { name: "Technical SEO Report", generationType: "technical" },
          deps: {
            composeContext: async () => context(),
            loadDeepIntelligence: async () => intelligence(),
            generateReview: async (_prompt, meta) => {
              const stage = meta?.stage ?? "";
              calls.push(stage);
              if (stage === "seo.technical.technical_executive_evaluation") {
                return JSON.stringify(executiveEvaluation());
              }
              if (stage === "seo.technical.technical_recommendations") {
                return JSON.stringify(recommendations());
              }
              return JSON.stringify({
                reportName: "Technical SEO Report",
                actionPlan: {
                  overview: "Parsed but incomplete",
                  items: [],
                },
                implementationAssets: {
                  metadataTableNotes: "notes only",
                },
              });
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SeoGenerationPipelineError);
        assert.equal(error.code, "INVALID_PACKAGE");
        assert.equal(error.stage, "validating");
        assert.equal(error.retryable, true);
        assert.match(error.message, /actionPlan\.items/);
        assert.doesNotMatch(error.message, /MALFORMED_JSON/);
        return true;
      },
    );
    assert.equal(calls.length, 3);
  });

  it("leaves LLM call failures on the existing retryable path", async () => {
    await assert.rejects(
      () =>
        runWithResponses({
          action: actionJson(),
          failStage: "seo.technical.technical_action_plan",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SeoGenerationPipelineError);
        assert.equal(error.code, "LLM_CALL_FAILED");
        assert.equal(error.stage, "technical_action_plan");
        assert.equal(error.retryable, true);
        return true;
      },
    );
  });
});
