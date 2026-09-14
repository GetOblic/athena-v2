import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleProspectAudienceContextBlock,
  composeProspectAudienceContext,
  formatProspectGeographySection,
  formatProspectWebsiteIntelligenceForAudience,
  PROSPECT_AUDIENCE_CONTEXT_HEADER,
  ProspectAudienceContextCompositionError,
} from "../../services/personas/prospectAudienceContextComposer";
import type { Prospect } from "../../services/prospects/prospectService";

const ORG_ID = "org-33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "org-44444444-4444-4444-8444-444444444444";
const PROSPECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DISCUSSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EV_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function stubProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_ID,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    organization_id: ORG_ID,
    user_id: null,
    community_id: null,
    linked_discussion_id: DISCUSSION_ID,
    business_name: "Miami Glow Medical Spa",
    website: "https://miamiglow.example",
    linkedin: "https://linkedin.com/in/secret",
    facebook: null,
    instagram: null,
    industry: "Healthcare",
    category: "Medical Spa",
    country: "USA",
    state: "Florida",
    city: "Miami",
    address: "200 Ocean Drive",
    company_size: "11-50",
    revenue: "$2M",
    employee_count: "18",
    technologies: "Boulevard, PatientNow",
    pain_points: "Inconsistent consult show-up",
    decision_maker: "Jane Doe",
    first_name: "Jane",
    last_name: "Doe",
    external_contact_id: "ext-123",
    timezone: "America/New_York",
    job_title: "Owner",
    email: "jane@miamiglow.example",
    phone: "+1-555-0100",
    whatsapp_number: "+1-555-0101",
    getoblic_type: null,
    google_business_url: null,
    notes: "Wants local membership growth.",
    additional_context: "Competes with national med-spa chains.",
    source: "manual",
    status: "active",
    lifecycle_status: "active",
    ads_content: "Google Ads: Miami Glow new-patient facial.",
    opportunity_score: 80,
    priority: 1,
    website_intelligence: {
      provider: "homepage_only",
      url: "https://miamiglow.example",
      title: "Miami Glow Medical Spa",
      positioning: "Luxury med spa in Miami",
      services: "Injectables, facials, laser",
      products: "Medical-grade skincare",
      target_audience: "Affluent Miami professionals",
      messaging: "Glow with confidence",
      value_proposition: "Physician-led aesthetic care",
      differentiators: "Board-certified oversight",
      trust_signals: "Before/after gallery",
      brand_tone: "Warm clinical luxury",
      contact_information: "jane@miamiglow.example / +1-555-0100",
      email: "should-not-appear@example.com",
    },
    raw_json: {
      observed: { description: "Imported GetOblic spa listing copy." },
    },
    generated_listing_description: {
      description: "GENERATED listing copy must never be treated as factual.",
      generatedAt: "2026-08-08T00:00:00.000Z",
    },
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function stubExecutiveVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: EV_ID,
    discussion_id: DISCUSSION_ID,
    organization_id: ORG_ID,
    user_id: null,
    version_number: 2,
    is_current: true,
    generated_at: "2026-08-08T00:00:00.000Z",
    generation_duration_ms: 1000,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: "analysis-1",
    opportunity_id: "opp-1",
    review_id: "review-1",
    blueprint_id: "blueprint-1",
    intelligence: {
      analysis: {
        id: "analysis-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        user_id: null,
        community_id: null,
        status: "ready",
        summary: "Strong local med-spa demand with weak follow-up.",
        sentiment: "positive",
        intent: "buy",
        buyer_stage: "consideration",
        pain_points: "No-show consults",
        opportunity_detected: true,
        opportunity_title: "Membership conversion",
        opportunity_reason: "High inquiry, low booking",
        recommended_action: "Rebuild intake",
        suggested_cta: "DEPLOYMENT ASSET PAYLOAD SHOULD NOT BE REQUIRED",
        risk_level: "medium",
        confidence: 0.8,
        strategy_key: "standard",
        strategy_prompt_version: null,
        analysis_prompt_version: null,
        model: null,
        generation_time_ms: null,
        raw_json: null,
      },
      opportunity: {
        id: "opp-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        community_id: null,
        type: "growth",
        status: "open",
        score: 70,
        urgency: "medium",
        intent: "buy",
        risk_level: "low",
        title: "Local membership growth",
        reason: "Miami aesthetic demand",
        recommended_action: "Launch membership offer",
        suggested_cta: null,
        assigned_to: null,
        due_at: null,
        ai_summary: "High-intent local searchers.",
        ai_recommendation: "Prioritize booking UX.",
        raw_json: null,
      },
      briefing: {
        id: "review-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        opportunity_id: "opp-1",
        status: "ready",
        summary: "Pitch a membership-led growth plan.",
        pain_points: "No-show consults",
        buyer_stage: "consideration",
        recommended_response: "Lead with retention.",
        cta: "Book strategy call",
        confidence: 0.7,
        raw_json: null,
        model: null,
        prompt_version: null,
        generation_time_ms: null,
        version: 1,
        approved_by: null,
        approved_at: null,
        notes: "Keep clinical tone.",
      },
      blueprint: {
        id: "blueprint-1",
        user_id: null,
        discussion_id: DISCUSSION_ID,
        opportunity_id: "opp-1",
        briefing_id: "review-1",
        asset_title: "Med Spa Membership Guide",
        asset_type: "pdf",
        business_goal: "Increase memberships",
        target_audience: "Miami med-spa owners",
        priority: "high",
        estimated_reuse: 3,
        image_prompt: "SECRET IMAGE PROMPT",
        pdf_prompt: "SECRET PDF PROMPT",
        social_prompt: "SECRET SOCIAL PROMPT",
        trend_social_prompt: "SECRET TREND PROMPT",
        notes: "Use calm clinical visuals.",
        status: "ready",
        raw_json: null,
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
      },
    },
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("prospect audience context composer", () => {
  it("refetches the Prospect with the session organization and fails closed for the wrong org", async () => {
    const seen: Array<{ id: string; org: string }> = [];
    await assert.rejects(
      () =>
        composeProspectAudienceContext({
          prospectId: PROSPECT_ID,
          organizationId: OTHER_ORG,
          deps: {
            getProspectById: async (id, organizationId) => {
              seen.push({ id, org: organizationId });
              return organizationId === ORG_ID ? stubProspect() : null;
            },
          },
        }),
      (error: unknown) =>
        error instanceof ProspectAudienceContextCompositionError,
    );
    assert.deepEqual(seen, [{ id: PROSPECT_ID, org: OTHER_ORG }]);
  });

  it("fails closed when the Prospect is missing", async () => {
    await assert.rejects(
      () =>
        composeProspectAudienceContext({
          prospectId: PROSPECT_ID,
          organizationId: ORG_ID,
          deps: {
            getProspectById: async () => null,
          },
        }),
      (error: unknown) =>
        error instanceof ProspectAudienceContextCompositionError,
    );
  });

  it("includes factual Prospect context and labels the block as trusted market evidence", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.match(result.composedText, new RegExp(PROSPECT_AUDIENCE_CONTEXT_HEADER));
    assert.match(result.composedText, /Trusted Athena evidence/);
    assert.match(result.composedText, /Miami Glow Medical Spa/);
    assert.match(result.composedText, /Healthcare/);
    assert.match(result.composedText, /Medical Spa/);
    assert.match(result.composedText, /11-50/);
    assert.match(result.composedText, /18/);
    assert.match(result.composedText, /\$2M/);
    assert.match(result.composedText, /Boulevard/);
    assert.match(result.composedText, /Inconsistent consult show-up/);
    assert.match(result.composedText, /Wants local membership growth/);
    assert.match(result.composedText, /national med-spa chains/);
    assert.match(result.composedText, /Google Ads: Miami Glow/);
  });

  it("includes homepage website intelligence and excludes contact PII", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.match(result.composedText, /Luxury med spa in Miami/);
    assert.match(result.composedText, /Injectables, facials, laser/);
    assert.match(result.composedText, /Physician-led aesthetic care/);
    assert.match(result.composedText, /Board-certified oversight/);
    assert.match(result.composedText, /Warm clinical luxury/);
    assert.doesNotMatch(result.composedText, /jane@miamiglow\.example/);
    assert.doesNotMatch(result.composedText, /\+1-555-0100/);
    assert.doesNotMatch(result.composedText, /\+1-555-0101/);
    assert.doesNotMatch(result.composedText, /Jane Doe/);
    assert.doesNotMatch(result.composedText, /should-not-appear@example\.com/);
    assert.doesNotMatch(result.composedText, /ext-123/);
    assert.doesNotMatch(result.composedText, /opportunity_score/);
    assert.doesNotMatch(result.composedText, /prospect_id/);
    assert.ok(!result.composedText.includes(PROSPECT_ID));
  });

  it("includes deep website intelligence when provider is deep_v1", async () => {
    const formatted = formatProspectWebsiteIntelligenceForAudience({
      provider: "deep_v1",
      url: "https://miamiglow.example",
      scraped_at: "2026-08-08T00:00:00.000Z",
      pages_analyzed: 4,
      pages: [],
      crawl_summary: {
        pages_analyzed: 4,
        services_discovered: 3,
        faqs_discovered: 0,
        testimonials_discovered: 0,
        team_pages_discovered: 0,
        commercial_pages_discovered: 1,
      },
      business_knowledge: {
        positioning: "Deep positioning for physician-led Miami med spa",
        about: "Deep about the spa",
        products: "Deep products",
        services: "Deep injectables and laser",
        solutions: "",
        pricing: "",
        training: "",
        faq: "",
        team: "",
        testimonials: "",
        case_studies: "",
        target_audience: "Deep target audience",
        messaging: "",
        value_proposition: "Deep value",
        differentiators: "",
        trust_signals: "",
        contact_information: "jane@miamiglow.example",
        brand_tone: "Deep tone",
        cta: "",
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
      contact_information: "jane@miamiglow.example",
      brand_tone: "",
      headings: "",
      paragraphs: "",
    });

    assert.match(formatted, /Deep positioning for physician-led Miami med spa/);
    assert.match(formatted, /Deep injectables and laser/);
    assert.doesNotMatch(formatted, /jane@miamiglow\.example/);
    assert.doesNotMatch(formatted, /^Contact:/m);
  });

  it("includes current Executive Intelligence and commercially relevant blueprint fields", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.match(result.composedText, /Current Executive Intelligence/);
    assert.match(result.composedText, /Strong local med-spa demand/);
    assert.match(result.composedText, /Local membership growth/);
    assert.match(result.composedText, /Pitch a membership-led growth plan/);
    assert.match(result.composedText, /Increase memberships/);
    assert.match(result.composedText, /Miami med-spa owners/);
    assert.doesNotMatch(result.composedText, /SECRET IMAGE PROMPT/);
    assert.doesNotMatch(result.composedText, /SECRET PDF PROMPT/);
  });

  it("excludes prior Executive Versions and only asks for the current version", async () => {
    let currentCalls = 0;
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async (discussionId, organizationId) => {
          currentCalls += 1;
          assert.equal(discussionId, DISCUSSION_ID);
          assert.equal(organizationId, ORG_ID);
          return stubExecutiveVersion() as never;
        },
      },
    });

    assert.equal(currentCalls, 1);
    assert.doesNotMatch(result.composedText, /prior version/i);
    assert.doesNotMatch(result.composedText, /version_number: 1/);
  });

  it("does not treat generated listing description as factual source material", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.doesNotMatch(
      result.composedText,
      /GENERATED listing copy must never be treated as factual/,
    );
  });

  it("allows imported factual GetOblic description through the canonical reader", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.match(result.composedText, /Imported GetOblic factual description/);
    assert.match(result.composedText, /Imported GetOblic spa listing copy/);
  });

  it("includes city, state, and country in trusted geographic evidence", async () => {
    const result = await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () =>
          stubExecutiveVersion() as never,
      },
    });

    assert.match(result.composedText, /Prospect geographic market evidence/);
    assert.match(result.composedText, /city: Miami/);
    assert.match(result.composedText, /state: Florida/);
    assert.match(result.composedText, /country: USA/);
    assert.match(result.composedText, /200 Ocean Drive/);
  });

  it("does not invent geographic data when absent", async () => {
    const geography = formatProspectGeographySection(
      stubProspect({
        city: null,
        state: null,
        country: null,
        address: null,
      }),
    );
    assert.equal(geography, "");

    const composed = assembleProspectAudienceContextBlock({
      businessName: "Acme Wellness",
      profile: "industry: Healthcare",
      geography: "",
      notes: "",
      painTech: "",
      ads: "",
      website: "",
      executive: "",
      blueprint: "",
      getoblic: "",
    });
    assert.doesNotMatch(composed, /Prospect geographic market evidence/);
    assert.doesNotMatch(composed, /city:/);
    assert.doesNotMatch(composed, /state:/);
    assert.doesNotMatch(composed, /country:/);
    assert.doesNotMatch(composed, /Miami/);
    assert.doesNotMatch(composed, /Florida/);
    assert.doesNotMatch(composed, /USA/);
  });

  it("preserves geography instead of silently discarding it under pressure", () => {
    const composed = assembleProspectAudienceContextBlock({
      businessName: "Miami Glow Medical Spa",
      profile: "x".repeat(4_000),
      geography: "city: Miami\nstate: Florida\ncountry: USA",
      notes: "y".repeat(3_000),
      painTech: "pain_points: overflow",
      ads: "z".repeat(2_000),
      website: "w".repeat(6_000),
      executive: "e".repeat(4_000),
      blueprint: "b".repeat(2_000),
      getoblic: "g".repeat(2_000),
    });

    assert.match(composed, /TRUSTED PROSPECT-DERIVED MARKET EVIDENCE/);
    assert.match(composed, /Prospect geographic market evidence/);
    assert.match(composed, /city: Miami/);
    assert.match(composed, /state: Florida/);
    assert.match(composed, /country: USA/);
  });

  it("does not load Executive Intelligence for a discussion in another organization", async () => {
    let evOrg: string | null = null;
    await composeProspectAudienceContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async (_discussionId, organizationId) => {
          evOrg = organizationId;
          return stubExecutiveVersion() as never;
        },
      },
    });
    assert.equal(evOrg, ORG_ID);
  });
});
