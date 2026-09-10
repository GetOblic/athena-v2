import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADS_CONTEXT_LIMITS,
  composeAdsOrganizationContext,
  formatPersonaSummariesBlock,
  formatProspectSummariesBlock,
  summarizePersonasForAds,
  summarizeProspectsForAds,
} from "../../services/ads/adsContextComposer";
import type { BrainEngineContext } from "../../services/brain/brainContextTypes";
type Prospect = {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string | null;
  community_id: string | null;
  linked_discussion_id: string | null;
  business_name: string;
  website: string | null;
  linkedin: string | null;
  facebook: string | null;
  instagram: string | null;
  industry: string | null;
  category: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  company_size: string | null;
  revenue: string | null;
  employee_count: string | null;
  technologies: string | null;
  pain_points: string | null;
  decision_maker: string | null;
  first_name: string | null;
  last_name: string | null;
  external_contact_id: string | null;
  timezone: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  getoblic_type: string | null;
  google_business_url: string | null;
  notes: string | null;
  additional_context: string | null;
  source: string;
  status: string;
  lifecycle_status: string;
  ads_content: string | null;
  opportunity_score: number | null;
  priority: number;
  website_intelligence: Record<string, unknown> | null;
  raw_json: Record<string, unknown> | null;
  last_activity: string | null;
  import_batch_id: string | null;
};

type Persona = {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string | null;
  community_id: string | null;
  linked_discussion_id: string | null;
  persona_name: string | null;
  short_description: string | null;
  category: string | null;
  gender_identity: string | null;
  age_range: string | null;
  birth_year_approx: string | null;
  generation: string | null;
  cultural_background: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  location_summary: string | null;
  languages: string | null;
  relationship_status: string | null;
  household: string | null;
  income_range: string | null;
  purchasing_power: string | null;
  education: string | null;
  occupation: string | null;
  seniority: string | null;
  industry_context: string | null;
  lifestyle: string | null;
  interests: string | null;
  digital_behavior: string | null;
  brands_influences: string | null;
  values_text: string | null;
  aesthetic_preferences: string | null;
  preferred_imagery: string | null;
  goals: string | null;
  needs: string | null;
  pain_points: string | null;
  fears: string | null;
  motivations: string | null;
  objections: string | null;
  buying_triggers: string | null;
  decision_criteria: string | null;
  purchase_behavior: string | null;
  typical_concerns: string | null;
  communication_style: string | null;
  preferred_channels: string | null;
  reference_website: string | null;
  notes: string | null;
  additional_context: string | null;
  ads_content: string | null;
  source: string;
  status: string;
  lifecycle_status: string;
  opportunity_score: number | null;
  priority: number;
  profile_json: Record<string, unknown> | null;
  raw_json: Record<string, unknown> | null;
  reference_website_intelligence: Record<string, unknown> | null;
  last_activity: string | null;
  import_batch_id: string | null;
  last_deep_scrape_at: string | null;
  last_deep_scrape_pages: number | null;
};

function emptyMemoryArrays<T>(): T[] {
  return [];
}

function fakeBrain(organizationId: string): BrainEngineContext {
  return {
    organization: {
      id: organizationId,
      name: "Acme",
    } as BrainEngineContext["organization"],
    scope: "organization",
    identity: {
      identity: {
        greetingName: "Laurent",
        aboutYou: "Operator coach",
        expertise: "Go-to-market",
        website: "https://example.com",
        brainStatus: "trained",
        masterProfile: { voice: "direct" },
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
        masterProfile: { voice: "direct" },
        masterProfileVersion: "1",
        homepageLearning: null,
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    domainMemory: {
      domains: [
        {
          id: "d1",
          name: "Consulting",
          platform: null,
          market: "B2B",
          niche: "Founders",
          description: "Diagnosis-led consulting",
          recurringQuestions: null,
          recurringObjections: null,
          emergingTrends: null,
          athenaUnderstanding: null,
        },
      ],
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
      recentBriefings: [
        {
          id: "b1",
          status: "approved",
          confidence: 0.8,
          buyerStage: null,
          summary: "Demand for clarity offers",
          opportunityId: null,
          discussionId: null,
          updatedAt: null,
        },
      ],
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

function fakeProspect(org: string, name: string): Prospect {
  return {
    id: `${org}-${name}`,
    created_at: "",
    updated_at: "",
    organization_id: org,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    business_name: name,
    website: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: "SaaS",
    category: "Software",
    country: null,
    state: null,
    city: null,
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: "Unclear messaging",
    decision_maker: null,
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: null,
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: "Short note",
    additional_context: null,
    source: "manual",
    status: "active",
    lifecycle_status: "New",
    ads_content: "Existing ad angle about clarity",
    opportunity_score: null,
    priority: 0,
    website_intelligence: null,
    raw_json: { secret: "should-not-leak-raw" },
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
  };
}

function fakePersona(org: string, name: string): Persona {
  return {
    id: `${org}-${name}`,
    created_at: "",
    updated_at: "",
    organization_id: org,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    persona_name: name,
    short_description: "Buyer",
    category: "Buyer",
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: null,
    state: null,
    city: null,
    location_summary: null,
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: "Founder",
    seniority: "Owner",
    industry_context: null,
    lifestyle: null,
    interests: null,
    digital_behavior: null,
    brands_influences: null,
    values_text: null,
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: null,
    needs: null,
    pain_points: "No clear offer",
    fears: null,
    motivations: "Grow pipeline",
    objections: null,
    buying_triggers: null,
    decision_criteria: null,
    purchase_behavior: null,
    typical_concerns: null,
    communication_style: null,
    preferred_channels: "LinkedIn",
    reference_website: null,
    notes: null,
    additional_context: null,
    ads_content: "Persona ads excerpt",
    source: "manual",
    status: "active",
    lifecycle_status: "Researching",
    opportunity_score: null,
    priority: 0,
    profile_json: null,
    raw_json: { embedding: [0.1, 0.2] },
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
  };
}

describe("ads context composer", () => {
  it("includes Brain, discussion-derived intelligence, prospects, and personas", async () => {
    const org = "org-trusted";
    const context = await composeAdsOrganizationContext({
      organizationId: org,
      brief: {},
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadProspects: async () => [fakeProspect(org, "Acme Co")],
        loadPersonas: async () => [fakePersona(org, "Scale Founder")],
      },
    });

    assert.equal(context.organizationId, org);
    assert.equal(context.briefMode, "inferred");
    assert.equal(context.meta.brainAvailable, true);
    assert.equal(context.meta.prospectCount, 1);
    assert.equal(context.meta.personaCount, 1);
    assert.match(context.brainIdentityBlock, /ATHENA BRAIN CONTEXT/);
    assert.match(context.organizationIntelligenceBlock, /Messaging clarity/);
    assert.match(context.prospectsBlock, /Acme Co/);
    assert.match(context.personasBlock, /Scale Founder/);
    assert.match(context.composedPromptContext, /OPERATOR GUIDANCE/);
  });

  it("excludes foreign organization rows and does not leak full raw rows", async () => {
    const org = "org-a";
    const context = await composeAdsOrganizationContext({
      organizationId: org,
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadProspects: async () => [
          fakeProspect(org, "Keep"),
          fakeProspect("org-b", "Foreign"),
        ],
        loadPersonas: async () => [
          fakePersona(org, "Keep Persona"),
          fakePersona("org-b", "Foreign Persona"),
        ],
      },
    });

    assert.doesNotMatch(context.prospectsBlock, /Foreign/);
    assert.doesNotMatch(context.personasBlock, /Foreign Persona/);
    assert.doesNotMatch(context.composedPromptContext, /should-not-leak-raw/);
    assert.doesNotMatch(context.composedPromptContext, /"embedding"/);
    assert.match(context.prospectsBlock, /Existing ad angle/);
    assert.match(context.personasBlock, /Persona ads excerpt/);
  });

  it("bounds prompt size and compact summaries", () => {
    const huge = "x".repeat(5_000);
    const prospects = summarizeProspectsForAds([
      {
        ...fakeProspect("org", "P"),
        notes: huge,
        ads_content: huge,
      },
    ]);
    const personas = summarizePersonasForAds([
      {
        ...fakePersona("org", "Per"),
        motivations: huge,
        ads_content: huge,
      },
    ]);

    assert.ok(
      (prospects[0].shortDescription?.length ?? 0) <=
        ADS_CONTEXT_LIMITS.fieldTruncate + 1,
    );
    assert.ok(
      (prospects[0].adsContentExcerpt?.length ?? 0) <=
        ADS_CONTEXT_LIMITS.adsContentTruncate + 1,
    );
    assert.ok(
      formatProspectSummariesBlock(prospects).length <=
        ADS_CONTEXT_LIMITS.prospectsBlockMaxChars,
    );
    assert.ok(
      formatPersonaSummariesBlock(personas).length <=
        ADS_CONTEXT_LIMITS.personasBlockMaxChars,
    );
  });

  it("keeps operator guidance separate from trusted brain block", async () => {
    const org = "org-g";
    const context = await composeAdsOrganizationContext({
      organizationId: org,
      brief: { guidance: "Push enterprise webinars" },
      deps: {
        buildBrain: async () => fakeBrain(org),
        loadProspects: async () => [],
        loadPersonas: async () => [],
      },
    });
    assert.equal(context.briefMode, "guided");
    assert.match(context.operatorGuidanceBlock, /Push enterprise webinars/);
    assert.doesNotMatch(context.brainIdentityBlock, /Push enterprise webinars/);
  });
});
