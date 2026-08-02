import { ADS_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/ads/adsSharedConstraints";
import type { AdCampaignStrategy } from "@/services/ads/adCampaignTypes";

export const ADS_TIKTOK_PROMPT_VERSION = "ads_tiktok_v1";

export function buildAdsTikTokPrompt(input: {
  organizationContext: string;
  strategy: AdCampaignStrategy;
}): string {
  return `
OBJECTIVE:
Generate TikTok Ads assets native to short-form creator/video conventions while remaining consistent with the shared campaign strategy.

PROMPT VERSION:
${ADS_TIKTOK_PROMPT_VERSION}

SHARED STRATEGY (authoritative for consistency):
${JSON.stringify(input.strategy, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "openingHook": string,
  "shortVideoScript": string,
  "sceneDirection": string,
  "onScreenText": string,
  "caption": string,
  "cta": string,
  "creatorOrProductionDirection": string
}

PLATFORM RULES:
- Lead with a native TikTok opening hook in the first line of attention.
- Include scene direction and creator/production guidance.
- Do not merely rewrite Facebook or Instagram packages.
- No chain-of-thought.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
