import { ADS_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/ads/adsSharedConstraints";
import type { AdCampaignStrategy } from "@/services/ads/adCampaignTypes";

export const ADS_FACEBOOK_PROMPT_VERSION = "ads_facebook_v1";

export function buildAdsFacebookPrompt(input: {
  organizationContext: string;
  strategy: AdCampaignStrategy;
}): string {
  return `
OBJECTIVE:
Generate Facebook Ads assets that are native to Facebook Feed/placement conventions while remaining consistent with the shared campaign strategy.

PROMPT VERSION:
${ADS_FACEBOOK_PROMPT_VERSION}

SHARED STRATEGY (authoritative for consistency):
${JSON.stringify(input.strategy, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "primaryText": string,
  "headline": string,
  "description": string,
  "ctaRecommendation": string,
  "audienceDirection": string,
  "creativeConcept": string,
  "imagePrompt": string
}

PLATFORM RULES:
- Write Facebook-native primary text, headline, and description — not a TikTok/Instagram rewrite.
- imagePrompt must be a paste-ready image generation prompt.
- Stay consistent with strategy objective, offer, audience, and CTA direction.
- No chain-of-thought.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
