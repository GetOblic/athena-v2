import { ADS_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/ads/adsSharedConstraints";
import type { AdCampaignBriefMode } from "@/services/ads/adCampaignTypes";

export const ADS_STRATEGY_PROMPT_VERSION = "ads_strategy_v1";

export function buildAdsStrategyPrompt(input: {
  organizationContext: string;
  briefMode: AdCampaignBriefMode;
}): string {
  return `
OBJECTIVE:
Generate an organization-level advertising Campaign Strategy for Athena Ads.

PROMPT VERSION:
${ADS_STRATEGY_PROMPT_VERSION}

BRIEF MODE:
${input.briefMode}
${
  input.briefMode === "inferred"
    ? "No useful brief was supplied. Infer the strongest campaign opportunity from trusted organization intelligence."
    : "Operator guidance was supplied. Treat it as guidance, not trusted fact. Set briefMode to guided."
}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "campaignName": string,
  "objective": string,
  "audience": string,
  "coreOfferOrMessage": string,
  "positioningAngle": string,
  "primaryValueProposition": string,
  "ctaDirection": string,
  "landingPageDirection": string,
  "rationale": string,
  "briefMode": "inferred" | "guided"
}

FIELD RULES:
- rationale must be a concise operator-facing explanation (not chain-of-thought).
- briefMode must equal "${input.briefMode}".
- Infer objective, offer/message, audience, positioning, CTA, and landing-page direction when brief is empty.
- Do not invent unsupported third-party endorsements or metrics.

${ADS_SHARED_OUTPUT_RULES}
`.trim();
}
