import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeSocialCalendarContext } from "../../services/socialPlanner/calendar/composeSocialCalendarContext";
import { composeSocialPlannerIntelligence } from "../../services/socialPlanner/intelligence/composeSocialPlannerIntelligence";
import {
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSED_TEXT_MAX_CHARS,
  SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS,
  SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS,
} from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";
import {
  SOCIAL_PLANNER_ADS_REFERENCE_ROLE,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
  SocialPlannerIntelligenceError,
} from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { BrainEngineContext } from "../../services/brain/brainContextTypes";
import type { DeepWebsiteIntelligence } from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import type { Persona } from "../../services/personas/personaService";
import type { Prospect } from "../../services/prospects/prospectService";
import type { AdCampaign } from "../../services/ads/adCampaignTypes";
import type { SeoReport } from "../../services/seo/seoReportTypes";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "../../services/superAdmin/strategicBlueprintInstructionConstants";
import { IDENTITY_EXECUTIVE_INTELLIGENCE_KEY } from "../../services/identity/identityExecutiveIntelligence";

const ORG = "org-trusted";

function calendar() {
  return composeSocialCalendarContext({
    periodStart: "2026-05-10",
    periodEnd: "2026-05-16",
    geographyEvidence: {
      executiveGeographicReach: "United States",
    },
  });
}

function fakeBrain(organizationId: string): BrainEngineContext {
  return {
    organization: { id: organizationId, name: "Harbor Clinic", slug: "harbor" },
    scope: "organization",
    identity: {} as BrainEngineContext["identity"],
    businessMemory: {
      identity: {
        userId: null,
        greetingName: "Alex",
        aboutYou: "Neighborhood dental clinic",
        expertise: "Family dentistry",
        website: "https://harbor.example",
        brainStatus: "ready",
        masterProfile: {
          [IDENTITY_EXECUTIVE_INTELLIGENCE_KEY]: {
            executive_summary: "Harbor Clinic serves local families with preventive dentistry.",
            confidence_level: "strong",
            confidence_reasons: ["website"],
            voice_alignment: "strong",
            business_knowledge_coverage: "strong",
            website_evidence_coverage: "strong",
            business_model: {
              business_overview: "Family dentistry",
              primary_audience: "Local families",
              positioning: "Preventive-first care",
              geographic_reach: "United States",
              communication_style: "Warm and plain",
              products_and_services: "Cleanings, implants",
            },
            hidden_signals: [{ finding: "Same-week bookings", why_it_matters: "Speed" }],
            calibration_gaps: [],
          },
        },
        masterProfileVersion: "mp-3",
        homepageLearning: "Preventive care for families.",
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 88,
    },
    domainMemory: {
      domains: [
        {
          id: "d1",
          name: "Local health",
          description: "Family care questions",
          market: "Healthcare",
          niche: "Dentistry",
        },
      ],
    },
    discussionMemory: {
      recentDiscussions: [
        {
          id: "disc-old",
          title: "Historical thread",
          status: "Closed",
          summary: "Older discussion",
          opportunityScore: 20,
        },
        {
          id: "disc-current",
          title: "Preventive memberships",
          status: "Analyzed",
          summary: "Families want a simple membership",
          opportunityScore: 91,
        },
      ],
      highIntentDiscussions: [
        {
          id: "disc-current",
          title: "Preventive memberships",
          status: "Analyzed",
          summary: "Families want a simple membership",
          opportunityScore: 91,
        },
      ],
    },
    opportunityMemory: {
      recentOpportunities: [
        {
          id: "opp-1",
          title: "Membership plan",
          status: "open",
          urgency: "high",
          score: 86,
        },
      ],
    },
    briefingMemory: { recentBriefings: [] },
    assetMemory: {
      targetAudiences: ["Local parents"],
      businessGoals: ["Book hygiene visits"],
      recentBlueprints: [],
    },
    knowledgeMemory: { assets: [], communityIntelligence: [] },
    feedbackSignals: {},
    contextSummary: {
      warnings: [],
      missingBrainSetupFields: [],
    },
    builtAt: "2026-01-01T00:00:00.000Z",
  } as unknown as BrainEngineContext;
}

function fakeWebsite(): DeepWebsiteIntelligence {
  return {
    provider: "deep_v1",
    url: "https://harbor.example",
    scraped_at: "2026-04-01T12:00:00.000Z",
    pages_analyzed: 4,
    pages: [
      { url: "https://harbor.example/", title: "Home", page_type: "homepage", excerpt: "Welcome" },
      { url: "https://harbor.example/faq", title: "FAQ", page_type: "faq", excerpt: "Questions" },
    ],
    business_knowledge: {
      positioning: "Preventive family dentistry",
      about: "Harbor Clinic",
      products: "",
      services: "Cleanings and implants",
      solutions: "",
      pricing: "",
      training: "",
      faq: "Do you take insurance?",
      team: "",
      testimonials: "Kind staff",
      case_studies: "",
      target_audience: "Families nearby",
      messaging: "Prevention first",
      value_proposition: "Same-week visits",
      differentiators: "Warm local care",
      trust_signals: "5-star reviews",
      contact_information: "Harbor Ave",
      brand_tone: "Warm",
      cta: "Book a cleaning",
    },
    crawl_summary: {
      pages_analyzed: 4,
      services_discovered: 2,
      faqs_discovered: 1,
      testimonials_discovered: 1,
      team_pages_discovered: 0,
      commercial_pages_discovered: 2,
    },
    positioning: "Preventive family dentistry",
    products: "",
    services: "Cleanings and implants",
    about: "Harbor Clinic",
    target_audience: "Families nearby",
    messaging: "Prevention first",
    value_proposition: "Same-week visits",
    cta: "Book a cleaning",
    differentiators: "Warm local care",
    trust_signals: "5-star reviews",
    contact_information: "Harbor Ave",
    brand_tone: "Warm",
    headings: "",
    paragraphs: "",
  };
}

function fakePersona(
  organizationId: string,
  name: string,
  extras: Partial<Persona> = {},
): Persona {
  return {
    id: `${organizationId}-${name}`,
    created_at: extras.created_at ?? "2026-03-01T00:00:00.000Z",
    updated_at: extras.updated_at ?? "2026-03-01T00:00:00.000Z",
    organization_id: organizationId,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    persona_name: name,
    short_description: extras.short_description ?? "Busy parent",
    category: extras.category ?? "Parent",
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: extras.country ?? "United States",
    state: extras.state ?? "California",
    city: extras.city ?? "San Diego",
    location_summary: extras.location_summary ?? "San Diego families",
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: extras.occupation ?? "Teacher",
    seniority: null,
    industry_context: null,
    lifestyle: null,
    interests: extras.interests ?? "School calendars",
    digital_behavior: null,
    brands_influences: null,
    values_text: null,
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: null,
    needs: extras.needs ?? "Reliable appointments",
    pain_points: extras.pain_points ?? "Hard to book after work",
    fears: null,
    motivations: extras.motivations ?? "Keep kids healthy",
    objections: extras.objections ?? "Price",
    buying_triggers: null,
    decision_criteria: extras.decision_criteria ?? "Trust and hours",
    purchase_behavior: null,
    typical_concerns: null,
    communication_style: extras.communication_style ?? "Friendly SMS",
    preferred_channels: extras.preferred_channels ?? "Instagram",
    reference_website: null,
    notes: "private admin note",
    additional_context: null,
    ads_content: null,
    source: "manual",
    status: extras.status ?? "Ready",
    lifecycle_status: extras.lifecycle_status ?? "In Use",
    opportunity_score: null,
    priority: 0,
    profile_json: null,
    raw_json: { secret: "persona-secret" },
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    ...extras,
    organization_id: organizationId,
    persona_name: name,
  };
}

function fakeProspect(
  organizationId: string,
  name: string,
  extras: Partial<Prospect> = {},
): Prospect {
  return {
    id: `${organizationId}-${name}`,
    created_at: extras.created_at ?? "2026-02-01T00:00:00.000Z",
    updated_at: extras.updated_at ?? "2026-02-01T00:00:00.000Z",
    organization_id: organizationId,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    business_name: name,
    website: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: extras.industry ?? "Healthcare",
    category: extras.category ?? "Clinic",
    country: extras.country ?? "United States",
    state: extras.state ?? "California",
    city: extras.city ?? "San Diego",
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: extras.pain_points ?? "No-show patients",
    decision_maker: "Hidden",
    first_name: "Pat",
    last_name: "Lee",
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: "hidden@example.com",
    phone: "555-0100",
    whatsapp_number: "555-0100",
    getoblic_type: null,
    google_business_url: null,
    notes: "private prospect note",
    additional_context: extras.additional_context ?? "Wants evening hours",
    source: "manual",
    status: extras.status ?? "Ready",
    lifecycle_status: extras.lifecycle_status ?? "Qualified",
    ads_content: extras.ads_content ?? null,
    opportunity_score: null,
    priority: 0,
    website_intelligence: null,
    raw_json: { secret: "prospect-secret" },
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...extras,
    organization_id: organizationId,
    business_name: name,
  };
}

function fakeSeoReport(organizationId: string): SeoReport {
  return {
    id: "seo-1",
    organization_id: organizationId,
    user_id: null,
    name: "Harbor SEO",
    brief_json: {},
    status: "Ready",
    generation_stage: "completed",
    package_json: {
      generationType: "intelligence",
      reportName: "Harbor SEO",
      briefMode: "inferred",
      executiveAssessment: {
        overallAssessment: "Strong local service coverage",
        strengths: ["Reviews"],
        weaknesses: ["Implant education"],
        seoReadiness: "developing",
        businessVisibilityAssessment: "Local",
        summary: "Need implant education pages",
      },
      contentCoverage: {
        wellCoveredServices: ["Cleanings"],
        weaklyCoveredServices: ["Implants"],
        missingServices: ["Sedation"],
        missingCustomerQuestions: ["Does insurance cover cleanings?"],
        missingTrustContent: [],
        missingEducationalContent: [],
        missingConversionContent: [],
        analysis: "Gaps on implants",
        athenaEvidence: [],
      },
      customerIntent: {
        representedIntents: ["book cleaning"],
        missingIntents: [],
        painPointGaps: ["Fear of cost"],
        buyerIntentSummary: "Local booking intent",
        athenaEvidence: [],
      },
      commercialOpportunities: {
        opportunities: [
          {
            contentType: "guide",
            title: "Implant recovery guide",
            rationale: "Gap",
            expectedImpact: "high",
            athenaEvidence: [],
          },
        ],
        summary: "Education",
      },
      trustAndAuthority: {
        trustSignals: "Reviews",
        testimonials: "Yes",
        caseStudies: "No",
        expertPositioning: "",
        authorityMessaging: "",
        differentiation: "",
        callsToAction: "",
        consistency: "",
        recommendations: [],
        athenaEvidence: [],
      },
      ninetyDayRoadmap: { overview: "", items: [] },
      disclaimer: "inferred",
      websitePagesAnalyzed: {
        pagesAnalyzedCount: 4,
        sourceUrl: "https://harbor.example",
        scrapedAt: "2026-04-01T12:00:00.000Z",
        pages: [],
      },
    },
    error_code: null,
    error_message: null,
    created_at: "2026-04-02T00:00:00.000Z",
    updated_at: "2026-04-02T00:00:00.000Z",
  } as SeoReport;
}

function fakeAdCampaign(organizationId: string): AdCampaign {
  return {
    id: "ad-1",
    organization_id: organizationId,
    user_id: null,
    name: "Spring cleanings",
    brief_json: {},
    status: "Ready",
    generation_stage: "completed",
    package_json: {
      strategy: {
        campaignName: "Spring cleanings",
        objective: "Book hygiene",
        audience: "Local parents",
        coreOfferOrMessage: "Same-week cleaning",
        positioningAngle: "Neighborhood care",
        primaryValueProposition: "Easy booking",
        ctaDirection: "Book now",
        landingPageDirection: "Homepage",
        rationale: "Seasonal",
        briefMode: "inferred",
      },
      facebook: {
        primaryText: "FULL AD COPY SHOULD NOT DOMINATE",
        headline: "x",
        description: "x",
        ctaRecommendation: "x",
        audienceDirection: "x",
        creativeConcept: "x",
        imagePrompt: "x",
      },
      instagram: {
        feedCaption: "FULL IG COPY",
        openingHook: "x",
        reelOrStoryScript: "x",
        onScreenText: "x",
        cta: "x",
        hashtagDirection: null,
        creativeConcept: "x",
        imageOrShortVideoPrompt: "x",
      },
      tiktok: {
        openingHook: "x",
        shortVideoScript: "x",
        sceneDirection: "x",
        onScreenText: "x",
        caption: "x",
        cta: "x",
        creatorOrProductionDirection: "x",
      },
      googleSearch: {
        campaignTheme: "x",
        adGroupThemes: [],
        headlines: [],
        descriptions: [],
        sitelinkIdeas: [],
        calloutIdeas: [],
        structuredSnippetIdeas: [],
        negativeKeywordSuggestions: [],
        landingPageDirection: "x",
      },
      keywordThemes: {
        label: "Recommended Keyword Themes",
        disclaimer: "inferred",
        themes: [
          {
            theme: "family dentist nearby",
            intentClassification: "local",
            audienceRelevance: "high",
            suggestedMessageAngle: "convenience",
            suggestedLandingPageDirection: "home",
          },
        ],
      },
    },
    error_code: null,
    error_message: null,
    created_at: "2026-04-03T00:00:00.000Z",
    updated_at: "2026-04-03T00:00:00.000Z",
  };
}

function fakeBlueprint(
  organizationId: string,
  extras: Partial<AthenaAssetBlueprint> = {},
): AthenaAssetBlueprint & { organization_id: string } {
  return {
    id: extras.id ?? "bp-1",
    user_id: null,
    discussion_id: extras.discussion_id ?? "disc-current",
    opportunity_id: extras.opportunity_id ?? "opp-1",
    briefing_id: extras.briefing_id ?? null,
    asset_title: extras.asset_title ?? "Membership one-pager",
    asset_type: extras.asset_type ?? "pdf_guide",
    business_goal: extras.business_goal ?? "Explain membership",
    target_audience: extras.target_audience ?? "Local parents",
    priority: "high",
    estimated_reuse: 3,
    image_prompt: extras.image_prompt ?? "Warm clinic waiting room",
    pdf_prompt: extras.pdf_prompt ?? "One-page membership explainer",
    social_prompt: extras.social_prompt ?? "LinkedIn post about prevention",
    trend_social_prompt: extras.trend_social_prompt ?? "Historical trend output from January",
    notes: extras.notes ?? "Keep tone warm",
    status: "ready",
    raw_json: { secret: "blueprint-secret" },
    created_at: extras.created_at ?? "2026-03-20T00:00:00.000Z",
    updated_at: extras.updated_at ?? "2026-03-20T00:00:00.000Z",
    organization_id: organizationId,
    ...extras,
  };
}

function emptyDeps() {
  return {
    buildBrain: async () => null,
    loadDeepWebsiteIntelligence: async () => null,
    loadPersonas: async () => [],
    loadProspects: async () => [],
    loadSeoReports: async () => [],
    loadAdCampaigns: async () => [],
    loadBlueprints: async () => [],
    loadCurrentExecutiveVersions: async () => [],
    loadTrendSocialPrompt: async () => ({
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: false,
      instructionText: "",
      revisionId: null,
      updatedAt: null,
      updatedBy: null,
    }),
  };
}

describe("Social Planner L3 intelligence composer", () => {
  it("succeeds when optional intelligence is absent", async () => {
    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps: emptyDeps(),
    });

    assert.equal(context.schemaVersion, SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION);
    assert.equal(context.organization.id, ORG);
    assert.equal(context.brain.available, false);
    assert.equal(context.identityExecutiveIntelligence.available, false);
    assert.equal(context.websiteIntelligence.available, false);
    assert.equal(context.personas.includedCount, 0);
    assert.equal(context.prospects.includedCount, 0);
    assert.equal(context.ads.length, 0);
    assert.equal(context.seoIntelligence.length, 0);
    assert.equal(context.trendSocialPrompt.configured, false);
    assert.equal(context.trendSocialPrompt.instructionText, "");
    assert.equal(context.trendSocialPrompt.revisionId, null);
    const personaDiag = context.budgetDiagnostics.sections.find(
      (section) => section.source === "personas",
    );
    assert.equal(personaDiag?.available, false);
    assert.equal(personaDiag?.unavailableReason, "absent");
  });

  it("includes Brain, Identity EI, Website, SEO, discussions, portfolios, ads, and blueprints", async () => {
    const calendarContext = calendar();
    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext,
      deps: {
        ...emptyDeps(),
        buildBrain: async () => fakeBrain(ORG),
        loadDeepWebsiteIntelligence: async () => fakeWebsite(),
        loadPersonas: async () => [
          fakePersona(ORG, "Parent Maya", { category: "Parent", occupation: "Teacher" }),
          fakePersona(ORG, "Retiree Sam", {
            category: "Retiree",
            occupation: "Retired",
            location_summary: "Coastal retirees",
          }),
        ],
        loadProspects: async () => [
          fakeProspect(ORG, "Northside Dental Group", {
            created_at: "2026-04-01T00:00:00.000Z",
          }),
          fakeProspect(ORG, "Bay Pediatric", {
            created_at: "2026-01-01T00:00:00.000Z",
          }),
        ],
        loadSeoReports: async () => [fakeSeoReport(ORG)],
        loadAdCampaigns: async () => [fakeAdCampaign(ORG)],
        loadBlueprints: async () => [fakeBlueprint(ORG)],
        loadCurrentExecutiveVersions: async () => [
          {
            id: "ev-current",
            discussion_id: "disc-current",
            organization_id: ORG,
            version_number: 3,
            is_current: true,
            generated_at: "2026-04-10T00:00:00.000Z",
            analysis_id: "an-3",
            intelligence: {
              analysis: {
                summary: "Launch a simple preventive membership",
                intent: "commercial",
                buyer_stage: "consideration",
                pain_points: "Unclear annual value",
                recommended_action: "Explain membership plainly",
              },
            },
          },
          {
            id: "ev-old",
            discussion_id: "disc-current",
            organization_id: ORG,
            version_number: 1,
            is_current: false,
            generated_at: "2026-01-01T00:00:00.000Z",
            analysis_id: "an-1",
            intelligence: {
              analysis: { summary: "Historical version must not win" },
            },
          },
        ],
        loadTrendSocialPrompt: async () => ({
          key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
          configured: true,
          instructionText: "Favor seasonal community language.",
          revisionId: "rev-22",
          updatedAt: "2026-04-12T00:00:00.000Z",
          updatedBy: "super-admin-should-not-leak",
        }),
      },
    });

    assert.match(context.brain.homepageLearning ?? "", /Preventive care/);
    assert.equal(context.brain.isBrainTrained, true);
    assert.match(
      context.identityExecutiveIntelligence.executiveSummary ?? "",
      /Harbor Clinic/,
    );
    assert.equal(
      context.identityExecutiveIntelligence.businessModel.geographic_reach,
      "United States",
    );
    assert.equal(context.websiteIntelligence.available, true);
    assert.equal(context.websiteIntelligence.provider, "deep_v1");
    assert.match(
      JSON.stringify(context.websiteIntelligence.businessKnowledge),
      /Preventive family dentistry/,
    );
    assert.doesNotMatch(context.composedText, /Welcome<\/p>|http_status|internal_links_sample/);
    assert.equal(context.seoIntelligence[0]?.role, "current_strategic_seo");
    assert.match(context.seoIntelligence[0]?.summary ?? "", /implant education/i);
    assert.ok(context.seoIntelligence[0]?.priorityTopics.includes("Implants"));
    assert.doesNotMatch(context.composedText, /technicalCoverage|pageMetadata/);

    const discussion = context.discussions.find((row) => row.id === "disc-current");
    assert.ok(discussion);
    assert.equal(discussion?.currentExecutiveVersion?.id, "ev-current");
    assert.equal(discussion?.currentExecutiveVersion?.versionNumber, 3);
    assert.match(
      discussion?.currentExecutiveVersion?.summary ?? "",
      /preventive membership/,
    );
    assert.equal(
      context.discussions.some((row) => row.currentExecutiveVersion?.id === "ev-old"),
      false,
    );

    assert.equal(context.personas.includedCount, 2);
    assert.ok(context.personas.distinctCategories.includes("Parent"));
    assert.ok(context.personas.distinctCategories.includes("Retiree"));
    assert.equal(context.prospects.prospects[0]?.businessName, "Northside Dental Group");
    assert.equal(context.opportunities[0]?.title, "Membership plan");
    assert.equal(context.ads[0]?.role, SOCIAL_PLANNER_ADS_REFERENCE_ROLE);
    assert.doesNotMatch(context.composedText, /FULL AD COPY SHOULD NOT DOMINATE/);
    assert.equal(context.strategicAssetBlueprints[0]?.historicalTrendSocialOutput?.includes("Historical trend"), true);
    assert.equal(context.trendSocialPrompt.configured, true);
    assert.equal(context.trendSocialPrompt.revisionId, "rev-22");
    assert.match(context.trendSocialPrompt.instructionText, /seasonal community/);
    assert.doesNotMatch(context.composedText, /super-admin-should-not-leak/);
    assert.doesNotMatch(context.composedText, /hidden@example.com|555-0100|persona-secret/);
    assert.deepEqual(context.calendarContext, calendarContext);
    assert.ok(
      context.calendarContext.opportunities.every(
        (opportunity) => opportunity.selectionStatus === "candidate",
      ),
    );
    assert.equal(context.calendarContext.provenance.holidayCoverage, "country");
    assert.deepEqual(context.provenance.currentExecutiveVersionIds, ["ev-current"]);
    assert.deepEqual(context.provenance.trendSocialPrompt, {
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: true,
      revisionId: "rev-22",
    });
  });

  it("rejects missing organization, invalid calendar, and cross-tenant rows", async () => {
    await assert.rejects(
      () =>
        composeSocialPlannerIntelligence({
          organizationId: "   ",
          calendarContext: calendar(),
          deps: emptyDeps(),
        }),
      (error: unknown) =>
        error instanceof SocialPlannerIntelligenceError &&
        error.code === "INVALID_ORGANIZATION",
    );

    await assert.rejects(
      () =>
        composeSocialPlannerIntelligence({
          organizationId: ORG,
          deps: emptyDeps(),
        }),
      (error: unknown) =>
        error instanceof SocialPlannerIntelligenceError &&
        error.code === "INVALID_CALENDAR_CONTEXT",
    );

    const invalidCalendar = calendar();
    (invalidCalendar as { schemaVersion: string }).schemaVersion = "not-a-real-schema";
    await assert.rejects(
      () =>
        composeSocialPlannerIntelligence({
          organizationId: ORG,
          calendarContext: invalidCalendar,
          deps: emptyDeps(),
        }),
      (error: unknown) =>
        error instanceof SocialPlannerIntelligenceError &&
        error.code === "INVALID_CALENDAR_CONTEXT",
    );

    await assert.rejects(
      () =>
        composeSocialPlannerIntelligence({
          organizationId: ORG,
          calendarContext: calendar(),
          deps: {
            ...emptyDeps(),
            loadPersonas: async () => [
              fakePersona(ORG, "Keep"),
              fakePersona("org-other", "Foreign"),
            ],
          },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerIntelligenceError &&
        error.code === "CROSS_TENANT_CONTAMINATION",
    );

    await assert.rejects(
      () =>
        composeSocialPlannerIntelligence({
          organizationId: ORG,
          calendarContext: calendar(),
          deps: {
            ...emptyDeps(),
            buildBrain: async () => fakeBrain("org-other"),
          },
        }),
      (error: unknown) =>
        error instanceof SocialPlannerIntelligenceError &&
        error.code === "CROSS_TENANT_CONTAMINATION",
    );
  });

  it("keeps persona and prospect portfolios bounded and deterministically ordered", async () => {
    const personas = [
      fakePersona(ORG, "Archived One", { lifecycle_status: "Archived", status: "Ready" }),
      fakePersona(ORG, "Older Ready", {
        status: "Ready",
        created_at: "2026-01-01T00:00:00.000Z",
        category: "A",
      }),
      fakePersona(ORG, "Newer Ready", {
        status: "Ready",
        created_at: "2026-05-01T00:00:00.000Z",
        category: "B",
      }),
      fakePersona(ORG, "Queued", {
        status: "Queued",
        created_at: "2026-06-01T00:00:00.000Z",
        category: "C",
      }),
    ];
    const prospects = [
      fakeProspect(ORG, "Not a Fit Co", { lifecycle_status: "Not a Fit" }),
      fakeProspect(ORG, "Older Co", { created_at: "2026-01-01T00:00:00.000Z" }),
      fakeProspect(ORG, "Newer Co", { created_at: "2026-05-01T00:00:00.000Z" }),
    ];

    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => personas,
        loadProspects: async () => prospects,
      },
    });

    assert.deepEqual(
      context.personas.personas.map((persona) => persona.name),
      ["Newer Ready", "Older Ready", "Queued"],
    );
    assert.deepEqual(
      context.prospects.prospects.map((prospect) => prospect.businessName),
      ["Newer Co", "Older Co"],
    );
    assert.ok(context.personas.includedCount <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.personas);
    assert.ok(context.prospects.includedCount <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.prospects);
  });

  it("clamps oversized sections and the total composed text budget", async () => {
    const huge = "x".repeat(20_000);
    const personas = Array.from({ length: 12 }, (_, index) =>
      fakePersona(ORG, `Persona ${index}`, {
        needs: huge,
        pain_points: huge,
        motivations: huge,
        created_at: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );

    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => personas,
        loadTrendSocialPrompt: async () => ({
          key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
          configured: true,
          instructionText: "y".repeat(20_000),
          revisionId: "rev-big",
          updatedAt: "2026-04-01T00:00:00.000Z",
          updatedBy: null,
        }),
      },
    });

    const personaDiag = context.budgetDiagnostics.sections.find(
      (section) => section.source === "personas",
    );
    const trendDiag = context.budgetDiagnostics.sections.find(
      (section) => section.source === "trendSocialPrompt",
    );
    assert.equal(personaDiag?.truncated, true);
    assert.ok(
      JSON.stringify(context.personas).length <=
        SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.personas,
    );
    assert.ok(context.personas.personas.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.personas);
    assert.ok(
      context.trendSocialPrompt.instructionText.length < 20_000,
    );
    assert.equal(trendDiag?.truncated, true);
    assert.ok(
      context.composedText.length <= SOCIAL_PLANNER_INTELLIGENCE_COMPOSED_TEXT_MAX_CHARS,
    );
    assert.equal(
      context.budgetDiagnostics.composedTextTruncated ||
        context.composedText.length <= SOCIAL_PLANNER_INTELLIGENCE_COMPOSED_TEXT_MAX_CHARS,
      true,
    );
    assert.doesNotMatch(context.composedText, /weekly strategy|Why This Week Works|Image Prompt generation/i);
  });

  it("is deterministic for the same trusted inputs", async () => {
    const deps = {
      ...emptyDeps(),
      buildBrain: async () => fakeBrain(ORG),
      loadPersonas: async () => [
        fakePersona(ORG, "B"),
        fakePersona(ORG, "A", { created_at: "2026-05-02T00:00:00.000Z" }),
      ],
      loadProspects: async () => [
        fakeProspect(ORG, "B Co"),
        fakeProspect(ORG, "A Co", { created_at: "2026-05-02T00:00:00.000Z" }),
      ],
      loadTrendSocialPrompt: async () => ({
        key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
        configured: true,
        instructionText: "Stay local.",
        revisionId: "rev-1",
        updatedAt: "2026-04-01T00:00:00.000Z",
        updatedBy: null,
      }),
    };

    const first = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps,
    });
    const second = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps,
    });

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.personas.personas.map((persona) => persona.name),
      ["A", "B"],
    );
    assert.deepEqual(
      first.prospects.prospects.map((prospect) => prospect.businessName),
      ["A Co", "B Co"],
    );
  });
});
