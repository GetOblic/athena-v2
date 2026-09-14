import "./adsTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  ADS_TARGET_CLEAR_HREF,
  formatAdsTargetSummary,
  normalizeAdsPersonaId,
} from "../../lib/ads/adsTargetPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  normalizeAdCampaignBrief,
  resolveAdCampaignBriefMode,
} from "../../services/ads/adCampaignBrief";
import { mapAdCampaignRow } from "../../services/ads/adCampaignMappers";
import { toPublicAdCampaignDetail } from "../../services/ads/adCampaignPublic";
import { createAdCampaign } from "../../services/ads/adCampaignService";
import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignPackage,
} from "../../services/ads/adCampaignTypes";
import { validateAdCampaignPackage } from "../../services/ads/adCampaignValidation";
import {
  ADS_CONTEXT_LIMITS,
  composeAdsOrganizationContext,
} from "../../services/ads/adsContextComposer";
import { ADS_SHARED_OUTPUT_RULES } from "../../services/ai/prompts/ads/adsSharedConstraints";
import {
  buildAdsTargetAudienceView,
  composeAdsPrimaryTargetAudience,
  extractAdsCandidatePersonaId,
  persistAdsCampaignBriefJson,
  readAdsTargetPersonaId,
  resolveAdsTargetPersona,
} from "../../services/ads/adsTargetPersona";
import type { Persona } from "../../services/personas/personaService";

const ROOT = process.cwd();
const TARGET_ID = "8657e42c-3b06-4e83-ad6c-3c9e938491d6";
const SECONDARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "org-trusted";
const OTHER_ORG = "org-foreign";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function fakePersona(
  organizationId: string,
  extras: Partial<Persona> = {},
): Persona {
  return {
    id: extras.id ?? TARGET_ID,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    organization_id: organizationId,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    persona_name: extras.persona_name ?? "Heritage Diner Owner",
    short_description:
      extras.short_description ?? "Traditional diner owner/operator",
    category: extras.category ?? "Hospitality",
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: extras.country ?? "United States",
    state: extras.state ?? "Ohio",
    city: extras.city ?? "Troy",
    location_summary: extras.location_summary ?? "Troy, Ohio",
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: extras.occupation ?? "Diner owner/operator",
    seniority: extras.seniority ?? "Owner",
    industry_context: extras.industry_context ?? "Independent restaurants",
    lifestyle: null,
    interests: extras.interests ?? "Local regulars",
    digital_behavior: null,
    brands_influences: null,
    values_text: extras.values_text ?? "Keep the counter full",
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: extras.goals ?? "Fill weekday lunch",
    needs: extras.needs ?? "Reliable weekday traffic",
    pain_points: extras.pain_points ?? "Empty midweek tables",
    fears: extras.fears ?? "Losing regulars",
    motivations: extras.motivations ?? "Family business pride",
    objections: extras.objections ?? "Marketing feels wasteful",
    typical_concerns: extras.typical_concerns ?? "Will this waste the budget",
    buying_triggers: extras.buying_triggers ?? "Neighbor referral",
    decision_criteria: extras.decision_criteria ?? "Simple and local",
    purchase_behavior: extras.purchase_behavior ?? "Cautious and local",
    communication_style: extras.communication_style ?? "Plain and warm",
    preferred_channels: extras.preferred_channels ?? "Facebook",
    reference_website: null,
    notes: "private admin note",
    additional_context: "should-not-leak-context",
    ads_content: extras.ads_content ?? "Existing diner ad excerpt",
    source: "manual",
    status: extras.status ?? "Ready",
    lifecycle_status: extras.lifecycle_status ?? "In Use",
    opportunity_score: null,
    priority: 0,
    profile_json: extras.profile_json ?? { secret: "profile-secret" },
    raw_json: extras.raw_json ?? { secret: "persona-secret", embedding: [1] },
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: extras.import_batch_id ?? "import-batch-9",
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    ...extras,
    organization_id: organizationId,
  };
}

function emptyComposerDeps(personas: Persona[] = []) {
  return {
    buildBrain: async () => null,
    loadProspects: async () => [],
    loadPersonas: async () => personas,
    loadPersonaById: async (personaId: string, organizationId: string) => {
      return (
        personas.find(
          (row) =>
            row.id === personaId && row.organization_id === organizationId,
        ) ?? null
      );
    },
  };
}

function validPackage(): AdCampaignPackage {
  return {
    strategy: {
      campaignName: "Authority Lead Campaign",
      objective: "Generate qualified consult bookings",
      audience: "Growth-stage founders",
      coreOfferOrMessage: "Clarity before scale",
      positioningAngle: "Operator-led diagnosis",
      primaryValueProposition: "Turn scattered demand into booked work",
      ctaDirection: "Book a strategy call",
      landingPageDirection: "Service landing with proof",
      rationale: "Brain shows recurring demand for structured diagnosis.",
      briefMode: "inferred",
    },
    facebook: {
      primaryText: "Founders stall when messaging fragments.",
      headline: "Clarity before scale",
      description: "Book a focused strategy call.",
      ctaRecommendation: "Book Now",
      audienceDirection: "Founders scaling past referrals",
      creativeConcept: "Whiteboard before/after clarity",
      imagePrompt: "Clean desk, founder reviewing a one-page plan",
    },
    instagram: {
      feedCaption: "Your offer is fine. Your signal is muddy.",
      openingHook: "Stop posting random authority.",
      reelOrStoryScript: "Hook → pain → one diagnostic CTA",
      onScreenText: "Clarity before scale",
      cta: "Link in bio → strategy call",
      hashtagDirection: null,
      creativeConcept: "Vertical talking-head with diagram overlay",
      imageOrShortVideoPrompt: "Vertical reel of founder sketching a funnel",
    },
    tiktok: {
      openingHook: "If your ads feel generic, watch this.",
      shortVideoScript: "Call out scattered messaging, show the fix.",
      sceneDirection: "Fast cuts, desk, one whiteboard beat",
      onScreenText: "Fix the offer signal",
      caption: "Clarity before scale — book the call",
      cta: "Comment CALL for the link",
      creatorOrProductionDirection: "Native creator tone, no corporate VO",
    },
    googleSearch: {
      campaignTheme: "Strategy call demand capture",
      adGroupThemes: ["Consulting diagnosis", "Offer clarity"],
      headlines: ["Book a strategy call", "Clarify your offer", "Operator-led plan"],
      descriptions: [
        "Turn scattered demand into booked consults.",
        "Practical diagnosis for scaling founders.",
      ],
      sitelinkIdeas: ["How it works", "Case proof"],
      calloutIdeas: ["Operator-led", "No fluff"],
      structuredSnippetIdeas: [
        "Services: Audit, Strategy, Coaching",
        "Types: Diagnosis, Messaging, Pipeline",
      ],
      negativeKeywordSuggestions: ["free templates", "internships"],
      landingPageDirection: "Service page with booking CTA",
    },
    keywordThemes: {
      label: KEYWORD_THEMES_LABEL,
      themes: [
        {
          theme: "offer clarity consulting",
          intentClassification: "commercial investigation",
          audienceRelevance: "Founders refining positioning",
          suggestedMessageAngle: "Clarity before scale",
          suggestedLandingPageDirection: "Consulting service page",
        },
        {
          theme: "strategy call for founders",
          intentClassification: "transactional",
          audienceRelevance: "Ready-to-book operators",
          suggestedMessageAngle: "Book diagnosis",
          suggestedLandingPageDirection: "Booking page",
        },
        {
          theme: "business messaging audit",
          intentClassification: "problem-aware",
          audienceRelevance: "Teams with inconsistent messaging",
          suggestedMessageAngle: "Audit the signal",
          suggestedLandingPageDirection: "Audit offer page",
        },
      ],
      disclaimer: KEYWORD_THEMES_DISCLAIMER,
    },
  };
}

function installAdCampaignCreateMock() {
  const campaignInserts: Record<string, unknown>[] = [];
  const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const builder = {
      insert(row: Record<string, unknown>) {
        if (table === "ad_campaigns") campaignInserts.push(row);
        return builder;
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (table === "ad_campaigns") {
          const row = campaignInserts[campaignInserts.length - 1] ?? {};
          return {
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              status: "Queued",
              generation_stage: null,
              package_json: null,
              error_code: null,
              error_message: null,
              created_at: "2026-09-14T00:00:00.000Z",
              updated_at: "2026-09-14T00:00:00.000Z",
              ...row,
            },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected table ${table}` } };
      },
    };
    return builder;
  };

  return {
    campaignInserts,
    restore() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).from = originalFrom;
    },
  };
}

describe("Ads targeted mode — Persona CTA", () => {
  it("points Create advertising at the current Persona id only", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /data-persona-header-action="create-advertising"/);
    assert.match(
      page,
      /href=\{`\/ads\/new\?personaId=\$\{persona\.id\}`\}/,
    );
    assert.doesNotMatch(page, /href="\/ads\/new"/);
    assert.doesNotMatch(
      page,
      /ads\/new\?personaId=\$\{persona\.(persona_name|short_description|raw_json|profile_json|organization_id|name)/,
    );
    assert.match(
      page,
      /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/,
    );
    assert.equal(en.ads.new.targetAudience, "Target audience");
    assert.equal(en.ads.new.clear, "Clear");
    assert.notEqual(fr.ads.new.targetAudience, en.ads.new.targetAudience);
    assert.notEqual(de.ads.new.clear, en.ads.new.clear);
    assert.equal(es.ads.new.targetAudience.length > 0, true);
    assert.equal(itMessages.ads.new.clear.length > 0, true);
    assert.equal(pt.ads.new.targetAudience.length > 0, true);
  });

  it("keeps library Create campaign on generic /ads/new", () => {
    const library = read("components/ads/AdsLibraryClient.tsx");
    assert.match(library, /href="\/ads\/new"/);
    assert.doesNotMatch(library, /personaId/);
  });
});

describe("Ads targeted mode — presentation and form", () => {
  it("resolves a same-org target to a bounded display view", async () => {
    const persona = fakePersona(ORG);
    const resolved = await resolveAdsTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => persona,
    });
    assert.ok(resolved);
    assert.equal(resolved.id, TARGET_ID);
    assert.equal(resolved.organization_id, ORG);

    const view = buildAdsTargetAudienceView(persona);
    assert.deepEqual(view, {
      personaId: TARGET_ID,
      name: "Heritage Diner Owner",
      summary: formatAdsTargetSummary(
        "Troy, Ohio",
        "Traditional diner owner/operator",
      ),
    });
    assert.equal(view.summary, "Troy, Ohio · Traditional diner owner/operator");
    assert.equal("organization_id" in view, false);
    assert.equal("raw_json" in view, false);
    assert.equal("notes" in view, false);
  });

  it("renders the target chip with name, summary, and Clear → /ads/new", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /data-ads-target="audience"/);
    assert.match(form, /data-ads-target-name/);
    assert.match(form, /data-ads-target-summary/);
    assert.match(form, /data-ads-clear-target/);
    assert.match(form, /ADS_TARGET_CLEAR_HREF/);
    assert.match(form, /targetAudience\.name/);
    assert.match(form, /targetAudience\.summary/);
    assert.match(form, /personaId: targetAudience\.personaId/);
    assert.doesNotMatch(form, /setAudience\(target/);
    assert.doesNotMatch(form, /setGeography\(target/);
    assert.doesNotMatch(form, /setGuidance\(target/);
    assert.doesNotMatch(form, /setObjective\(target/);
    assert.equal(ADS_TARGET_CLEAR_HREF, "/ads/new");

    const html = renderToStaticMarkup(
      createElement(
        "div",
        { "data-ads-target": "audience" },
        createElement("p", { "data-ads-target-name": "" }, "Heritage Diner Owner"),
        createElement(
          "p",
          { "data-ads-target-summary": "" },
          "Troy, Ohio · Traditional diner owner/operator",
        ),
        createElement("a", { href: ADS_TARGET_CLEAR_HREF }, "Clear"),
      ),
    );
    assert.match(html, /Heritage Diner Owner/);
    assert.match(html, /Troy, Ohio/);
    assert.match(html, /href="\/ads\/new"/);
  });

  it("keeps the generic form free of a target chip", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /targetAudience \? \(/);
    assert.match(form, /targetAudience = null/);
    const page = read("app/ads/new/page.tsx");
    assert.match(page, /searchParams/);
    assert.match(page, /resolveAdsTargetAudienceView/);
    assert.match(page, /targetAudience=\{targetAudience\}/);
    assert.doesNotMatch(page, /warning|inaccessible|wrong.org/i);
  });
});

describe("Ads targeted mode — trust boundary", () => {
  it("normalizes and independently authorizes a candidate Persona id", async () => {
    assert.equal(normalizeAdsPersonaId(TARGET_ID), TARGET_ID);
    assert.equal(normalizeAdsPersonaId("not-a-uuid"), null);
    assert.equal(normalizeAdsPersonaId(12), null);
    assert.equal(
      extractAdsCandidatePersonaId({ personaId: TARGET_ID, guidance: "x" }),
      TARGET_ID,
    );
    assert.equal(
      extractAdsCandidatePersonaId({
        brief: { personaId: TARGET_ID },
        targetPersonaId: SECONDARY_ID,
      }),
      TARGET_ID,
    );
    assert.equal(
      extractAdsCandidatePersonaId({ targetPersonaId: TARGET_ID }),
      null,
    );

    const ignored = normalizeAdCampaignBrief({
      personaId: TARGET_ID,
      targetPersonaId: TARGET_ID,
      guidance: "  Push lunch  ",
    });
    assert.deepEqual(ignored, { guidance: "Push lunch" });
    assert.equal("personaId" in ignored, false);
    assert.equal("targetPersonaId" in ignored, false);

    const sameOrg = await resolveAdsTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => fakePersona(ORG),
    });
    assert.equal(sameOrg?.id, TARGET_ID);

    const malformed = await resolveAdsTargetPersona({
      personaId: "not-a-uuid",
      organizationId: ORG,
      loadPersonaById: async () => fakePersona(ORG),
    });
    assert.equal(malformed, null);

    const missing = await resolveAdsTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => null,
    });
    assert.equal(missing, null);

    const wrongOrg = await resolveAdsTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => fakePersona(OTHER_ORG),
    });
    assert.equal(wrongOrg, null);

    const swappedId = await resolveAdsTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () =>
        fakePersona(ORG, { id: SECONDARY_ID }),
    });
    assert.equal(swappedId, null);
  });

  it("API re-resolves personaId and never trusts client targetPersonaId", () => {
    const route = read("app/api/ads/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /normalizeAdCampaignBrief\(briefSource\)/);
    assert.match(route, /extractAdsCandidatePersonaId\(rest\)/);
    assert.match(route, /resolveAdsTargetPersona/);
    assert.match(route, /authorizedTargetPersonaId: targetPersona\?\.id \?\? null/);
    assert.match(route, /targetPersonaId: _clientTargetPersonaId/);
    assert.doesNotMatch(route, /brief\.personaId/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(
      read("lib/ads/adsTargetPresentation.ts"),
      /socialPlanner/,
    );
    assert.doesNotMatch(
      read("services/ads/adsTargetPersona.ts"),
      /socialPlanner/,
    );
  });
});

describe("Ads targeted mode — persistence and public brief", () => {
  it("persists targetPersonaId only after authorization and strips it from the operator brief", async () => {
    const targeted = persistAdsCampaignBriefJson({ guidance: "Keep it local" }, TARGET_ID);
    assert.deepEqual(targeted, {
      guidance: "Keep it local",
      targetPersonaId: TARGET_ID,
    });
    assert.deepEqual(persistAdsCampaignBriefJson({}, null), {});
    assert.deepEqual(persistAdsCampaignBriefJson({ guidance: "x" }, "bad"), {
      guidance: "x",
    });
    assert.equal(readAdsTargetPersonaId(targeted), TARGET_ID);
    assert.equal(readAdsTargetPersonaId({}), null);

    const mapped = mapAdCampaignRow({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: ORG,
      user_id: null,
      name: "Untitled Ad Campaign",
      brief_json: targeted,
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-09-14T00:00:00.000Z",
      updated_at: "2026-09-14T00:00:00.000Z",
    });
    assert.deepEqual(mapped.brief_json, { guidance: "Keep it local" });
    assert.equal(mapped.targetPersonaId, TARGET_ID);
    const publicDetail = toPublicAdCampaignDetail(mapped);
    assert.deepEqual(publicDetail.brief, { guidance: "Keep it local" });
    assert.equal("targetPersonaId" in publicDetail.brief, false);
    assert.equal("targetPersonaId" in publicDetail, false);

    const mock = installAdCampaignCreateMock();
    try {
      await createAdCampaign({
        organizationId: ORG,
        userId: "user-1",
        brief: { guidance: "Keep it local" },
        authorizedTargetPersonaId: TARGET_ID,
      });
      assert.deepEqual(mock.campaignInserts[0].brief_json, {
        guidance: "Keep it local",
        targetPersonaId: TARGET_ID,
      });

      await createAdCampaign({
        organizationId: ORG,
        userId: "user-1",
        brief: {},
      });
      assert.deepEqual(mock.campaignInserts[1].brief_json, {});
      assert.equal(
        "targetPersonaId" in
          (mock.campaignInserts[1].brief_json as Record<string, unknown>),
        false,
      );
    } finally {
      mock.restore();
    }
  });

  it("client-injected targetPersonaId cannot become trusted provenance", () => {
    const injected = mapAdCampaignRow({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: ORG,
      user_id: null,
      name: "Injected",
      brief_json: normalizeAdCampaignBrief({
        targetPersonaId: TARGET_ID,
        personaId: TARGET_ID,
      }),
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-09-14T00:00:00.000Z",
      updated_at: "2026-09-14T00:00:00.000Z",
    });
    assert.deepEqual(injected.brief_json, {});
    assert.equal(injected.targetPersonaId, null);
    assert.equal("targetPersonaId" in toPublicAdCampaignDetail(injected).brief, false);
  });
});

describe("Ads targeted mode — worker, prompt, and portfolio", () => {
  it("worker reads the persisted target and re-resolves with the job organization", () => {
    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    assert.match(executor, /getAdCampaignById\(\s*job\.campaign_id,\s*job\.organization_id/);
    assert.match(executor, /brief: campaign\.brief_json/);
    assert.match(
      executor,
      /authorizedTargetPersonaId: campaign\.targetPersonaId \?\? null/,
    );
    assert.match(executor, /organizationId: job\.organization_id/);
    const pipeline = read("services/ads/adsGenerationPipeline.ts");
    assert.match(pipeline, /authorizedTargetPersonaId: input\.authorizedTargetPersonaId/);
    assert.match(pipeline, /composeAdsOrganizationContext|compose\(/);
  });

  it("emits PRIMARY TARGET AUDIENCE only when resolution succeeds", async () => {
    const target = fakePersona(ORG);
    const secondary = fakePersona(ORG, {
      id: SECONDARY_ID,
      persona_name: "Maria Rodriguez",
      short_description: "Salon owner",
    });
    const targeted = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: emptyComposerDeps([target, secondary]),
    });
    assert.match(
      targeted.composedPromptContext,
      /PRIMARY TARGET AUDIENCE \(TRUSTED\)/,
    );
    assert.match(
      targeted.composedPromptContext,
      /PRIMARY target customer/,
    );
    assert.match(
      targeted.composedPromptContext,
      /advertiser \/ company being promoted/,
    );
    assert.match(
      targeted.composedPromptContext,
      /secondary \/ reference intelligence/,
    );
    assert.match(
      targeted.composedPromptContext,
      /Prospects are evidence, not the campaign target/,
    );
    assert.match(
      targeted.composedPromptContext,
      /Operator guidance, audience, and geography cannot replace/,
    );
    assert.match(
      targeted.composedPromptContext,
      /Persona geography is audience and messaging context/,
    );
    assert.match(
      targeted.composedPromptContext,
      /Operator geography is additional untrusted direction/,
    );
    assert.equal(targeted.briefMode, "inferred");
    assert.equal(targeted.authorizedTargetPersonaId, TARGET_ID);
    assert.equal(targeted.primaryTargetAudience?.name, "Heritage Diner Owner");
    assert.doesNotMatch(targeted.composedPromptContext, /private admin note/);
    assert.doesNotMatch(targeted.composedPromptContext, /persona-secret/);
    assert.doesNotMatch(targeted.composedPromptContext, /profile-secret/);
    assert.doesNotMatch(targeted.composedPromptContext, /should-not-leak-context/);
    assert.doesNotMatch(
      targeted.composedPromptContext,
      new RegExp(TARGET_ID, "i"),
    );

    const intelligence = composeAdsPrimaryTargetAudience(target);
    assert.equal(intelligence.name, "Heritage Diner Owner");
    assert.equal(intelligence.city, "Troy");
    assert.equal("notes" in intelligence, false);
    assert.equal("raw_json" in intelligence, false);
    assert.equal("organization_id" in intelligence, false);
    assert.equal("id" in intelligence, false);
  });

  it("does not flip an empty operator brief from inferred to guided", async () => {
    const context = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: emptyComposerDeps([fakePersona(ORG)]),
    });
    assert.equal(resolveAdCampaignBriefMode({}), "inferred");
    assert.equal(context.briefMode, "inferred");
    assert.match(context.operatorGuidanceBlock, /No campaign brief was supplied/);
    assert.match(ADS_SHARED_OUTPUT_RULES, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
    assert.match(ADS_SHARED_OUTPUT_RULES, /advertiser being promoted/);
  });

  it("keeps generic composed context free of a PRIMARY TARGET heading", async () => {
    const personas = [fakePersona(ORG), fakePersona(ORG, { id: SECONDARY_ID })];
    const generic = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      deps: emptyComposerDeps(personas),
    });
    const omitted = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: null,
      deps: emptyComposerDeps(personas),
    });
    const malformed = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: "not-a-uuid",
      deps: emptyComposerDeps(personas),
    });
    const missing = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: {
        ...emptyComposerDeps(personas),
        loadPersonaById: async () => null,
        loadPersonas: async () => personas.filter((row) => row.id !== TARGET_ID),
      },
    });
    const wrongOrg = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: {
        ...emptyComposerDeps([]),
        loadPersonaById: async () => fakePersona(OTHER_ORG),
      },
    });

    assert.doesNotMatch(generic.composedPromptContext, /PRIMARY TARGET AUDIENCE/);
    assert.equal(generic.composedPromptContext, omitted.composedPromptContext);
    assert.equal(generic.composedPromptContext, malformed.composedPromptContext);
    assert.doesNotMatch(missing.composedPromptContext, /PRIMARY TARGET AUDIENCE/);
    assert.doesNotMatch(wrongOrg.composedPromptContext, /PRIMARY TARGET AUDIENCE/);
    assert.equal(generic.meta.personaCount, 2);
    assert.equal(generic.authorizedTargetPersonaId, null);
  });

  it("keeps the generic newest-8 portfolio and represents an older target without duplicating", async () => {
    const newest = Array.from({ length: 8 }, (_, index) =>
      fakePersona(ORG, {
        id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
        persona_name: `Newest ${index}`,
      }),
    );
    const olderTarget = fakePersona(ORG, {
      persona_name: "Heritage Diner Owner",
    });

    const generic = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      deps: emptyComposerDeps([...newest, olderTarget]),
    });
    assert.equal(generic.meta.personaCount, ADS_CONTEXT_LIMITS.personas);
    assert.match(generic.personasBlock, /Newest 0/);
    assert.doesNotMatch(generic.personasBlock, /Heritage Diner Owner/);
    assert.doesNotMatch(generic.composedPromptContext, /PRIMARY TARGET AUDIENCE/);

    const targetedMissing = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: emptyComposerDeps([...newest, olderTarget]),
    });
    assert.equal(targetedMissing.meta.personaCount, 9);
    assert.match(targetedMissing.personasBlock, /Heritage Diner Owner/);
    assert.match(targetedMissing.personasBlock, /Newest 0/);
    assert.match(
      targetedMissing.composedPromptContext,
      /PRIMARY TARGET AUDIENCE \(TRUSTED\)/,
    );

    const alreadyIncluded = await composeAdsOrganizationContext({
      organizationId: ORG,
      brief: {},
      authorizedTargetPersonaId: TARGET_ID,
      deps: emptyComposerDeps([olderTarget, ...newest.slice(0, 7)]),
    });
    assert.equal(alreadyIncluded.meta.personaCount, 8);
    assert.equal(
      alreadyIncluded.personasBlock.match(/Heritage Diner Owner/g)?.length,
      1,
    );
  });
});

describe("Ads targeted mode — regeneration, completion, and package", () => {
  it("regenerate inherits the authorized target from server metadata", () => {
    const orchestration = read("services/ads/adCampaignOrchestration.ts");
    assert.match(orchestration, /source\.brief_json/);
    assert.match(
      orchestration,
      /authorizedTargetPersonaId: source\.targetPersonaId \?\? null/,
    );
    const mapper = read("services/ads/adCampaignMappers.ts");
    assert.match(mapper, /targetPersonaId: readAdsTargetPersonaId\(row\.brief_json\)/);
    assert.match(mapper, /brief_json: mapBrief\(row\.brief_json\)/);
  });

  it("completion preserves brief_json.targetPersonaId", () => {
    const migration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    const completeFn = migration.slice(
      migration.indexOf("create or replace function complete_athena_ad_generation_job"),
    );
    const updateAds = completeFn.slice(completeFn.indexOf("update ad_campaigns"));
    assert.match(updateAds, /package_json = p_package_json/);
    assert.doesNotMatch(
      updateAds.slice(0, updateAds.indexOf("return v_job")),
      /brief_json/,
    );
    const service = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    assert.match(service, /complete_athena_ad_generation_job/);
    assert.match(service, /p_package_json: input\.packageJson/);
    assert.doesNotMatch(service, /p_brief_json|brief_json:/);
  });

  it("existing Ads package still validates", () => {
    const pkg = validateAdCampaignPackage(validPackage());
    assert.equal(pkg.strategy.campaignName, "Authority Lead Campaign");
    assert.equal(pkg.facebook.headline, "Clarity before scale");
    assert.equal(pkg.instagram.cta, "Link in bio → strategy call");
    assert.equal(pkg.tiktok.cta, "Comment CALL for the link");
    assert.equal(pkg.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(pkg.keywordThemes.themes.length, 3);
  });
});

describe("Ads targeted mode — isolation", () => {
  it("does not import Social Planner implementation or add a migration", () => {
    const adsOwned = [
      "lib/ads/adsTargetPresentation.ts",
      "services/ads/adsTargetPersona.ts",
      "services/ads/adsContextComposer.ts",
      "services/ads/adCampaignService.ts",
      "services/ads/adCampaignOrchestration.ts",
      "services/ads/adsGenerationPipeline.ts",
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
      "app/api/ads/route.ts",
      "app/ads/new/page.tsx",
      "components/ads/AdCampaignGenerateForm.tsx",
    ];
    for (const file of adsOwned) {
      assert.doesNotMatch(read(file), /services\/socialPlanner/);
      assert.doesNotMatch(read(file), /lib\/socialPlanner/);
    }
    const briefType = read("services/ads/adCampaignTypes.ts");
    const briefSlice = briefType.slice(
      briefType.indexOf("export type AdCampaignBrief"),
      briefType.indexOf("export type AdCampaignBriefMode"),
    );
    assert.doesNotMatch(briefSlice, /targetPersonaId|personaId/);
  });
});
