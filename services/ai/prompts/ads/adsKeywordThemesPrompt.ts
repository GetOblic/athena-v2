import { ADS_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/ads/adsSharedConstraints";
import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignStrategy,
} from "@/services/ads/adCampaignTypes";

export const ADS_KEYWORD_THEMES_PROMPT_VERSION = "ads_keyword_themes_v1";

export function buildAdsKeywordThemesPrompt(input: {
  organizationContext: string;
  strategy: AdCampaignStrategy;
}): string {
  return `
OBJECTIVE:
Generate Recommended Keyword Themes inferred from Athena organization intelligence.

PROMPT VERSION:
${ADS_KEYWORD_THEMES_PROMPT_VERSION}

SHARED STRATEGY (authoritative for consistency):
${JSON.stringify(input.strategy, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "label": "${KEYWORD_THEMES_LABEL}",
  "themes": [
    {
      "theme": string,
      "intentClassification": string,
      "audienceRelevance": string,
      "suggestedMessageAngle": string,
      "suggestedLandingPageDirection": string,
      "negativeKeywordTheme": string | null
    }
  ],
  "disclaimer": string
}

RULES:
- label must be exactly "${KEYWORD_THEMES_LABEL}".
- Provide at least 3 themes.
- disclaimer must clearly state themes are inferred and not based on live search volume, CPC, competition, or trend data.
- Preferred disclaimer text:
  "${KEYWORD_THEMES_DISCLAIMER}"
- Never invent volume, CPC, competition, or trend scores.
- No chain-of-thought.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
