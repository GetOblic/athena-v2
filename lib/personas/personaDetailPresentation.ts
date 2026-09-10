/**
 * Presentation-only Audience detail information architecture.
 * Does not change generation, scoring, schema, or stored field semantics.
 */

import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import {
  AUDIENCE_ANALYSIS_SECTION_DEFS,
  groupAudienceAnalysisAssets,
} from "@/lib/personas/audienceAnalysisSections";
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "@/lib/personaDeploymentAssetContract";
import { getPersonaPublishableDeploymentCatalogKeys } from "@/lib/personaIntelligenceAssetCatalog";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { Persona } from "@/services/personas/personaService";

export const PERSONA_DETAIL_ANCHORS = {
  conversation: "persona-conversation",
  conversationInput: "persona-conversation-input",
  observation: "persona-observation",
  observationField: "persona-observation-field",
  snapshot: "persona-executive-snapshot",
  recommendation: "persona-athena-recommendation",
} as const;

export const PERSONA_DISCUSS_EVENT = "persona-discuss-athena";
export const PERSONA_TEACH_EVENT = "persona-teach-athena";

export const PERSONA_DETAIL_SECTION_ORDER = [
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
] as const;

export type PersonaDetailSectionId =
  (typeof PERSONA_DETAIL_SECTION_ORDER)[number];

export type PersonaJourneyChapter =
  | "who"
  | "care"
  | "friction"
  | "reach"
  | "create";

export const PERSONA_WHO_THEY_ARE_FIELDS = [
  "occupation",
  "seniority",
  "industry_context",
  "education",
  "country",
  "state",
  "city",
  "location_summary",
  "languages",
  "age_range",
  "generation",
  "gender_identity",
  "additional_context",
] as const;

export const PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS = [
  "goals",
  "needs",
  "values_text",
  "motivations",
  "interests",
] as const;

export const PERSONA_WHAT_GETS_IN_THE_WAY_FIELDS = [
  "pain_points",
  "objections",
  "fears",
  "typical_concerns",
] as const;

export const PERSONA_HOW_TO_REACH_FIELDS = [
  "preferred_channels",
  "communication_style",
  "buying_triggers",
  "decision_criteria",
] as const;

export const PERSONA_JOURNEY_ANALYSIS_KEYS: Record<
  Exclude<PersonaJourneyChapter, "care">,
  readonly string[]
> = {
  who: ["PERSONA_EXECUTIVE_PROFILE"],
  friction: ["OBJECTION_HANDLING"],
  reach: [
    "MESSAGING_FRAMEWORK",
    "LANGUAGE_AND_TONE_GUIDE",
    "CHANNEL_STRATEGY",
    "OFFER_POSITIONING",
    "VALUE_PROPOSITION",
  ],
  create: [
    "CAMPAIGN_CONCEPTS",
    "CONTENT_THEMES",
    "ADVERTISEMENT_CONCEPTS",
    "LANDING_PAGE_DIRECTION",
    "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
    "CUSTOMER_EXPERIENCE_GUIDANCE",
    "VALIDATION_AND_LEARNING_PLAN",
  ],
};

export const PERSONA_HONEST_ANALYSIS_TITLES: Record<string, string> = {
  PERSONA_EXECUTIVE_PROFILE: "Persona Executive Profile",
  MESSAGING_FRAMEWORK: "Messaging Framework",
  VALUE_PROPOSITION: "Value Proposition",
  OBJECTION_HANDLING: "Objection Handling",
  LANGUAGE_AND_TONE_GUIDE: "Language and Tone Guide",
  OFFER_POSITIONING: "Offer Positioning",
  CHANNEL_STRATEGY: "Channel Strategy",
  CAMPAIGN_CONCEPTS: "Campaign Concepts",
  CONTENT_THEMES: "Content Themes",
  ADVERTISEMENT_CONCEPTS: "Advertisement Concepts",
  LANDING_PAGE_DIRECTION: "Landing Page Direction",
  VISUAL_AND_IMAGE_PROMPT_DIRECTION: "Visual and Image Prompt Direction",
  CUSTOMER_EXPERIENCE_GUIDANCE: "Customer Experience Guidance",
  VALIDATION_AND_LEARNING_PLAN: "Validation and Learning Plan",
};

export type PersonaFieldPresentation = {
  key: string;
  label: string;
  kind: "chips" | "text";
  items: string[];
};

export function splitPersonaFieldItems(value?: string | null): string[] {
  if (!value?.trim()) return [];
  const raw = value.trim();
  const parts = raw
    .split(/\n+|•|·|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return parts;
  }
  const commaParts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (commaParts.length >= 2 && commaParts.every((item) => item.length <= 72)) {
    return commaParts;
  }
  return [raw];
}

export function presentPersonaField(
  key: string,
  label: string,
  value?: string | null,
): PersonaFieldPresentation | null {
  const items = splitPersonaFieldItems(value);
  if (items.length === 0) return null;
  const kind =
    items.length >= 2 && items.every((item) => item.length <= 80)
      ? "chips"
      : "text";
  return { key, label, kind, items };
}

function personaStringField(
  persona: Persona,
  key: string,
): string | null {
  const value = persona[key as keyof Persona];
  return typeof value === "string" ? value : null;
}

export function presentPersonaFieldGroup(
  persona: Persona,
  keys: readonly string[],
  labels: Record<string, string>,
): PersonaFieldPresentation[] {
  return keys
    .map((key) =>
      presentPersonaField(key, labels[key] ?? key, personaStringField(persona, key)),
    )
    .filter((field): field is PersonaFieldPresentation => field != null);
}

function analysisKeyOf(asset: DeploymentAsset): string {
  const fromTitle = String(asset.title ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.includes(fromTitle as never)) {
    return fromTitle;
  }
  const def = AUDIENCE_ANALYSIS_SECTION_DEFS.find((item) => {
    const key = String(asset.assetKey ?? "")
      .trim()
      .toLowerCase();
    return key && key === item.assetKey;
  });
  return def?.key ?? fromTitle;
}

export function groupPersonaJourneyAssets(assets: readonly DeploymentAsset[]): {
  who: DeploymentAsset[];
  friction: DeploymentAsset[];
  reach: DeploymentAsset[];
  create: DeploymentAsset[];
  leftover: DeploymentAsset[];
} {
  const grouped = groupAudienceAnalysisAssets(assets);
  const used = new Set(grouped.map((item) => item.asset));
  const byChapter: Record<
    "who" | "friction" | "reach" | "create",
    DeploymentAsset[]
  > = {
    who: [],
    friction: [],
    reach: [],
    create: [],
  };

  for (const { def, asset } of grouped) {
    if (def.key === "PERSONA_EXECUTIVE_PROFILE") {
      byChapter.who.push(asset);
      continue;
    }
    if (def.key === "OBJECTION_HANDLING") {
      byChapter.friction.push(asset);
      continue;
    }
    if (
      PERSONA_JOURNEY_ANALYSIS_KEYS.reach.includes(def.key)
    ) {
      byChapter.reach.push(asset);
      continue;
    }
    if (PERSONA_JOURNEY_ANALYSIS_KEYS.create.includes(def.key)) {
      byChapter.create.push(asset);
    }
  }

  const leftover = assets.filter((asset) => !used.has(asset));
  return { ...byChapter, leftover };
}

export function personaAnalysisKeysStillReachable(
  assets: readonly DeploymentAsset[],
): string[] {
  const grouped = groupAudienceAnalysisAssets(assets);
  return grouped.map((item) => item.def.key);
}

export function publishableAssetKey(asset: DeploymentAsset): string {
  return String(asset.assetKey ?? asset.title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function allPublishableCatalogKeys(): readonly string[] {
  return getPersonaPublishableDeploymentCatalogKeys();
}

export function honestAnalysisTitle(
  asset: DeploymentAsset,
  titles?: Record<string, string> | null,
): string {
  const key = analysisKeyOf(asset);
  return titles?.[key] ?? PERSONA_HONEST_ANALYSIS_TITLES[key] ?? asset.title;
}

export function uniqueFrictionTexts(
  persona: Persona,
  generatedPain?: string | null,
): { stored: PersonaFieldPresentation[]; skipGeneratedPain: boolean } {
  const labels: Record<string, string> = {
    pain_points: "pain_points",
    objections: "objections",
    fears: "fears",
    typical_concerns: "typical_concerns",
  };
  const stored = presentPersonaFieldGroup(
    persona,
    PERSONA_WHAT_GETS_IN_THE_WAY_FIELDS,
    labels,
  );
  const generated = generatedPain?.trim() ?? "";
  const skipGeneratedPain = stored.some((field) =>
    field.items.some(
      (item) => item.trim().toLowerCase() === generated.toLowerCase(),
    ),
  );
  return { stored, skipGeneratedPain };
}

export type PersonaJourneyChrome = {
  discussWithAthena: string;
  addObservation: string;
  executiveSnapshot: string;
  whoTheyAre: string;
  whatTheyCareAbout: string;
  whatGetsInTheWay: string;
  howToReachThem: string;
  whatToCreate: string;
  strategicCreation: string;
  readyToUseAssets: string;
  evidenceSignals: string;
  advanced: string;
  audienceProfile: string;
  identitySlice: string;
  messaging: string;
  tone: string;
  channels: string;
  offerPositioning: string;
  valueProposition: string;
  previousIntelligence: string;
  emptyValue: string;
  confidence: string;
  executiveInsight: string;
  primaryConcern: string;
  engagementStrategy: string;
  recommendedAction: string;
  recommendation: string;
  buyerStage: string;
  intent: string;
  risk: string;
  whyMatters: string;
  editProfile: string;
  fieldLabels: Record<string, string>;
  analysisTitles: Record<string, string>;
};

export function buildPersonaJourneyChrome(
  messages: TenantMessages["personas"],
): PersonaJourneyChrome {
  const journey = messages.journey;
  const meta = messages.metadata;
  return {
    discussWithAthena: journey.discussWithAthena,
    addObservation: messages.append.cta,
    executiveSnapshot: journey.executiveSnapshot,
    whoTheyAre: journey.whoTheyAre,
    whatTheyCareAbout: journey.whatTheyCareAbout,
    whatGetsInTheWay: journey.whatGetsInTheWay,
    howToReachThem: journey.howToReachThem,
    whatToCreate: journey.whatToCreate,
    strategicCreation: journey.strategicCreation,
    readyToUseAssets: journey.readyToUseAssets,
    evidenceSignals: journey.evidenceSignals,
    advanced: messages.traction.sectionAdvanced,
    audienceProfile: messages.traction.sectionProfile,
    identitySlice: journey.identitySlice,
    messaging: journey.messaging,
    tone: journey.tone,
    channels: journey.channels,
    offerPositioning: journey.offerPositioning,
    valueProposition: journey.valueProposition,
    previousIntelligence: messages.traction.sectionPrevious,
    emptyValue: messages.emptyValue,
    confidence: messages.executive.confidence,
    executiveInsight: messages.executive.executiveInsight,
    primaryConcern: messages.executive.primaryBuyerConcern,
    engagementStrategy: messages.executive.recommendedStrategy,
    recommendedAction: messages.executive.recommendedAction,
    recommendation: messages.executive.recommendation,
    buyerStage: messages.executive.buyerStage,
    intent: messages.executive.intent,
    risk: messages.executive.risk,
    whyMatters: messages.executive.whyMatters,
    editProfile: meta.title,
    fieldLabels: {
      occupation: meta.occupation,
      seniority: meta.seniority,
      industry_context: meta.industryContext,
      education: meta.education,
      country: meta.country,
      state: meta.state,
      city: meta.city,
      location_summary: meta.locationSummary,
      languages: meta.languages,
      age_range: meta.ageRange,
      generation: meta.generation,
      gender_identity: meta.genderIdentity,
      additional_context: meta.additionalContext,
      goals: meta.goals,
      needs: meta.needs,
      values_text: meta.valuesText,
      motivations: meta.motivations,
      interests: meta.interests,
      pain_points: meta.painPoints,
      objections: meta.objections,
      fears: meta.fears,
      typical_concerns: meta.typicalConcerns,
      preferred_channels: meta.preferredChannels,
      communication_style: meta.communicationStyle,
      buying_triggers: meta.buyingTriggers,
      decision_criteria: meta.decisionCriteria,
      ads_content: meta.adsContent,
    },
    analysisTitles: {
      PERSONA_EXECUTIVE_PROFILE: journey.assetPersonaExecutiveProfile,
      MESSAGING_FRAMEWORK: journey.assetMessagingFramework,
      VALUE_PROPOSITION: journey.assetValueProposition,
      OBJECTION_HANDLING: journey.assetObjectionHandling,
      LANGUAGE_AND_TONE_GUIDE: journey.assetLanguageAndTone,
      OFFER_POSITIONING: journey.assetOfferPositioning,
      CHANNEL_STRATEGY: journey.assetChannelStrategy,
      CAMPAIGN_CONCEPTS: journey.assetCampaignConcepts,
      CONTENT_THEMES: journey.assetContentThemes,
      ADVERTISEMENT_CONCEPTS: journey.assetAdvertisementConcepts,
      LANDING_PAGE_DIRECTION: journey.assetLandingPageDirection,
      VISUAL_AND_IMAGE_PROMPT_DIRECTION: journey.assetVisualDirection,
      CUSTOMER_EXPERIENCE_GUIDANCE: journey.assetCustomerExperience,
      VALIDATION_AND_LEARNING_PLAN: journey.assetValidationPlan,
    },
  };
}

export function careAboutUsesValueProposition(): boolean {
  return PERSONA_JOURNEY_ANALYSIS_KEYS.reach.includes("VALUE_PROPOSITION");
}
