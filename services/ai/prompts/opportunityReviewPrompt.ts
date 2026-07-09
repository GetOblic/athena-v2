import type { Opportunity } from "@/services/opportunityService";
import {
  SHARED_DEPLOYMENT_QUALITY,
  SHARED_JSON_OUTPUT_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

export const OPPORTUNITY_REVIEW_PROMPT_VERSION =
  "opportunity_review_v6_reasoning";

export function buildOpportunityReviewPrompt(opportunity: Opportunity): string {
  return `
=== OBJECTIVE ===
Produce an executive briefing and paste-ready deployment assets for this opportunity.

=== AVAILABLE DATA ===
${JSON.stringify(
  {
    id: opportunity.id,
    title: opportunity.title,
    reason: opportunity.reason,
    score: opportunity.score,
    status: opportunity.status,
    intent: opportunity.intent,
    risk_level: opportunity.risk_level,
    ai_summary: opportunity.ai_summary,
    suggested_cta: opportunity.suggested_cta,
  },
  null,
  2,
)}

=== REQUIRED OUTPUT ===
${SHARED_JSON_OUTPUT_RULES}

{
  "summary": "Executive summary.",
  "pain_points": "Main pain points.",
  "buyer_stage": "Awareness | Consideration | Decision | High Intent",
  "recommended_response": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...",
  "cta": "Exact paste-ready CTA sentence.",
  "confidence": 0
}

confidence must be integer 0-100.

=== QUALITY STANDARD ===
${SHARED_DEPLOYMENT_QUALITY}
Briefing summary stays analytical. recommended_response holds deployment copy; cta holds one exact CTA sentence.
`.trim();
}
