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
    defaultOpen: true,
  },
  {
    id: "careAbout",
    key: "VALUE_PROPOSITION",
    assetKey: "value_proposition",
    titleKey: "sectionCareAbout",
    defaultOpen: true,
  },
  {
    id: "objections",
    key: "OBJECTION_HANDLING",
    assetKey: "objection_handling",
    titleKey: "sectionObjections",
    defaultOpen: true,
  },
  {
    id: "offer",
    key: "OFFER_POSITIONING",
    assetKey: "offer_positioning",
    titleKey: "sectionOffer",
    defaultOpen: true,
  },
  {
    id: "messaging",
    key: "MESSAGING_FRAMEWORK",
    assetKey: "messaging_framework",
    titleKey: "sectionMessaging",
    defaultOpen: true,
  },
  {
    id: "language",
    key: "LANGUAGE_AND_TONE_GUIDE",
    assetKey: "language_and_tone_guide",
    titleKey: "sectionLanguage",
    defaultOpen: true,
  },
  {
    id: "channel",
    key: "CHANNEL_STRATEGY",
    assetKey: "channel_strategy",
    titleKey: "sectionChannel",
    defaultOpen: true,
  },
  {
    id: "campaigns",
    key: "CAMPAIGN_CONCEPTS",
    assetKey: "campaign_concepts",
    titleKey: "sectionCampaigns",
    defaultOpen: true,
  },
  {
    id: "themes",
    key: "CONTENT_THEMES",
    assetKey: "content_themes",
    titleKey: "sectionThemes",
    defaultOpen: true,
  },
  {
    id: "ads",
    key: "ADVERTISEMENT_CONCEPTS",
    assetKey: "advertisement_concepts",
    titleKey: "sectionAdConcepts",
    defaultOpen: true,
  },
  {
    id: "landing",
    key: "LANDING_PAGE_DIRECTION",
    assetKey: "landing_page_direction",
    titleKey: "sectionLanding",
    defaultOpen: true,
  },
  {
    id: "visual",
    key: "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
    assetKey: "visual_and_image_prompt_direction",
    titleKey: "sectionVisual",
    defaultOpen: false,
  },
  {
    id: "cx",
    key: "CUSTOMER_EXPERIENCE_GUIDANCE",
    assetKey: "customer_experience_guidance",
    titleKey: "sectionExperience",
    defaultOpen: false,
  },
  {
    id: "validation",
    key: "VALIDATION_AND_LEARNING_PLAN",
    assetKey: "validation_and_learning_plan",
    titleKey: "sectionValidation",
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
