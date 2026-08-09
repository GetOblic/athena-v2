import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { BrainEngineContext } from "../../services/brain/brainContextTypes";
import {
  ESTIMATE_CONTEXT_LIMITS,
  composeEstimateOrganizationContext,
  formatEstimateOperatorGuidanceBlock,
  isPersonaContextRelevantForEstimate,
  isTechnicalSeoRelevantForEstimate,
  summarizePersonasForEstimate,
} from "../../services/estimate/estimateContextComposer";
import { IDENTITY_EXECUTIVE_INTELLIGENCE_KEY } from "../../services/identity/identityExecutiveIntelligence";
import type { SeoReport } from "../../services/seo/seoReportTypes";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

type Persona = {
  id: string;
  organization_id: string;
  persona_name: string | null;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  goals: string | null;
  needs: string | null;
  pain_points: string | null;
  objections: string | null;
  motivations: string | null;
  buying_triggers: string | null;
};

function emptyMemoryArrays<T>(): T[] {
  return [];
}

function fakeBrain(
  organizationId: string,
  options?: { geographicReach?: string; withExecutive?: boolean },
): BrainEngineContext {
  const withExecutive = options?.withExecutive !== false;
  const executive = withExecutive
    ? {
        executive_summary: "A B2B coaching business for founders.",
        confidence_level: "strong",
        confidence_reasons: ["Clear offer"],
        voice_alignment: "strong",
        business_knowledge_coverage: "strong",
        website_evidence_coverage: "developing",
        business_model: {
          primary_audience: "Founders",
          geographic_reach: options?.geographicReach ?? "United States",
          value_proposition: "Clarity-led GTM",
        },
        hidden_signals: [],
        calibration_gaps: [],
      }
    : null;

  return {
    organization: {
      id: organizationId,
      name: "Acme",
      slug: "acme",
    },
    scope: "organization",
    identity: {
      identity: {
        greetingName: "Laurent",
        aboutYou: "Operator coach",
        expertise: "Go-to-market",
        website: "https://example.com",
        brainStatus: "trained",
        masterProfile: executive
          ? { [IDENTITY_EXECUTIVE_INTELLIGENCE_KEY]: executive }
          : { voice: "direct" },
        masterProfileVersion: "1",
        homepageLearning: null,
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    businessMemory: {
      identity: {
        greetingName: "Laurent",
        aboutYou: "Operator coach",
        expertise: "Go-to-market",
        website: "https://example.com",
        brainStatus: "trained",
        masterProfile: executive
          ? { [IDENTITY_EXECUTIVE_INTELLIGENCE_KEY]: executive }
          : { voice: "direct" },
        masterProfileVersion: "1",
        homepageLearning: null,
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    domainMemory: {
      domains: [],
    } as BrainEngineContext["domainMemory"],
    discussionMemory: {
      recentDiscussions: [
        {
          id: "disc1",
          title: "Messaging clarity",
          status: "analyzed",
          summary: "Founders struggle to articulate offers",
          opportunityScore: 80,
        },
      ],
      highIntentDiscussions: [],
      recentUpdates: emptyMemoryArrays(),
    } as unknown as BrainEngineContext["discussionMemory"],
    opportunityMemory: {
      recentOpportunities: [
        {
          id: "opp1",
          title: "Offer diagnosis package",
          status: "open",
          urgency: "high",
          score: 90,
        },
      ],
    } as unknown as BrainEngineContext["opportunityMemory"],
    briefingMemory: {
      recentBriefings: [],
    } as unknown as BrainEngineContext["briefingMemory"],
    assetMemory: {
      targetAudiences: ["Founders"],
      businessGoals: ["Booked consults"],
    } as unknown as BrainEngineContext["assetMemory"],
    knowledgeMemory: {
      assets: [],
      communityIntelligence: [],
    } as unknown as BrainEngineContext["knowledgeMemory"],
    feedbackSignals: {} as BrainEngineContext["feedbackSignals"],
    contextSummary: {
      headline: "Clarity demand",
      bullets: [],
    } as unknown as BrainEngineContext["contextSummary"],
    builtAt: new Date().toISOString(),
  };
}

function fakeDeepWebsite(
  contact = "Acme HQ, Tel Aviv, Israel",
): DeepWebsiteIntelligence {
  const knowledge = emptyBusinessKnowledge();
  knowledge.about = "Acme helps founders.";
  knowledge.services = "GTM coaching";
  knowledge.contact_information = contact;
  return {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: "https://example.com",
    scraped_at: "2026-08-01T00:00:00.000Z",
    pages_analyzed: 2,
    pages: [
      {
        url: "https://example.com/",
        title: "Home",
        page_type: "homepage",
        excerpt: "Welcome to Acme",
      },
      {
        url: "https://example.com/services",
        title: "Services",
        page_type: "services",
        excerpt: "GTM coaching packages",
      },
    ],
    business_knowledge: knowledge,
    crawl_summary: {
      pages_analyzed: 2,
      services_discovered: 1,
      faqs_discovered: 0,
      testimonials_discovered: 0,
      team_pages_discovered: 0,
      commercial_pages_discovered: 1,
    },
    positioning: knowledge.positioning,
    products: knowledge.products,
    services: knowledge.services,
    about: knowledge.about,
    target_audience: knowledge.target_audience,
    messaging: knowledge.messaging,
    value_proposition: knowledge.value_proposition,
    cta: knowledge.cta,
    differentiators: knowledge.differentiators,
    trust_signals: knowledge.trust_signals,
    contact_information: knowledge.contact_information,
    brand_tone: knowledge.brand_tone,
    headings: "",
    paragraphs: "",
  };
}

function fakePersona(org: string, name: string): Persona {
  return {
    id: `${org}-${name}`,
    organization_id: org,
    persona_name: name,
    category: "Buyer",
    occupation: "Founder",
    seniority: "Owner",
    goals: "Grow pipeline",
    needs: "Clear offer",
    pain_points: "No clear offer",
    objections: "Too expensive",
    motivations: "Grow pipeline",
    buying_triggers: "Missed quarter",
  };
}

function fakeSeoReport(input: {
  id: string;
  organizationId: string;
  status: SeoReport["status"];
  generationType: "intelligence" | "technical";
  createdAt: string;
  summary: string;
}): SeoReport {
  const package_json =
    input.generationType === "technical"
      ? ({
          generationType: "technical",
          reportName: "Technical SEO",
          briefMode: "inferred",
          executiveEvaluation: {
            overallAssessment: "Needs work",
            strengths: ["Some schema"],
            criticalIssues: ["Missing canonicals"],
            warnings: [],
            remediationPriorities: ["Fix canonicals"],
            summary: input.summary,
          },
          technicalCoverage: {} as never,
          pageMetadata: [],
          siteArchitecture: {
            architectureFindings: [],
            linkingEvidence: [],
            weaklyLinkedCandidates: [],
            recommendedLinks: [],
            summary: "Architecture summary",
          },
          contentHtmlFindings: {
            headingFindings: [],
            metadataFindings: [],
            contentSizeFindings: [],
            structuralRecommendations: [],
            summary: "Content summary",
          },
          structuredData: {
            detectedSchemaEvidence: [],
            missingOpportunityAssessment: "Limited",
            recommendedSchemaTypes: [],
            implementationGuidance: [],
            exampleSnippets: [],
            summary: "Schema summary",
          },
          imageSeo: {
            altCoverageSummary: "ok",
            missingAltFindings: [],
            remediationGuidance: [],
            summary: "Image summary",
          },
          crawlFindings: {
            statusFindings: [],
            redirectFindings: [],
            canonicalFindings: [],
            robotsFindings: [],
            summary: "Crawl summary",
          },
          actionPlan: {
            overview: "Remediate canonicals and metadata",
            items: [],
          },
          implementationAssets: {
            metadataTableNotes: "",
            headingRecommendations: [],
            internalLinkPlan: [],
            schemaRecommendations: [],
            redirectRecommendations: [],
            developerRemediationInstructions: [],
          },
          disclaimer: "disclaimer",
          websitePagesAnalyzed: {
            sourceUrl: null,
            scrapedAt: null,
            pages: [],
          },
        } as SeoReport["package_json"])
      : ({
          generationType: "intelligence",
          reportName: "Strategic SEO",
          briefMode: "inferred",
          executiveAssessment: {
            overallAssessment: "Solid",
            strengths: ["Clear offer pages"],
            weaknesses: ["Thin trust"],
            seoReadiness: "Developing",
            businessVisibilityAssessment: "Moderate",
            summary: input.summary,
          },
          contentCoverage: {} as never,
          customerIntent: {} as never,
          commercialOpportunities: {
            opportunities: [],
            summary: "Content opportunities around founder clarity",
          },
          trustAndAuthority: {} as never,
          ninetyDayRoadmap: {} as never,
          disclaimer: "disclaimer",
          websitePagesAnalyzed: {
            sourceUrl: null,
            scrapedAt: null,
            pages: [],
          },
        } as SeoReport["package_json"]);

  return {
    id: input.id,
    organization_id: input.organizationId,
    user_id: null,
    name:
      input.generationType === "technical"
        ? "Technical SEO Report"
        : "Strategic SEO Report",
    brief_json: { generationType: input.generationType },
    status: input.status,
    generation_stage: input.status === "Ready" ? "completed" : null,
    package_json,
    error_code: null,
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  };
}

describe("Athena Estimate L3 context composer", () => {
  it("1. composer scopes all source loads to supplied organizationId", async () => {
    const org = "org-trusted";
    const foreign = "org-foreign";
    const loadCalls: string[] = [];

    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Need marketing positioning for our customer audience",
      },
      deps: {
        buildBrain: async (organizationId) => {
          loadCalls.push(`brain:${organizationId}`);
          return fakeBrain(organizationId);
        },
        loadDeepIntelligence: async (organizationId) => {
          loadCalls.push(`deep:${organizationId}`);
          return fakeDeepWebsite();
        },
        loadPersonas: async (organizationId) => {
          loadCalls.push(`personas:${organizationId}`);
          return [
            fakePersona(organizationId, "Keep"),
            fakePersona(foreign, "Foreign"),
          ] as never;
        },
        loadSeoReports: async (organizationId) => {
          loadCalls.push(`seo:${organizationId}`);
          return [
            fakeSeoReport({
              id: "s1",
              organizationId,
              status: "Ready",
              generationType: "intelligence",
              createdAt: "2026-08-08T00:00:00.000Z",
              summary: "Strategic summary",
            }),
            fakeSeoReport({
              id: "s-foreign",
              organizationId: foreign,
              status: "Ready",
              generationType: "intelligence",
              createdAt: "2026-08-09T00:00:00.000Z",
              summary: "Foreign strategic",
            }),
          ];
        },
      },
    });

    assert.deepEqual(loadCalls, [
      `brain:${org}`,
      `deep:${org}`,
      `seo:${org}`,
      `personas:${org}`,
    ]);
    assert.equal(context.organizationId, org);
    assert.doesNotMatch(context.trusted.personas, /Foreign/);
    assert.doesNotMatch(context.trusted.strategicSeo, /Foreign strategic/);
    assert.doesNotMatch(context.composedTrustedContext, /org-foreign/);
  });

  it("2/3. trusted context and operator guidance are distinct; operator claims stay out of trusted", async () => {
    const org = "org-sep";
    const operatorClaim = "Client is in London and wants £ pricing";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Website redesign with SEO",
        additionalContext: operatorClaim,
        timeframe: "asap",
      },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => [],
      },
    });

    assert.match(context.operatorGuidanceBlock, /OPERATOR PROJECT GUIDANCE/);
    assert.match(context.operatorGuidanceBlock, /Website redesign with SEO/);
    assert.match(context.operatorGuidanceBlock, /Client is in London/);
    assert.match(context.composedTrustedContext, /TRUSTED ATHENA EVIDENCE/);
    assert.doesNotMatch(context.composedTrustedContext, /Client is in London/);
    assert.doesNotMatch(context.trusted.brain, /Client is in London/);
    assert.doesNotMatch(
      context.composedTrustedContext,
      /OPERATOR PROJECT GUIDANCE/,
    );
  });

  it("4/5/6. Brain, Executive Intelligence, and Deep Website included when available", async () => {
    const org = "org-full";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Need a pricing estimate for a new offer" },
      deps: {
        buildBrain: async () => fakeBrain(org, { geographicReach: "Canada" }),
        loadDeepIntelligence: async () =>
          fakeDeepWebsite("Toronto office, Canada"),
        loadPersonas: async () => [],
        loadSeoReports: async () => [],
      },
    });

    assert.equal(context.meta.available.brain, true);
    assert.equal(context.meta.available.executiveIntelligence, true);
    assert.equal(context.meta.available.deepWebsite, true);
    assert.match(context.trusted.brain, /ATHENA BRAIN CONTEXT|Operator coach|Go-to-market/i);
    assert.match(context.trusted.executiveIntelligence, /executive_intelligence|Executive Intelligence/i);
    assert.match(context.trusted.deepWebsite, /deep_v1|GTM coaching|CRAWL SUMMARY/i);
    assert.match(context.trusted.organizationAggregates, /Messaging clarity/);
  });

  it("7. missing optional sources do not fail composition", async () => {
    const org = "org-sparse";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Rough ballpark for a consulting engagement" },
      deps: {
        buildBrain: async () => {
          throw new Error("brain down");
        },
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => {
          throw new Error("personas down");
        },
        loadSeoReports: async () => {
          throw new Error("seo down");
        },
      },
    });

    assert.equal(context.organizationId, org);
    assert.equal(context.meta.available.brain, false);
    assert.equal(context.meta.available.deepWebsite, false);
    assert.equal(context.meta.available.strategicSeo, false);
    assert.ok(context.composedTrustedContext.length > 0);
    assert.match(context.operatorGuidanceBlock, /Rough ballpark/);
  });

  it("8. latest Ready Strategic SEO selected correctly", async () => {
    const org = "org-seo";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Need commercial pricing guidance" },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => [
          // Canonical listSeoReports order: created_at DESC
          fakeSeoReport({
            id: "processing",
            organizationId: org,
            status: "Processing",
            generationType: "intelligence",
            createdAt: "2026-08-09T00:00:00.000Z",
            summary: "Should ignore processing",
          }),
          fakeSeoReport({
            id: "tech-ready",
            organizationId: org,
            status: "Ready",
            generationType: "technical",
            createdAt: "2026-08-08T00:00:00.000Z",
            summary: "Technical should not be strategic",
          }),
          fakeSeoReport({
            id: "newest-ready",
            organizationId: org,
            status: "Ready",
            generationType: "intelligence",
            createdAt: "2026-08-07T00:00:00.000Z",
            summary: "Newest strategic summary",
          }),
          fakeSeoReport({
            id: "old-ready",
            organizationId: org,
            status: "Ready",
            generationType: "intelligence",
            createdAt: "2026-07-01T00:00:00.000Z",
            summary: "Older strategic",
          }),
        ],
      },
    });

    assert.equal(context.meta.available.strategicSeo, true);
    assert.equal(context.meta.included.strategicSeo, true);
    assert.match(context.trusted.strategicSeo, /Newest strategic summary/);
    assert.doesNotMatch(context.trusted.strategicSeo, /Older strategic/);
    assert.doesNotMatch(context.trusted.strategicSeo, /Should ignore processing/);
    assert.doesNotMatch(
      context.trusted.strategicSeo,
      /Technical should not be strategic/,
    );
  });

  it("8b. prefers first Ready intelligence in list order (canonical latest-first)", async () => {
    const org = "org-seo-order";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Need commercial pricing guidance" },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => [
          fakeSeoReport({
            id: "newest-ready",
            organizationId: org,
            status: "Ready",
            generationType: "intelligence",
            createdAt: "2026-08-07T00:00:00.000Z",
            summary: "Newest strategic summary",
          }),
          fakeSeoReport({
            id: "old-ready",
            organizationId: org,
            status: "Ready",
            generationType: "intelligence",
            createdAt: "2026-07-01T00:00:00.000Z",
            summary: "Older strategic",
          }),
        ],
      },
    });
    assert.match(context.trusted.strategicSeo, /Newest strategic summary/);
    assert.doesNotMatch(context.trusted.strategicSeo, /Older strategic/);
  });

  it("9/10. technical SEO excluded when unrelated; included when relevant", async () => {
    assert.equal(
      isTechnicalSeoRelevantForEstimate({
        projectNeed: "Need help pricing a sales coaching package",
      }),
      false,
    );
    assert.equal(
      isTechnicalSeoRelevantForEstimate({
        projectNeed: "Website redesign with technical SEO and crawl fixes",
      }),
      true,
    );

    const org = "org-tech";
    const reports = [
      fakeSeoReport({
        id: "tech",
        organizationId: org,
        status: "Ready",
        generationType: "technical",
        createdAt: "2026-08-08T00:00:00.000Z",
        summary: "Canonical remediation breadth is high",
      }),
    ];

    const unrelated = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Need help pricing a sales coaching package" },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => reports,
      },
    });
    assert.equal(unrelated.meta.available.technicalSeo, true);
    assert.equal(unrelated.meta.included.technicalSeo, false);
    assert.match(unrelated.trusted.technicalSeo, /excluded/i);
    assert.doesNotMatch(
      unrelated.composedTrustedContext,
      /Canonical remediation breadth is high/,
    );

    const related = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Website redesign with technical SEO and crawl fixes",
      },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => reports,
      },
    });
    assert.equal(related.meta.included.technicalSeo, true);
    assert.match(
      related.trusted.technicalSeo,
      /Canonical remediation breadth is high/,
    );
  });

  it("11/12/13. persona inclusion heuristics and max 6 bound", async () => {
    assert.equal(
      isPersonaContextRelevantForEstimate({
        projectNeed: "Need a fixed-fee estimate for backend API work",
      }),
      false,
    );
    assert.equal(
      isPersonaContextRelevantForEstimate({
        projectNeed: "Need marketing positioning for our customer audience",
      }),
      true,
    );

    const org = "org-persona";
    const many = Array.from({ length: 10 }, (_, i) =>
      fakePersona(org, `Persona ${i + 1}`),
    );

    const excluded = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Need a fixed-fee estimate for backend API work" },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => many as never,
        loadSeoReports: async () => [],
      },
    });
    assert.equal(excluded.meta.available.personas, true);
    assert.equal(excluded.meta.included.personas, false);
    assert.equal(excluded.meta.personaCount, 0);
    assert.match(excluded.trusted.personas, /excluded/i);

    const included = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Need marketing positioning for our customer audience",
      },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => many as never,
        loadSeoReports: async () => [],
      },
    });
    assert.equal(included.meta.included.personas, true);
    assert.equal(included.meta.personaCount, ESTIMATE_CONTEXT_LIMITS.personasMax);
    assert.equal(
      summarizePersonasForEstimate(many as never).length,
      ESTIMATE_CONTEXT_LIMITS.personasMax,
    );
    assert.match(included.trusted.personas, /Persona 1/);
    assert.doesNotMatch(included.trusted.personas, /Persona 10/);
  });

  it("14. full prospect/discussion/opportunity libraries are not loaded directly", () => {
    const composer = read("services/estimate/estimateContextComposer.ts");
    assert.doesNotMatch(composer, /getProspects|listProspects|from\("prospects"\)/);
    assert.doesNotMatch(composer, /from\("discussions"\)|listDiscussions/);
    assert.doesNotMatch(composer, /from\("opportunities"\)|listOpportunities/);
    assert.match(composer, /buildBrainContextForOrganization|buildBrain/);
    assert.match(composer, /formatOrganizationAggregatesBlock/);
  });

  it("15/16. per-source char budgets and final trusted total clamp enforced", async () => {
    const org = "org-budget";
    const huge = "x".repeat(50_000);
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Website redesign with technical SEO and crawl fixes",
        additionalContext: "x".repeat(3_500),
      },
      deps: {
        buildBrain: async () => {
          const brain = fakeBrain(org);
          brain.businessMemory.identity!.aboutYou = huge;
          brain.businessMemory.identity!.expertise = huge;
          return brain;
        },
        loadDeepIntelligence: async () => {
          const deep = fakeDeepWebsite();
          deep.business_knowledge.about = huge;
          deep.business_knowledge.services = huge;
          deep.about = huge;
          deep.services = huge;
          return deep;
        },
        loadPersonas: async () =>
          [
            {
              ...fakePersona(org, "Huge"),
              pain_points: huge,
              motivations: huge,
              objections: huge,
            },
          ] as never,
        loadSeoReports: async () => [
          fakeSeoReport({
            id: "s",
            organizationId: org,
            status: "Ready",
            generationType: "intelligence",
            createdAt: "2026-08-08T00:00:00.000Z",
            summary: huge,
          }),
          fakeSeoReport({
            id: "t",
            organizationId: org,
            status: "Ready",
            generationType: "technical",
            createdAt: "2026-08-08T00:00:00.000Z",
            summary: huge,
          }),
        ],
      },
    });

    assert.ok(
      context.meta.charCounts.brain <= ESTIMATE_CONTEXT_LIMITS.brainMaxChars,
    );
    assert.ok(
      context.meta.charCounts.executiveIntelligence <=
        ESTIMATE_CONTEXT_LIMITS.executiveIntelligenceMaxChars,
    );
    assert.ok(
      context.meta.charCounts.deepWebsite <=
        ESTIMATE_CONTEXT_LIMITS.deepWebsiteMaxChars,
    );
    assert.ok(
      context.meta.charCounts.organizationAggregates <=
        ESTIMATE_CONTEXT_LIMITS.organizationAggregatesMaxChars,
    );
    assert.ok(
      context.meta.charCounts.strategicSeo <=
        ESTIMATE_CONTEXT_LIMITS.strategicSeoMaxChars,
    );
    assert.ok(
      context.meta.charCounts.technicalSeo <=
        ESTIMATE_CONTEXT_LIMITS.technicalSeoMaxChars,
    );
    assert.ok(
      context.meta.charCounts.personas <= ESTIMATE_CONTEXT_LIMITS.personasMaxChars,
    );
    assert.ok(
      context.meta.charCounts.operatorGuidance <=
        ESTIMATE_CONTEXT_LIMITS.operatorGuidanceMaxChars,
    );
    assert.ok(
      context.composedTrustedContext.length <=
        ESTIMATE_CONTEXT_LIMITS.trustedTotalMaxChars,
    );
    assert.ok(context.meta.totalChars <= ESTIMATE_CONTEXT_LIMITS.totalMaxChars);
  });

  it("19b. operator geography cannot drive currency resolution", async () => {
    const org = "org-op-geo";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: {
        projectNeed: "Pricing for a coaching offer",
        additionalContext: "Client is in London, United Kingdom",
      },
      deps: {
        buildBrain: async () =>
          fakeBrain(org, {
            geographicReach: "Serving customers worldwide",
            withExecutive: true,
          }),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => [],
      },
    });

    assert.match(context.operatorGuidanceBlock, /London, United Kingdom/);
    assert.equal(context.geoCurrency.currencyResolution, "fallback");
    assert.equal(context.geoCurrency.currencyCode, "USD");
    assert.equal(context.geoCurrency.geographyLabel, null);
  });

  it("17b. trusted EI geography derives currency inside composer", async () => {
    const org = "org-derived";
    const context = await composeEstimateOrganizationContext({
      organizationId: org,
      request: { projectNeed: "Pricing for a coaching offer" },
      deps: {
        buildBrain: async () =>
          fakeBrain(org, { geographicReach: "Israel" }),
        loadDeepIntelligence: async () => null,
        loadPersonas: async () => [],
        loadSeoReports: async () => [],
      },
    });
    assert.equal(context.geoCurrency.currencyResolution, "derived");
    assert.equal(context.geoCurrency.currencyCode, "ILS");
    assert.equal(context.geoCurrency.geographyLabel, "Israel");
  });

  it("22/23. no write ops to tenant intelligence; no OpenRouter; no prompts", () => {
    const composer = read("services/estimate/estimateContextComposer.ts");
    assert.doesNotMatch(composer, /\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    assert.doesNotMatch(composer, /openrouter|OpenRouter/i);
    assert.doesNotMatch(composer, /services\/ai\/prompts\/estimate/);
    assert.doesNotMatch(composer, /enqueueDeepScrape|promoteBrainIntelligence/);
    assert.match(composer, /loadOrganizationDeepWebsiteIntelligence/);
    assert.match(composer, /readIdentityExecutiveIntelligence/);
    assert.match(composer, /formatBrainContextForPrompt/);

    const guidance = formatEstimateOperatorGuidanceBlock({
      projectNeed: "Need a website redesign",
      timeframe: "flexible",
    });
    assert.match(guidance, /OPERATOR PROJECT GUIDANCE/);
    assert.match(guidance, /timeframe: flexible/);
  });

  it("does not accept licensee_account_id as tenant scope", () => {
    const composer = read("services/estimate/estimateContextComposer.ts");
    assert.doesNotMatch(composer, /licensee_account_id|licenseeAccountId/);
    assert.match(
      composer,
      /organizationId is required for Estimate context composition/,
    );
  });
});
