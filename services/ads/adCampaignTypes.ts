/**
 * Organization-level Ads campaign types (Athena V18).
 * Ads belong to the organization — never to Discussion/Prospect/Persona/EV.
 */

export const AD_CAMPAIGN_STATUSES = [
  "Queued",
  "Processing",
  "Ready",
  "Processing Failed",
] as const;

export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export const AD_CAMPAIGN_GENERATION_STAGES = [
  "assembling_context",
  "strategy",
  "facebook",
  "instagram",
  "tiktok",
  "google_search",
  "keyword_themes",
  "validating",
  "completed",
  "failed",
] as const;

export type AdCampaignGenerationStage =
  (typeof AD_CAMPAIGN_GENERATION_STAGES)[number];

export type AdCampaignBrief = {
  name?: string;
  guidance?: string;
  objective?: string;
  offer?: string;
  audience?: string;
  geography?: string;
  landingPage?: string;
  constraints?: string;
};

export type AdCampaignBriefMode = "inferred" | "guided";

export type AdCampaignStrategy = {
  campaignName: string;
  objective: string;
  audience: string;
  coreOfferOrMessage: string;
  positioningAngle: string;
  primaryValueProposition: string;
  ctaDirection: string;
  landingPageDirection: string;
  rationale: string;
  briefMode: AdCampaignBriefMode;
};

export type FacebookAdAssets = {
  primaryText: string;
  headline: string;
  description: string;
  ctaRecommendation: string;
  audienceDirection: string;
  creativeConcept: string;
  imagePrompt: string;
};

export type InstagramAdAssets = {
  feedCaption: string;
  openingHook: string;
  reelOrStoryScript: string;
  onScreenText: string;
  cta: string;
  hashtagDirection: string | null;
  creativeConcept: string;
  imageOrShortVideoPrompt: string;
};

export type TikTokAdAssets = {
  openingHook: string;
  shortVideoScript: string;
  sceneDirection: string;
  onScreenText: string;
  caption: string;
  cta: string;
  creatorOrProductionDirection: string;
};

export type GoogleSearchAdAssets = {
  campaignTheme: string;
  adGroupThemes: string[];
  headlines: string[];
  descriptions: string[];
  sitelinkIdeas: string[];
  calloutIdeas: string[];
  structuredSnippetIdeas: string[];
  negativeKeywordSuggestions: string[];
  landingPageDirection: string;
};

export type RecommendedKeywordTheme = {
  theme: string;
  intentClassification: string;
  audienceRelevance: string;
  suggestedMessageAngle: string;
  suggestedLandingPageDirection: string;
  negativeKeywordTheme?: string | null;
};

export const KEYWORD_THEMES_LABEL = "Recommended Keyword Themes" as const;

export const KEYWORD_THEMES_DISCLAIMER =
  "These keyword themes are inferred from Athena's organization intelligence. They are not based on live search volume, CPC, competition, or trend data, and are not externally validated." as const;

export type RecommendedKeywordThemes = {
  label: typeof KEYWORD_THEMES_LABEL;
  themes: RecommendedKeywordTheme[];
  disclaimer: string;
};

export type AdCampaignPackage = {
  strategy: AdCampaignStrategy;
  facebook: FacebookAdAssets;
  instagram: InstagramAdAssets;
  tiktok: TikTokAdAssets;
  googleSearch: GoogleSearchAdAssets;
  keywordThemes: RecommendedKeywordThemes;
};

export type AdCampaign = {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  brief_json: AdCampaignBrief;
  status: AdCampaignStatus;
  generation_stage: AdCampaignGenerationStage | null;
  package_json: AdCampaignPackage | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function isAdCampaignStatus(value: unknown): value is AdCampaignStatus {
  return (
    typeof value === "string" &&
    (AD_CAMPAIGN_STATUSES as readonly string[]).includes(value)
  );
}

export function isAdCampaignGenerationStage(
  value: unknown,
): value is AdCampaignGenerationStage {
  return (
    typeof value === "string" &&
    (AD_CAMPAIGN_GENERATION_STAGES as readonly string[]).includes(value)
  );
}
