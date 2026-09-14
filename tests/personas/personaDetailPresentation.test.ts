import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { StrategicAssetBlueprint } from "../../components/assetBlueprints/StrategicAssetBlueprint";
import { DeploymentAssets } from "../../components/deployment/DeploymentAssets";
import { PersonaAudienceJourney } from "../../components/personas/PersonaAudienceJourney";
import { PersonaConfidenceScore } from "../../components/personas/PersonaConfidenceScore";
import { PersonaDetailHeader } from "../../components/personas/PersonaDetailHeader";
import { AthenaCollapsibleSection } from "../../components/ui/AthenaCollapsibleSection";
import { groupDeploymentOutreachAssets } from "../../lib/deployment/deploymentAssetGroups";
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "../../lib/personaDeploymentAssetContract";
import { getPersonaPublishableDeploymentCatalogKeys } from "../../lib/personaIntelligenceAssetCatalog";
import { groupProspectOutreachAssets } from "../../lib/prospects/prospectOutreachAssetGroups";
import {
  PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN,
  PERSONA_DETAIL_COLLAPSIBLE_SECTIONS,
  PERSONA_DETAIL_SECTION_ORDER,
  PERSONA_HOW_TO_REACH_FIELDS,
  PERSONA_JOURNEY_ANALYSIS_KEYS,
  PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS,
  buildPersonaJourneyChrome,
  groupPersonaJourneyAssets,
  presentPersonaFieldGroup,
} from "../../lib/personas/personaDetailPresentation";
import { AUDIENCE_ANALYSIS_SECTION_DEFS } from "../../lib/personas/audienceAnalysisSections";
import { en } from "../../lib/tenantI18n/messages/en";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { es } from "../../lib/tenantI18n/messages/es";
import { de } from "../../lib/tenantI18n/messages/de";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import type { Persona } from "../../services/personas/personaService";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "persona-1",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    organization_id: "org-1",
    user_id: null,
    community_id: null,
    linked_discussion_id: "disc-1",
    persona_name: "Boutique Buyer",
    short_description: "Discerning local shopper",
    category: "Retail",
    gender_identity: null,
    age_range: "35-50",
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: "France",
    state: null,
    city: "Lyon",
    location_summary: null,
    languages: "French, English",
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: "Creative director",
    seniority: "Senior",
    industry_context: "Fashion",
    lifestyle: null,
    interests: "Craft, quality",
    digital_behavior: null,
    brands_influences: null,
    values_text: "Authenticity",
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: "Find trusted local makers",
    needs: "Proof of quality",
    pain_points: "Generic mass-market noise",
    fears: "Wasting budget",
    motivations: "Belonging",
    objections: "Too expensive",
    buying_triggers: "Peer recommendation",
    decision_criteria: "Craft evidence",
    purchase_behavior: null,
    typical_concerns: "Will it last?",
    communication_style: "Direct, warm",
    preferred_channels: "Instagram, email",
    reference_website: "https://example.com",
    notes: null,
    additional_context: "Shops in person first",
    ads_content: "Quiet luxury campaign",
    source: "manual",
    status: "Ready",
    lifecycle_status: "in_use",
    opportunity_score: null,
    priority: 0,
    profile_json: null,
    raw_json: null,
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    ...overrides,
  };
}

function sampleAnalysis(): DiscussionAnalysis {
  return {
    id: "analysis-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    discussion_id: "disc-1",
    organization_id: "org-1",
    user_id: null,
    community_id: null,
    status: "review_ready",
    summary: "This audience wants proof before they buy.",
    sentiment: "neutral",
    intent: "high",
    buyer_stage: "consideration",
    pain_points: "Generic mass-market noise",
    opportunity_detected: true,
    opportunity_title: "Quiet luxury",
    opportunity_reason: "Local craft signal",
    recommended_action: "Lead with maker evidence, then invite a visit.",
    suggested_cta: "",
    risk_level: "medium",
    confidence: 90,
    strategy_key: "elevate",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: "claude-sonnet-4",
    generation_time_ms: 12000,
    raw_json: null,
  };
}

const analysisAssets = REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.map((key) => ({
  assetKey: key.toLowerCase(),
  title: key.replace(/_/g, " "),
  objective: "Strategic analysis",
  content: `Body for ${key}`,
}));

const publishableAssets = getPersonaPublishableDeploymentCatalogKeys().map(
  (key) => ({
    assetKey: key.toLowerCase(),
    title: key.replace(/_/g, " "),
    objective: "Publishable asset",
    content: `Body for ${key}`,
  }),
);

describe("persona Phase-1 detail presentation", () => {
  it("locks the approved section order and 14/26 catalogs", () => {
    assert.deepEqual([...PERSONA_DETAIL_SECTION_ORDER], [
      "header",
      "executive-snapshot",
      "athena-recommendation",
      "who-they-are",
      "what-they-care-about",
      "what-gets-in-the-way",
      "how-to-reach-them",
      "strategic-creation",
      "other-drafts",
      "ready-to-use-assets",
      "strategic-asset-blueprint",
      "evidence-signals",
      "advanced",
    ]);
    assert.equal(AUDIENCE_ANALYSIS_SECTION_DEFS.length, 14);
    assert.deepEqual(
      [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS].sort(),
      [...AUDIENCE_ANALYSIS_SECTION_DEFS.map((item) => item.key)].sort(),
    );
    assert.equal(getPersonaPublishableDeploymentCatalogKeys().length, 26);
    assert.ok(
      !PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS.includes("VALUE_PROPOSITION" as never),
    );
    assert.ok(PERSONA_JOURNEY_ANALYSIS_KEYS.reach.includes("VALUE_PROPOSITION"));
    assert.ok(
      !PERSONA_JOURNEY_ANALYSIS_KEYS.who.includes("VALUE_PROPOSITION"),
    );
  });

  it("renders the Phase-1 journey with confidence ring and honest sources", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    const html = renderToStaticMarkup(
      createElement(PersonaAudienceJourney, {
        persona: samplePersona(),
        analysis: sampleAnalysis(),
        analysisAssets,
        deploymentAssets: publishableAssets,
        chrome,
        messages: en.personas,
        profileEditor: createElement("div", {
          "data-persona-profile-editor": "true",
        }),
        previousIntelligence: createElement("div", {
          "data-persona-previous-intelligence": "true",
        }),
        evidenceExtra: createElement("div", null, "Quiet luxury campaign"),
        blueprint: createElement("div", { "data-persona-blueprint": "true" }),
      }),
    );
    const journey = read("components/personas/PersonaAudienceJourney.tsx");

    assert.match(html, /data-persona-journey="executive-snapshot"/);
    assert.match(html, /data-persona-journey="athena-recommendation"/);
    assert.match(html, /data-persona-journey="who-they-are"/);
    assert.match(html, /data-persona-journey="what-they-care-about"/);
    assert.match(html, /data-persona-journey="what-gets-in-the-way"/);
    assert.match(html, /data-persona-journey="how-to-reach-them"/);
    assert.match(html, /data-persona-journey="strategic-creation"/);
    assert.match(html, /data-persona-journey="other-drafts"/);
    assert.match(html, /data-persona-journey="ready-to-use-assets"/);
    assert.match(html, /data-persona-journey="strategic-asset-blueprint"/);
    assert.match(html, /data-persona-journey="evidence-signals"/);
    assert.match(html, /data-persona-journey="advanced"/);
    assert.doesNotMatch(html, /data-persona-journey="what-to-create"/);
    assert.doesNotMatch(html, /What to create for this audience/);
    assert.doesNotMatch(html, /href="\/ads\/new"/);
    assert.doesNotMatch(html, /href="\/social-planner"/);
    assert.match(html, /data-persona-confidence="ring"/);
    assert.match(html, /90%/);
    assert.match(html, />High</);
    assert.doesNotMatch(html, /bg-\[var\(--athena-orange\)\].*width: `\$\{confidence\}%`/);
    assert.match(html, /Lead with maker evidence, then invite a visit/);
    assert.doesNotMatch(
      html.slice(
        html.indexOf("data-persona-recommendation"),
        html.indexOf("data-persona-journey=\"who-they-are\""),
      ),
      /Worth pursuing|Respond within 12 hours/,
    );
    assert.match(journey, /data-persona-care-source="stored-profile"/);
    assert.match(journey, /data-persona-analysis-key="PERSONA_EXECUTIVE_PROFILE"/);
    assert.match(journey, /data-persona-analysis-key="OBJECTION_HANDLING"/);
    assert.match(journey, /group.id === "value"\s*\?\s*"VALUE_PROPOSITION"/);
    assert.match(journey, /group.id === "messaging"\s*\?\s*"MESSAGING_FRAMEWORK"/);
    assert.match(html, /Who they are/);
    assert.match(html, /Strategic creation guidance/);
    assert.match(html, /Other drafts/);
    assert.match(html, /Ready-to-use assets/);
    assert.match(html, /data-persona-blueprint="true"/);
    const careSlice = html.slice(
      html.indexOf("data-persona-journey=\"what-they-care-about\""),
      html.indexOf("data-persona-journey=\"what-gets-in-the-way\""),
    );
    assert.doesNotMatch(careSlice, /VALUE_PROPOSITION|Value Proposition/);
    const journeyKeys = [
      ...PERSONA_JOURNEY_ANALYSIS_KEYS.who,
      ...PERSONA_JOURNEY_ANALYSIS_KEYS.friction,
      ...PERSONA_JOURNEY_ANALYSIS_KEYS.reach,
      ...PERSONA_JOURNEY_ANALYSIS_KEYS.create,
    ];
    assert.deepEqual(
      [...journeyKeys].sort(),
      [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS].sort(),
    );
    const grouped = groupPersonaJourneyAssets(analysisAssets);
    assert.equal(
      grouped.who.length +
        grouped.friction.length +
        grouped.reach.length +
        grouped.create.length,
      14,
    );
    assert.equal(publishableAssets.length, 26);
    assert.match(journey, /variant="embedded"/);
    assert.doesNotMatch(html, />Deployment Assets</);
    assert.equal(
      (html.match(/Ready-to-use content generated from Athena/g) ?? []).length,
      0,
    );
  });

  it("uses the same confidence value and band as the list ring", () => {
    const list = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 90,
        messages: en.personas,
      }),
    );
    const detail = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 90,
        messages: en.personas,
        size: "detail",
      }),
    );
    assert.match(list, /90%/);
    assert.match(list, /High/);
    assert.match(detail, /90%/);
    assert.match(detail, /High/);
    assert.match(detail, /data-persona-confidence-size="detail"/);
  });

  it("groups stored care-about fields without VALUE_PROPOSITION", () => {
    const fields = presentPersonaFieldGroup(
      samplePersona(),
      PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS,
      { goals: "Goals", needs: "Needs", values_text: "Values", motivations: "Motivations", interests: "Interests" },
    );
    assert.deepEqual(
      fields.map((field) => field.key),
      ["goals", "needs", "values_text", "motivations", "interests"],
    );
    const grouped = groupPersonaJourneyAssets(analysisAssets);
    assert.equal(grouped.who.length, 1);
    assert.equal(grouped.friction.length, 1);
    assert.ok(grouped.reach.some((asset) => /value/i.test(asset.assetKey ?? "")));
    assert.equal(grouped.create.length, 7);
    assert.ok(PERSONA_HOW_TO_REACH_FIELDS.includes("decision_criteria"));
  });

  it("keeps header Discuss/observation, ads/social, and Ask Athena wiring", () => {
    const page = read("app/personas/[id]/page.tsx");
    const header = read("components/personas/PersonaDetailHeader.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    const generate = read(
      "components/personas/PersonaGenerateIntelligenceButton.tsx",
    );
    const lifecycle = read(
      "components/personas/PersonaLifecycleStatusControl.tsx",
    );
    const deleteButton = read(
      "components/personas/PersonaHeaderDeleteButton.tsx",
    );
    assert.match(page, /PersonaDetailHeader/);
    assert.match(page, /PersonaAudienceJourney/);
    assert.match(page, /PersonaMetadataEditor/);
    assert.match(page, /PersonaConversationPanel/);
    assert.match(page, /PersonaAppendInteraction/);
    assert.match(page, /href=\{`\/ads\/new\?personaId=\$\{persona\.id\}`\}/);
    assert.match(page, /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/);
    assert.match(page, /data-persona-header-action="create-advertising"/);
    assert.match(page, /data-persona-header-action="plan-social"/);
    assert.doesNotMatch(page, /data-persona-traction-next/);
    assert.doesNotMatch(page, /personaCrossLinks/);
    assert.match(header, /Discuss with Athena|discussLabel/);
    assert.match(header, /observationLabel/);
    assert.doesNotMatch(header, /teachLabel/);
    assert.match(header, /PERSONA_DETAIL_ANCHORS.conversation/);
    assert.match(header, /PERSONA_DETAIL_ANCHORS.observation/);
    assert.match(header, /PERSONA_TEACH_EVENT/);
    assert.match(header, /name="intelligence"/);
    assert.match(header, /name="audience-tools"/);
    assert.match(header, /name="utility"/);
    assert.match(header, /name="destructive"/);
    assert.match(header, /data-persona-header-actions=\{name\}/);
    assert.doesNotMatch(header, /data-persona-header-actions="primary"/);
    assert.doesNotMatch(header, /data-persona-header-actions="secondary"/);
    assert.match(workspace, /sourceKind === "persona"/);
    assert.match(workspace, /PersonaAudienceJourney/);
    assert.match(workspace, /personaJourneyChrome\.strategicAssetBlueprint/);
    assert.doesNotMatch(workspace, /Persona Strategic Blueprint/);
    assert.match(workspace, /onDiscussWithAthena=\{handleDiscussWithAthena\}/);
    assert.match(workspace, /variant="embedded"/);
    assert.match(journey, /data-persona-journey="what-they-care-about"/);
    assert.match(deployment, /variant === "embedded"/);
    assert.match(deployment, /hideGalleryChrome/);
    const discussionDefault = deployment.slice(
      deployment.indexOf('variant = "gallery"'),
    );
    assert.match(discussionDefault, /Deployment Assets/);
    assert.match(generate, /data-persona-header-action="generate"/);
    assert.match(generate, /data-persona-header-action="refresh"/);
    assert.match(generate, /data-persona-header-action="think-differently"/);
    assert.match(generate, /\/api\/personas\/\$\{personaId\}\/refresh/);
    assert.match(generate, /\/api\/personas\/\$\{personaId\}\/think-differently/);
    assert.match(generate, /PERSONA_HEADER_REFRESH_CLASS/);
    assert.match(generate, /PERSONA_HEADER_ALTERNATIVE_CLASS/);
    assert.doesNotMatch(
      generate,
      /bg-\[var\(--athena-orange\)\] px-6 py-3 text-sm font-semibold text-white shadow-lg/,
    );
    assert.match(lifecycle, /\/api\/personas\/\$\{persona.id\}\/lifecycle/);
    assert.match(lifecycle, /data-persona-header-action="lifecycle"/);
    assert.match(deleteButton, /ConfirmDeleteControl/);
    assert.match(deleteButton, /\/api\/personas\/\$\{personaId\}/);
  });

  it("renders Add observation, not Teach Athena, and keeps observation targeting", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    assert.equal(chrome.addObservation, en.personas.append.cta);
    assert.equal(chrome.addObservation, "Add observation");
    assert.notEqual(chrome.addObservation, "Teach Athena");
    const html = renderToStaticMarkup(
      createElement(PersonaDetailHeader, {
        backLabel: "Back",
        eyebrow: "Audience",
        title: "Boutique Buyer",
        intelligenceLabel: "Ready",
        intelligenceStatus: "Ready",
        discussLabel: chrome.discussWithAthena,
        observationLabel: chrome.addObservation,
        intelligenceGroupLabel: chrome.intelligenceGroup,
        audienceToolsGroupLabel: chrome.audienceToolsGroup,
        intelligenceActions: createElement("button", {
          "data-persona-header-action": "refresh",
        }, "Refresh intelligence"),
        audienceToolsActions: createElement("a", {
          href: "/ads/new",
          "data-persona-header-action": "create-advertising",
        }, chrome.createAdvertising),
        utilityActions: createElement("div", {
          "data-persona-header-action": "lifecycle",
        }, "Working status"),
        destructiveAction: createElement("button", null, "Delete"),
      }),
    );
    assert.match(html, /Add observation/);
    assert.doesNotMatch(html, /Teach Athena/);
    assert.match(html, /Discuss with Athena/);
    assert.match(html, /data-persona-header-action="discuss"/);
    assert.match(html, /data-persona-header-action="observation"/);
    assert.match(html, /data-persona-header-actions="intelligence"/);
    assert.match(html, /data-persona-header-actions="audience-tools"/);
    assert.doesNotMatch(html, /data-persona-header-actions="primary"/);
    assert.doesNotMatch(html, /data-persona-header-actions="secondary"/);
    const header = read("components/personas/PersonaDetailHeader.tsx");
    assert.match(header, /PERSONA_DETAIL_ANCHORS.observation/);
    assert.match(header, /PERSONA_DETAIL_ANCHORS.observationField/);
    const append = read("components/personas/PersonaAppendInteraction.tsx");
    assert.match(append, /PERSONA_TEACH_EVENT/);
    assert.match(append, /PERSONA_DETAIL_ANCHORS.observationField/);
  });

  it("persona asset cards hide nested Deployment Assets chrome and keep catalogs reachable", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    const html = renderToStaticMarkup(
      createElement(PersonaAudienceJourney, {
        persona: samplePersona(),
        analysis: sampleAnalysis(),
        analysisAssets,
        deploymentAssets: publishableAssets,
        chrome,
        messages: en.personas,
        profileEditor: createElement("div", {
          "data-persona-profile-editor": "true",
        }),
        previousIntelligence: createElement("div", {
          "data-persona-previous-intelligence": "true",
        }),
        evidenceExtra: createElement("div", null, "Quiet luxury campaign"),
        blueprint: createElement("div", { "data-persona-blueprint": "true" }),
      }),
    );
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    assert.match(journey, /data-persona-analysis-key="PERSONA_EXECUTIVE_PROFILE"/);
    assert.match(journey, /data-persona-analysis-key="OBJECTION_HANDLING"/);
    assert.match(journey, /group.id === "value"\s*\?\s*"VALUE_PROPOSITION"/);
    assert.match(journey, /group.id === "messaging"\s*\?\s*"MESSAGING_FRAMEWORK"/);
    assert.match(journey, /group.id === "tone"\s*\?\s*"LANGUAGE_AND_TONE_GUIDE"/);
    assert.match(journey, /group.id === "channels"\s*\?\s*"CHANNEL_STRATEGY"/);
    assert.match(journey, /"OFFER_POSITIONING"/);
    assert.match(journey, /data-persona-create-group="strategic"/);
    assert.match(journey, /data-persona-create-group="other-drafts"/);
    assert.match(journey, /data-persona-create-group="publishable"/);
    assert.match(journey, /data-persona-create-group="blueprint"/);
    assert.match(journey, /data-persona-other-drafts-count=\{otherDrafts.length\}/);
    assert.match(journey, /data-persona-publishable-count=\{readyToUseAssets.length\}/);
    assert.equal(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.length, 14);
    assert.equal(getPersonaPublishableDeploymentCatalogKeys().length, 26);
    assert.equal(groupPersonaJourneyAssets(analysisAssets).create.length, 7);
    assert.equal(publishableAssets.length, 26);
    assert.match(journey, /cardPresentation: "persona"/);
    assert.doesNotMatch(html, />Deployment Assets</);
    assert.doesNotMatch(html, /Ready-to-use content generated from Athena/);
    assert.doesNotMatch(html, /data-deployment-chrome="gallery"/);
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /presentation = "default"/);
    assert.match(block, /isOpen \? "▲" : "▼"/);
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /variant = "gallery"/);
    assert.match(blueprint, /Strategic Asset Blueprint/);
  });

  it("adds journey labels in all six locales without resurrecting list Persona chrome", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt };
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      const chrome = buildPersonaJourneyChrome(dictionary.personas);
      assert.ok(dictionary.personas.journey.whoTheyAre, language);
      assert.ok(dictionary.personas.journey.whatTheyCareAbout, language);
      assert.ok(dictionary.personas.journey.teachAthena, language);
      assert.ok(dictionary.personas.journey.discussWithAthena, language);
      assert.ok(dictionary.personas.journey.intelligence, language);
      assert.ok(dictionary.personas.journey.audienceTools, language);
      assert.ok(dictionary.personas.journey.otherDrafts, language);
      assert.ok(dictionary.personas.journey.strategicAssetBlueprint, language);
      assert.equal(chrome.addObservation, dictionary.personas.append.cta, language);
      assert.equal(
        chrome.createAdvertising,
        dictionary.personas.traction.createAdvertising,
        language,
      );
      assert.equal(
        chrome.planSocial,
        dictionary.personas.traction.planSocial,
        language,
      );
      assert.doesNotMatch(chrome.addObservation, /Teach Athena|Enseigner à Athena|Enseñar a Athena|Insegna ad Athena|Athena unterrichten|Ensinar a Athena/);
      assert.notEqual(dictionary.personas.list.createCta, "Create persona");
    }
    assert.equal(en.personas.traction.createAdvertising, "Create advertising");
    assert.equal(en.personas.traction.planSocial, "Plan a week of social content");
    assert.equal(en.personas.journey.whatToCreate, "What to create for this audience");
    assert.equal(en.personas.journey.otherDrafts, "Other drafts");
    assert.equal(
      en.personas.journey.strategicAssetBlueprint,
      "Strategic Asset Blueprint",
    );
    assert.notEqual(fr.personas.journey.whoTheyAre, en.personas.journey.whoTheyAre);
    assert.equal(en.personas.executive.deploymentAssetsTitle, "Ready-to-use assets");
    assert.equal(en.personas.append.cta, "Add observation");
    assert.equal(fr.personas.append.cta, "Ajouter une observation");
    assert.equal(es.personas.append.cta, "Añadir observación");
    assert.equal(itMessages.personas.append.cta, "Aggiungi osservazione");
    assert.equal(de.personas.append.cta, "Beobachtung hinzufügen");
    assert.equal(pt.personas.append.cta, "Adicionar observação");
  });
});

const CANONICAL_OTHER_KEYS = [
  "newsletter_idea",
  "blog_post_idea",
  "knowledge_base_enhancement",
  "hidden_gems",
  "substack_post",
  "substack_note",
  "reddit_post",
  "skool_post",
  "skool_course_idea",
  "social_voice_post",
  "social_post",
  "short_video_prompt",
  "visual_message_prompt",
  "local_outreach_image_prompt",
  "community_reply",
  "private_message",
  "follow_up",
  "call_to_action",
] as const;

const CANONICAL_OUTREACH_KEYS = [
  "personalized_outreach_email",
  "follow_up_email",
  "linkedin_connection",
  "linkedin_follow_up",
  "cold_call_opening",
  "discovery_questions",
  "personalized_value_proposition",
  "objection_anticipation",
  "meeting_preparation",
  "recommended_cta",
  "follow_up_sequence",
  "personalized_video_script",
  "whatsapp_outreach",
] as const;

function sampleBlueprint(): AthenaAssetBlueprint {
  return {
    id: "bp-persona-1",
    user_id: null,
    discussion_id: "disc-1",
    opportunity_id: null,
    briefing_id: null,
    asset_title: "Quiet luxury maker story",
    asset_type: "image",
    business_goal: "Invite a studio visit",
    target_audience: "Boutique buyers",
    priority: "high",
    estimated_reuse: 4,
    image_prompt: "Warm atelier light",
    pdf_prompt: "One-page maker brief",
    social_prompt: "Short craft proof",
    trend_social_prompt: "Trend craft reel",
    notes: "Lead with evidence",
    status: "ready",
    raw_json: null,
    created_at: "2026-08-20T15:10:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
  };
}

function renderJourney(overrides: Record<string, unknown> = {}) {
  const chrome = buildPersonaJourneyChrome(en.personas);
  return renderToStaticMarkup(
    createElement(PersonaAudienceJourney, {
      persona: samplePersona(),
      analysis: sampleAnalysis(),
      analysisAssets,
      deploymentAssets: publishableAssets,
      chrome,
      messages: en.personas,
      profileEditor: createElement("div", {
        "data-persona-profile-editor": "true",
      }),
      previousIntelligence: createElement("div", {
        "data-persona-previous-intelligence": "true",
      }),
      evidenceExtra: createElement("div", null, "Quiet luxury campaign"),
      blueprint: createElement(
        "section",
        { "data-persona-blueprint": "true" },
        chrome.strategicAssetBlueprint,
      ),
      ...overrides,
    }),
  );
}

describe("persona asset findability parity", () => {
  it("groups Other drafts with the canonical helper and does not duplicate cards", () => {
    assert.equal(groupProspectOutreachAssets, groupDeploymentOutreachAssets);
    const grouped = groupDeploymentOutreachAssets(publishableAssets);
    const otherKeys = grouped.other.map((asset) => asset.assetKey);
    const readyKeys = grouped.outreach.map((asset) => asset.assetKey);

    for (const key of CANONICAL_OTHER_KEYS) {
      const asset = {
        assetKey: key,
        title: key,
        objective: "Other",
        content: `Body for ${key}`,
      };
      const classified = groupDeploymentOutreachAssets([asset]);
      assert.equal(classified.other.length, 1, key);
      assert.equal(classified.outreach.length, 0, key);
    }
    for (const key of CANONICAL_OUTREACH_KEYS) {
      const asset = {
        assetKey: key,
        title: key,
        objective: "Outreach",
        content: `Body for ${key}`,
      };
      const classified = groupDeploymentOutreachAssets([asset]);
      assert.equal(classified.outreach.length, 1, key);
      assert.equal(classified.other.length, 0, key);
    }

    assert.ok(otherKeys.includes("newsletter_idea"));
    assert.ok(otherKeys.includes("local_outreach_image_prompt"));
    assert.ok(!otherKeys.includes("personalized_outreach_email"));
    assert.ok(readyKeys.includes("personalized_outreach_email"));
    assert.ok(readyKeys.includes("whatsapp_outreach"));
    assert.equal(
      grouped.other.length + grouped.outreach.length,
      publishableAssets.length,
    );
    for (const key of otherKeys) {
      assert.ok(!readyKeys.includes(key), key);
    }

    const leftover = groupDeploymentOutreachAssets([
      {
        assetKey: "unknown_leftover_draft",
        title: "Unknown leftover draft",
        objective: "Unknown",
        content: "Keep this in Other",
      },
    ]);
    assert.equal(leftover.other.length, 1);
    assert.equal(leftover.outreach.length, 0);
  });

  it("renders Other drafts heading and cards without an Outreach drafts section", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    const grouped = groupDeploymentOutreachAssets(publishableAssets);
    const html = renderJourney();
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );

    assert.equal(chrome.otherDrafts, "Other drafts");
    assert.doesNotMatch(html, /What to create for this audience/);
    assert.match(html, /Strategic creation guidance/);
    assert.match(html, /Other drafts/);
    assert.match(html, /Ready-to-use assets/);
    const otherHeading = renderToStaticMarkup(
      createElement(
        AthenaCollapsibleSection,
        { title: chrome.otherDrafts, defaultOpen: false },
        createElement(DeploymentAssets, {
          assets: grouped.other,
          variant: "embedded",
          chrome: { heading: chrome.otherDrafts, hideGalleryChrome: true },
        }),
      ),
    );
    assert.match(otherHeading, />Other drafts</);

    const otherCardsOpen = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: grouped.other,
        variant: "embedded",
        chrome: { heading: chrome.otherDrafts, hideGalleryChrome: true },
      }),
    );
    assert.match(otherCardsOpen, /newsletter idea/i);
    assert.match(otherCardsOpen, /blog post idea/i);
    assert.match(otherCardsOpen, /local outreach image prompt/i);
    assert.doesNotMatch(otherCardsOpen, /Personalized Outreach Email/i);

    const readyCards = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: grouped.outreach,
        variant: "embedded",
        chrome: { heading: chrome.readyToUseAssets, hideGalleryChrome: true },
      }),
    );
    assert.match(readyCards, /personalized outreach email/i);
    assert.doesNotMatch(readyCards, /newsletter idea/i);
    assert.doesNotMatch(readyCards, /local outreach image prompt/i);

    assert.match(journey, /title=\{chrome\.otherDrafts\}/);
    assert.match(journey, /assets=\{otherDrafts\}/);
    assert.match(journey, /assets=\{readyToUseAssets\}/);
    assert.doesNotMatch(journey, /assets=\{deploymentAssets\}/);
    assert.doesNotMatch(html, /Outreach drafts/);
    assert.doesNotMatch(journey, /Outreach drafts/);
    assert.doesNotMatch(journey, /outreachDrafts/);
    assert.doesNotMatch(journey, /sectionOutreach/);
    assert.doesNotMatch(journey, /prospects\.convert/);
    const populatedPersona = workspace.slice(
      workspace.indexOf("deploymentAssets={deploymentAssets}"),
    );
    assert.doesNotMatch(
      populatedPersona.slice(0, populatedPersona.indexOf("previousIntelligence=")),
      /outreachDrafts/,
    );
  });

  it("exposes the existing Persona blueprint as Strategic Asset Blueprint once", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const blueprintHtml = renderToStaticMarkup(
      createElement(
        AthenaCollapsibleSection,
        {
          title: chrome.strategicAssetBlueprint,
          defaultOpen: true,
        },
        createElement(StrategicAssetBlueprint, {
          blueprint: sampleBlueprint(),
          variant: "embedded",
        }),
      ),
    );

    assert.equal(chrome.strategicAssetBlueprint, "Strategic Asset Blueprint");
    assert.match(blueprintHtml, />Strategic Asset Blueprint</);
    assert.equal(
      (blueprintHtml.match(/Strategic Asset Blueprint/g) ?? []).length,
      1,
    );
    assert.match(blueprintHtml, /Quiet luxury maker story/);
    assert.match(workspace, /personaJourneyChrome\.strategicAssetBlueprint/);
    assert.match(workspace, /viewModel\.blueprint/);
    assert.match(journey, /data-persona-create-group="blueprint"/);

    const populatedStart = workspace.indexOf(
      "deploymentAssets={deploymentAssets}",
    );
    const personaBlueprintBlock = workspace.slice(
      workspace.indexOf("blueprint={", populatedStart),
      workspace.indexOf("previousIntelligence=", populatedStart),
    );
    assert.equal(
      (personaBlueprintBlock.match(/<StrategicAssetBlueprint/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(workspace, /Persona Strategic Blueprint/);
    assert.doesNotMatch(journey, /ProspectIntelligenceSections/);
    assert.doesNotMatch(journey, /sourceKind="prospect"/);
  });

  it("keeps Other drafts and the blueprint bound to the selected Executive Version", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const current = groupDeploymentOutreachAssets(publishableAssets);
    const historical = groupDeploymentOutreachAssets(
      publishableAssets.filter((asset) => asset.assetKey !== "newsletter_idea"),
    );
    assert.ok(current.other.some((asset) => asset.assetKey === "newsletter_idea"));
    assert.ok(
      !historical.other.some((asset) => asset.assetKey === "newsletter_idea"),
    );

    assert.match(workspace, /const deploymentAssets = viewModel.deploymentAssets/);
    assert.match(workspace, /deploymentAssets=\{deploymentAssets\}/);
    assert.match(workspace, /viewModel\.blueprint/);
    assert.match(journey, /executiveVersionId=\{executiveVersionId\}/);
    assert.match(journey, /assets=\{otherDrafts\}/);
    assert.doesNotMatch(journey, /raw_json\.prospect_id/);
    assert.doesNotMatch(journey, /\/prospects\//);
    assert.doesNotMatch(journey, /ProspectIntelligenceSections/);
  });

  it("does not require generation or worker changes for the V15 26+14 package", () => {
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.equal(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.length, 14);
    assert.equal(getPersonaPublishableDeploymentCatalogKeys().length, 26);
    assert.doesNotMatch(
      journey,
      /generationJobExecutor|deploymentAssetsWorkflow|requirePersonaCompleteness|requireProspectCompleteness|generateAssetBlueprint/,
    );
    assert.doesNotMatch(
      workspace,
      /generationJobExecutor|deploymentAssetsWorkflow|requirePersonaCompleteness/,
    );
  });

  it("uses Persona journey labels in all six locales without prospects.convert", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt };
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const presentation = read("lib/personas/personaDetailPresentation.ts");
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      const chrome = buildPersonaJourneyChrome(dictionary.personas);
      assert.ok(chrome.otherDrafts, language);
      assert.ok(chrome.strategicAssetBlueprint, language);
      assert.notEqual(chrome.otherDrafts, "", language);
      assert.notEqual(chrome.strategicAssetBlueprint, "", language);
    }
    assert.equal(en.personas.journey.otherDrafts, "Other drafts");
    assert.equal(
      en.personas.journey.strategicAssetBlueprint,
      "Strategic Asset Blueprint",
    );
    assert.notEqual(fr.personas.journey.otherDrafts, en.personas.journey.otherDrafts);
    assert.notEqual(
      fr.personas.journey.strategicAssetBlueprint,
      en.personas.journey.strategicAssetBlueprint,
    );
    assert.doesNotMatch(journey, /prospects\.convert/);
    assert.doesNotMatch(presentation, /prospects\.convert/);
  });
});

function renderPersonaHeader(overrides: Record<string, unknown> = {}) {
  const chrome = buildPersonaJourneyChrome(en.personas);
  return renderToStaticMarkup(
    createElement(PersonaDetailHeader, {
      backLabel: "Back",
      eyebrow: "Audience",
      title: "Boutique Buyer",
      intelligenceLabel: "Ready",
      intelligenceStatus: "Ready",
      discussLabel: chrome.discussWithAthena,
      observationLabel: chrome.addObservation,
      intelligenceGroupLabel: chrome.intelligenceGroup,
      audienceToolsGroupLabel: chrome.audienceToolsGroup,
      intelligenceActions: createElement(
        "span",
        null,
        createElement(
          "button",
          { "data-persona-header-action": "refresh" },
          "Refresh intelligence",
        ),
        createElement(
          "button",
          { "data-persona-header-action": "think-differently" },
          "Try another approach",
        ),
      ),
      audienceToolsActions: createElement(
        "span",
        null,
        createElement(
          "a",
          {
            href: "/ads/new",
            "data-persona-header-action": "create-advertising",
          },
          chrome.createAdvertising,
        ),
        createElement(
          "a",
          {
            href: "/social-planner",
            "data-persona-header-action": "plan-social",
          },
          chrome.planSocial,
        ),
      ),
      utilityActions: createElement(
        "div",
        { "data-persona-header-action": "lifecycle" },
        "Working status",
      ),
      destructiveAction: createElement("button", null, "Delete"),
      ...overrides,
    }),
  );
}

describe("persona detail CTA hierarchy and collapse defaults", () => {
  it("places intelligence and audience-tool actions in two header groups", () => {
    const chrome = buildPersonaJourneyChrome(en.personas);
    const html = renderPersonaHeader();
    const intelligence = html.slice(
      html.indexOf('data-persona-header-actions="intelligence"'),
      html.indexOf('data-persona-header-actions="audience-tools"'),
    );
    const tools = html.slice(
      html.indexOf('data-persona-header-actions="audience-tools"'),
      html.indexOf('data-persona-header-actions="utility"'),
    );
    const utility = html.slice(
      html.indexOf('data-persona-header-actions="utility"'),
      html.indexOf('data-persona-header-actions="destructive"'),
    );

    assert.match(html, new RegExp(chrome.intelligenceGroup));
    assert.match(html, new RegExp(chrome.audienceToolsGroup));
    assert.equal(chrome.intelligenceGroup, "Intelligence");
    assert.equal(chrome.audienceToolsGroup, "Audience tools");
    assert.match(intelligence, /data-persona-header-action="discuss"/);
    assert.match(intelligence, /Discuss with Athena/);
    assert.match(intelligence, /data-persona-header-action="observation"/);
    assert.match(intelligence, /Add observation/);
    assert.match(intelligence, /data-persona-header-action="refresh"/);
    assert.match(intelligence, /Refresh intelligence/);
    assert.match(intelligence, /data-persona-header-action="think-differently"/);
    assert.match(intelligence, /Try another approach/);
    assert.doesNotMatch(intelligence, /create-advertising|plan-social|lifecycle/);
    assert.match(tools, /data-persona-header-action="create-advertising"/);
    assert.match(tools, /Create advertising/);
    assert.match(tools, /data-persona-header-action="plan-social"/);
    assert.match(tools, /Plan a week of social content/);
    assert.match(tools, /href="\/ads\/new"/);
    assert.match(tools, /href="\/social-planner"/);
    assert.doesNotMatch(tools, /discuss|observation|refresh|think-differently|lifecycle/);
    assert.match(utility, /data-persona-header-action="lifecycle"/);
    assert.match(utility, /Working status/);
    assert.doesNotMatch(utility, /create-advertising|plan-social|discuss/);
    assert.doesNotMatch(html, /data-persona-header-actions="primary"/);
    assert.doesNotMatch(html, /data-persona-header-actions="secondary"/);
    assert.match(
      read("components/personas/PersonaDetailHeader.tsx"),
      /PERSONA_CTA_GROUP_LABEL/,
    );
    const pageSource = read("app/personas/[id]/page.tsx");
    const createAdvertisingSource = pageSource.slice(
      pageSource.indexOf('data-persona-header-action="create-advertising"'),
      pageSource.indexOf('data-persona-header-action="plan-social"'),
    );
    const planSocialSource = pageSource.slice(
      pageSource.indexOf('data-persona-header-action="plan-social"'),
      pageSource.indexOf("{journeyChrome.planSocial}"),
    );
    assert.match(createAdvertisingSource, /PERSONA_HEADER_CYAN_TOOL_CLASS/);
    assert.match(planSocialSource, /PERSONA_HEADER_VIOLET_TOOL_CLASS/);
    assert.doesNotMatch(createAdvertisingSource, /PERSONA_HEADER_PRIMARY_CLASS/);
    assert.doesNotMatch(planSocialSource, /PERSONA_HEADER_PRIMARY_CLASS/);
    assert.doesNotMatch(createAdvertisingSource, /PERSONA_HEADER_TOOL_CLASS/);
    assert.doesNotMatch(planSocialSource, /PERSONA_HEADER_TOOL_CLASS/);
  });

  it("removes the What to create CTA wrapper without duplicating execution CTAs", () => {
    const html = renderJourney();
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const page = read("app/personas/[id]/page.tsx");
    const header = renderPersonaHeader();

    assert.doesNotMatch(html, /What to create for this audience/);
    assert.doesNotMatch(html, /data-persona-traction-next/);
    assert.doesNotMatch(html, /href="\/ads\/new"/);
    assert.doesNotMatch(html, /href="\/social-planner"/);
    assert.doesNotMatch(html, /Athena considers your business and audience intelligence/);
    assert.doesNotMatch(journey, /chrome\.whatToCreate/);
    assert.doesNotMatch(journey, /\{crossLinks\}/);
    assert.equal((header.match(/create-advertising/g) ?? []).length, 1);
    assert.equal((header.match(/plan-social/g) ?? []).length, 1);
    assert.equal(
      (page.match(/href=\{`\/ads\/new\?personaId=\$\{persona\.id\}`\}/g) ?? [])
        .length,
      1,
    );
    assert.equal(
      (page.match(/href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/g) ?? [])
        .length,
      1,
    );
    assert.doesNotMatch(page, /href="\/social-planner"/);
    assert.match(html, /Strategic creation guidance/);
    assert.match(html, /Other drafts/);
    assert.match(html, /Ready-to-use assets/);
    assert.match(html, /data-persona-create-group="blueprint"/);
    assert.doesNotMatch(html, /Outreach drafts/);
  });

  it("defaults every canonical Persona Detail collapsible section closed", () => {
    assert.deepEqual([...PERSONA_DETAIL_COLLAPSIBLE_SECTIONS], [
      "who-they-are",
      "what-they-care-about",
      "what-gets-in-the-way",
      "how-to-reach-them",
      "strategic-creation",
      "other-drafts",
      "ready-to-use-assets",
      "strategic-asset-blueprint",
      "evidence-signals",
      "advanced",
      "ask-athena",
      "add-observation",
    ]);
    for (const section of PERSONA_DETAIL_COLLAPSIBLE_SECTIONS) {
      assert.equal(
        PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN[section],
        false,
        section,
      );
    }

    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    const snapshot = read("components/personas/PersonaExecutiveSnapshot.tsx");
    const recommendation = read(
      "components/personas/PersonaAthenaRecommendation.tsx",
    );
    const conversation = read("components/personas/PersonaConversationPanel.tsx");
    const observation = read("components/personas/PersonaAppendInteraction.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const prospectSections = read(
      "components/prospects/ProspectIntelligenceSections.tsx",
    );

    assert.match(
      journey,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["who-they-are"\]\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{\s*PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["what-they-care-about"\]\s*\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{\s*PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["what-gets-in-the-way"\]\s*\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["how-to-reach-them"\]\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{\s*PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["strategic-creation"\]\s*\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["other-drafts"\]\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{\s*PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["ready-to-use-assets"\]\s*\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["evidence-signals"\]\}/,
    );
    assert.match(
      journey,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\.advanced\}/,
    );
    assert.doesNotMatch(snapshot, /AthenaCollapsibleSection/);
    assert.doesNotMatch(recommendation, /AthenaCollapsibleSection/);
    assert.match(
      conversation,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["ask-athena"\]\}/,
    );
    assert.match(
      observation,
      /defaultOpen=\{PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\["add-observation"\]\}/,
    );
    assert.match(
      workspace,
      /PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN\[\s*"strategic-asset-blueprint"\s*\]/,
    );
    assert.match(prospectSections, /defaultOpen=\{false\}/);
    assert.doesNotMatch(
      prospectSections,
      /PERSONA_DETAIL_COLLAPSIBLE_DEFAULT_OPEN/,
    );
  });

  it("keeps Prospect CTA hierarchy, collapse behavior, and Create Audience intact", () => {
    const prospectHeader = read("components/prospects/ProspectDetailHeader.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    const prospectSections = read(
      "components/prospects/ProspectIntelligenceSections.tsx",
    );
    const prospectConversation = read(
      "components/prospects/ProspectConversationPanel.tsx",
    );
    assert.match(prospectHeader, /name="intelligence"/);
    assert.match(prospectHeader, /name="tools"/);
    assert.match(prospectHeader, /data-prospect-header-actions=\{name\}/);
    assert.match(prospectHeader, /intelligenceGroupLabel/);
    assert.match(prospectHeader, /prospectToolsLabel/);
    assert.match(prospectPage, /ProspectCreateAudienceButton/);
    assert.match(prospectPage, /createAudienceAction=/);
    assert.equal((prospectSections.match(/defaultOpen=\{false\}/g) ?? []).length, 5);
    assert.match(prospectConversation, /defaultOpen=\{false\}/);
    assert.doesNotMatch(prospectHeader, /PERSONA_DETAIL_COLLAPSIBLE/);
    assert.doesNotMatch(prospectPage, /audienceTools/);
  });

  it("localizes Intelligence and Audience tools in all six locales without Prospect keys", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt };
    const header = read("components/personas/PersonaDetailHeader.tsx");
    const presentation = read("lib/personas/personaDetailPresentation.ts");
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      const chrome = buildPersonaJourneyChrome(dictionary.personas);
      assert.ok(chrome.intelligenceGroup, language);
      assert.ok(chrome.audienceToolsGroup, language);
      assert.equal(
        chrome.intelligenceGroup,
        dictionary.personas.journey.intelligence,
        language,
      );
      assert.equal(
        chrome.audienceToolsGroup,
        dictionary.personas.journey.audienceTools,
        language,
      );
      assert.ok(dictionary.personas.journey.discussWithAthena, language);
      assert.ok(dictionary.personas.append.cta, language);
      assert.ok(dictionary.personas.detail.refreshIntelligence, language);
      assert.ok(dictionary.personas.detail.thinkDifferently, language);
      assert.ok(dictionary.personas.traction.createAdvertising, language);
      assert.ok(dictionary.personas.traction.planSocial, language);
    }
    assert.equal(en.personas.journey.intelligence, "Intelligence");
    assert.equal(en.personas.journey.audienceTools, "Audience tools");
    assert.notEqual(
      fr.personas.journey.audienceTools,
      en.personas.journey.audienceTools,
    );
    assert.doesNotMatch(header, /prospects\.detail/);
    assert.doesNotMatch(presentation, /prospects\.detail/);
    assert.doesNotMatch(presentation, /prospects\.convert/);
  });
});
