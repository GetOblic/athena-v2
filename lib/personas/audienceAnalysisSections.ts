/**
 * Presentation-only grouping of the existing 14 Persona analysis keys.
 * Does not rename keys, alter packages, or invent sections without data.
 */
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "@/lib/personaDeploymentAssetContract";

export const AUDIENCE_ANALYSIS_SECTION_DEFS = [
  {
    id: "overview",
    key: "PERSONA_EXECUTIVE_PROFILE",
    assetKey: "persona_executive_profile",
    titleKey: "sectionOverview",
    journey: "who",
    defaultOpen: false,
  },
  {
    id: "careAbout",
    key: "VALUE_PROPOSITION",
    assetKey: "value_proposition",
    titleKey: "sectionCareAbout",
    journey: "reach",
    defaultOpen: false,
  },
  {
    id: "objections",
    key: "OBJECTION_HANDLING",
    assetKey: "objection_handling",
    titleKey: "sectionObjections",
    journey: "friction",
    defaultOpen: false,
  },
  {
    id: "offer",
    key: "OFFER_POSITIONING",
    assetKey: "offer_positioning",
    titleKey: "sectionOffer",
    journey: "reach",
    defaultOpen: false,
  },
  {
    id: "messaging",
    key: "MESSAGING_FRAMEWORK",
    assetKey: "messaging_framework",
    titleKey: "sectionMessaging",
    journey: "reach",
    defaultOpen: false,
  },
  {
    id: "language",
    key: "LANGUAGE_AND_TONE_GUIDE",
    assetKey: "language_and_tone_guide",
    titleKey: "sectionLanguage",
    journey: "reach",
    defaultOpen: false,
  },
  {
    id: "channel",
    key: "CHANNEL_STRATEGY",
    assetKey: "channel_strategy",
    titleKey: "sectionChannel",
    journey: "reach",
    defaultOpen: false,
  },
  {
    id: "campaigns",
    key: "CAMPAIGN_CONCEPTS",
    assetKey: "campaign_concepts",
    titleKey: "sectionCampaigns",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "themes",
    key: "CONTENT_THEMES",
    assetKey: "content_themes",
    titleKey: "sectionThemes",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "ads",
    key: "ADVERTISEMENT_CONCEPTS",
    assetKey: "advertisement_concepts",
    titleKey: "sectionAdConcepts",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "landing",
    key: "LANDING_PAGE_DIRECTION",
    assetKey: "landing_page_direction",
    titleKey: "sectionLanding",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "visual",
    key: "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
    assetKey: "visual_and_image_prompt_direction",
    titleKey: "sectionVisual",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "cx",
    key: "CUSTOMER_EXPERIENCE_GUIDANCE",
    assetKey: "customer_experience_guidance",
    titleKey: "sectionExperience",
    journey: "create",
    defaultOpen: false,
  },
  {
    id: "validation",
    key: "VALIDATION_AND_LEARNING_PLAN",
    assetKey: "validation_and_learning_plan",
    titleKey: "sectionValidation",
    journey: "create",
    defaultOpen: false,
  },
] as const;

export type AudienceAnalysisSectionId =
  (typeof AUDIENCE_ANALYSIS_SECTION_DEFS)[number]["id"];
export type AudienceAnalysisTitleKey =
  (typeof AUDIENCE_ANALYSIS_SECTION_DEFS)[number]["titleKey"];

export type AudienceAnalysisAssetLike = {
  assetKey?: string | null;
  title?: string | null;
};

export function groupAudienceAnalysisAssets<T extends AudienceAnalysisAssetLike>(
  assets: readonly T[],
): Array<{
  def: (typeof AUDIENCE_ANALYSIS_SECTION_DEFS)[number];
  asset: T;
}> {
  const unused = [...assets];
  const grouped: Array<{
    def: (typeof AUDIENCE_ANALYSIS_SECTION_DEFS)[number];
    asset: T;
  }> = [];

  for (const def of AUDIENCE_ANALYSIS_SECTION_DEFS) {
    const index = unused.findIndex((asset) => {
      const key = String(asset.assetKey ?? "")
        .trim()
        .toLowerCase();
      if (key && key === def.assetKey) {
        return true;
      }
      const title = String(asset.title ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
      return title === def.key;
    });
    if (index < 0) {
      continue;
    }
    const [asset] = unused.splice(index, 1);
    grouped.push({ def, asset });
  }

  return grouped;
}

export function audienceAnalysisKeys(): readonly string[] {
  return REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS;
}
