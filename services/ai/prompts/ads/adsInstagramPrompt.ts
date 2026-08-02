import { ADS_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/ads/adsSharedConstraints";
import type { AdCampaignStrategy } from "@/services/ads/adCampaignTypes";

export const ADS_INSTAGRAM_PROMPT_VERSION = "ads_instagram_v1";

export function buildAdsInstagramPrompt(input: {
  organizationContext: string;
  strategy: AdCampaignStrategy;
}): string {
  return `
OBJECTIVE:
Generate Instagram Ads assets native to Feed / Reels / Stories conventions while remaining consistent with the shared campaign strategy.

PROMPT VERSION:
${ADS_INSTAGRAM_PROMPT_VERSION}

SHARED STRATEGY (authoritative for consistency):
${JSON.stringify(input.strategy, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "feedCaption": string,
  "openingHook": string,
  "reelOrStoryScript": string,
  "onScreenText": string,
  "cta": string,
  "hashtagDirection": string | null,
  "creativeConcept": string,
  "imageOrShortVideoPrompt": string
}

PLATFORM RULES:
- Produce Instagram-native hooks, captions, and short-form script direction.
- Do not merely paraphrase the Facebook package.
- hashtagDirection may be null when hashtags are not useful.
- No chain-of-thought.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
