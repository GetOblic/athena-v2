import type { Community } from "@/services/communityService";
import type { CommunityIntelligence } from "@/services/communityIntelligenceService";
import {
  ELEVATE_STRATEGY_PROMPT,
  ELEVATE_STRATEGY_PROMPT_VERSION,
} from "@/services/ai/prompts/elevateStrategyPrompt";

export const PRODUCTION_INTELLIGENCE_PROMPT_VERSION =
  "production_intelligence_v1_structured_json";

export function buildProductionIntelligencePrompt({
  community,
  intelligence,
}: {
  community: Community;
  intelligence: CommunityIntelligence;
}): string {
  return `
You are Athena, an executive marketing intelligence analyst.

Use the community intelligence below to recommend production assets.

Do not generate final images, videos, PDFs, or media files.
Recommend what should be created and why.

${ELEVATE_STRATEGY_PROMPT}

Community:
${JSON.stringify(community, null, 2)}

Community Intelligence:
${JSON.stringify(intelligence, null, 2)}

Return ONLY valid JSON.

{
  "content_theme": "Main content theme.",
  "target_audience": "Who this content is for.",
  "buyer_stage": "Primary buyer stage.",
  "core_pain_point": "Main pain point addressed.",
  "strategic_reason": "Why Athena recommends this content.",
  "recommended_assets": [
    {
      "asset_type": "instagram_carousel | reel | facebook_post | linkedin_post | pdf_lead_magnet | webinar | email_campaign",
      "title": "Asset title.",
      "post_text": "Draft copy if applicable.",
      "creative_brief": "What should be created visually or structurally.",
      "cta": "Recommended CTA.",
      "reason": "Why this asset is recommended."
    }
  ],
  "priority": 0,
  "confidence": 0,
  "strategy_prompt_version": "${ELEVATE_STRATEGY_PROMPT_VERSION}"
}

The priority and confidence values must be integers from 0 to 100.
`;
}
