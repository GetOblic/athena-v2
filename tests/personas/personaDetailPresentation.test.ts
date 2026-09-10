import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { PersonaAudienceJourney } from "../../components/personas/PersonaAudienceJourney";
import { PersonaConfidenceScore } from "../../components/personas/PersonaConfidenceScore";
import { PersonaDetailHeader } from "../../components/personas/PersonaDetailHeader";
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "../../lib/personaDeploymentAssetContract";
import { getPersonaPublishableDeploymentCatalogKeys } from "../../lib/personaIntelligenceAssetCatalog";
import {
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
      "what-to-create",
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
        crossLinks: createElement("a", { href: "/ads/new" }, "Create advertising"),
        previousIntelligence: createElement("div", {
          "data-persona-previous-intelligence": "true",
        }),
        evidenceExtra: createElement("div", null, "Quiet luxury campaign"),
        blueprint: createElement("div", { "data-persona-blueprint": "true" }),
      }),
    );

    assert.match(html, /data-persona-journey="executive-snapshot"/);
    assert.match(html, /data-persona-journey="athena-recommendation"/);
    assert.match(html, /data-persona-journey="who-they-are"/);
    assert.match(html, /data-persona-journey="what-they-care-about"/);
    assert.match(html, /data-persona-journey="what-gets-in-the-way"/);
    assert.match(html, /data-persona-journey="how-to-reach-them"/);
    assert.match(html, /data-persona-journey="what-to-create"/);
    assert.match(html, /data-persona-journey="evidence-signals"/);
    assert.match(html, /data-persona-journey="advanced"/);
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
    assert.match(html, /data-persona-care-source="stored-profile"/);
    assert.match(html, /data-persona-field="goals"/);
    assert.match(html, /data-persona-field="pain_points"/);
    assert.match(html, /data-persona-analysis-key="PERSONA_EXECUTIVE_PROFILE"/);
    assert.match(html, /data-persona-analysis-key="OBJECTION_HANDLING"/);
    assert.match(html, /data-persona-analysis-key="VALUE_PROPOSITION"/);
    assert.match(html, /data-persona-analysis-key="MESSAGING_FRAMEWORK"/);
    assert.match(html, /Create advertising/);
    assert.match(html, /data-persona-profile-editor="true"/);
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
    assert.match(html, /data-deployment-chrome="embedded"/);
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
    assert.match(page, /href="\/ads\/new"/);
    assert.match(page, /href="\/social-planner"/);
    assert.match(header, /Discuss with Athena|discussLabel/);
    assert.match(header, /observationLabel/);
    assert.doesNotMatch(header, /teachLabel/);
    assert.match(header, /PERSONA_DETAIL_ANCHORS.conversation/);
    assert.match(header, /PERSONA_DETAIL_ANCHORS.observation/);
    assert.match(header, /PERSONA_TEACH_EVENT/);
    assert.match(header, /data-persona-header-actions="primary"/);
    assert.match(header, /data-persona-header-actions="secondary"/);
    assert.match(header, /data-persona-header-actions="utility"/);
    assert.match(header, /data-persona-header-actions="destructive"/);
    assert.match(workspace, /sourceKind === "persona"/);
    assert.match(workspace, /PersonaAudienceJourney/);
    assert.match(workspace, /Persona Strategic Blueprint/);
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
        primaryActions: createElement("button", {
          "data-persona-header-action": "refresh",
        }, "Refresh intelligence"),
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
    assert.match(html, /data-persona-header-actions="primary"/);
    assert.match(html, /data-persona-header-actions="secondary"/);
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
        crossLinks: createElement("a", { href: "/ads/new" }, "Create advertising"),
        previousIntelligence: createElement("div", {
          "data-persona-previous-intelligence": "true",
        }),
        evidenceExtra: createElement("div", null, "Quiet luxury campaign"),
        blueprint: createElement("div", { "data-persona-blueprint": "true" }),
      }),
    );
    assert.match(html, /data-persona-analysis-key="PERSONA_EXECUTIVE_PROFILE"/);
    assert.match(html, /data-persona-analysis-key="OBJECTION_HANDLING"/);
    assert.match(html, /data-persona-analysis-key="VALUE_PROPOSITION"/);
    assert.match(html, /data-persona-analysis-key="MESSAGING_FRAMEWORK"/);
    assert.match(html, /data-persona-analysis-key="LANGUAGE_AND_TONE_GUIDE"/);
    assert.match(html, /data-persona-analysis-key="CHANNEL_STRATEGY"/);
    assert.match(html, /data-persona-analysis-key="OFFER_POSITIONING"/);
    const journey = read("components/personas/PersonaAudienceJourney.tsx");
    assert.match(journey, /data-persona-create-group="strategic"/);
    assert.match(journey, /data-persona-create-group="publishable"/);
    assert.match(journey, /data-persona-publishable-count=\{deploymentAssets.length\}/);
    assert.equal(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.length, 14);
    assert.equal(getPersonaPublishableDeploymentCatalogKeys().length, 26);
    assert.equal(groupPersonaJourneyAssets(analysisAssets).create.length, 7);
    assert.equal(publishableAssets.length, 26);
    assert.match(html, /data-asset-presentation="persona"/);
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
      assert.equal(chrome.addObservation, dictionary.personas.append.cta, language);
      assert.doesNotMatch(chrome.addObservation, /Teach Athena|Enseigner à Athena|Enseñar a Athena|Insegna ad Athena|Athena unterrichten|Ensinar a Athena/);
      assert.notEqual(dictionary.personas.list.createCta, "Create persona");
    }
    assert.equal(en.personas.journey.whatToCreate, "What to create for this audience");
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
