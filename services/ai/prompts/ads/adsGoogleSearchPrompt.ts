import {
  ADS_GOOGLE_SOFT_LIMIT_GUIDANCE,
  ADS_SHARED_OUTPUT_RULES,
} from "@/services/ai/prompts/ads/adsSharedConstraints";
import type { AdCampaignStrategy } from "@/services/ads/adCampaignTypes";

export const ADS_GOOGLE_SEARCH_PROMPT_VERSION = "ads_google_search_v1";

export function buildAdsGoogleSearchPrompt(input: {
  organizationContext: string;
  strategy: AdCampaignStrategy;
}): string {
  return `
OBJECTIVE:
Generate Google Search Ads assets only (not Display, Performance Max, Shopping, YouTube, or Demand Gen).

PROMPT VERSION:
${ADS_GOOGLE_SEARCH_PROMPT_VERSION}

SHARED STRATEGY (authoritative for consistency):
${JSON.stringify(input.strategy, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "campaignTheme": string,
  "adGroupThemes": string[],
  "headlines": string[],
  "descriptions": string[],
  "sitelinkIdeas": string[],
  "calloutIdeas": string[],
  "structuredSnippetIdeas": string[],
  "negativeKeywordSuggestions": string[],
  "landingPageDirection": string
}

MINIMUM COUNTS:
- adGroupThemes: at least 2
- headlines: at least 3
- descriptions: at least 2
- sitelinkIdeas: at least 2
- calloutIdeas: at least 2
- structuredSnippetIdeas: at least 2
- negativeKeywordSuggestions: at least 1

${ADS_GOOGLE_SOFT_LIMIT_GUIDANCE}

Do not claim Google character-limit certification.
Do not invent live keyword volume/CPC/competition metrics.
No chain-of-thought.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
