import type { Opportunity } from "@/services/opportunityService";
import {
  DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS,
  DEPLOYMENT_ASSETS_FORMAT,
} from "@/services/ai/prompts/deploymentAssetsInstructions";

export const OPPORTUNITY_REVIEW_PROMPT_VERSION =
  "opportunity_review_v4_output_quality";

export function buildOpportunityReviewPrompt(opportunity: Opportunity): string {
  return `
You are Athena, an institutional intelligence operator and senior commercial strategist.

Analyze this business opportunity and produce:
1. A concise executive briefing (analytical intelligence).
2. Ready-to-use deployment assets the operator can copy and paste immediately.

Opportunity:
${JSON.stringify(opportunity, null, 2)}

${DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS}

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON. No markdown. No code fences.
- "recommended_response" must contain paste-ready deployment copy, NOT strategy language.
- "cta" must be the exact CTA sentence to paste — not a description of a CTA.
- Do not write "respond by", "position this as", "recommend offering", or "use a soft CTA" in deployment fields.
- Do not overpromise. Do not mention Athena unless context supports it.

${DEPLOYMENT_ASSETS_FORMAT}

For recommended_response, populate COMMUNITY_REPLY, PRIVATE_MESSAGE, SOCIAL_POST, and FOLLOW_UP with complete paste-ready copy.

Return exactly this JSON structure:

{
  "summary": "Concise executive summary of the opportunity.",
  "pain_points": "Main pain points or business problems detected.",
  "buyer_stage": "Likely buyer stage such as Awareness, Consideration, Decision, or High Intent.",
  "recommended_response": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...",
  "cta": "Exact copy-paste CTA sentence or short paragraph.",
  "confidence": 0
}

The confidence value must be an integer from 0 to 100.
`.trim();
}
