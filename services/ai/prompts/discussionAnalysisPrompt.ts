import type { Discussion } from "@/services/discussionService";
import {
  ELEVATE_STRATEGY_PROMPT,
  ELEVATE_STRATEGY_PROMPT_VERSION,
} from "@/services/ai/prompts/elevateStrategyPrompt";

export const DISCUSSION_ANALYSIS_PROMPT_VERSION =
  "discussion_analysis_v2_deployment_assets";

export function buildDiscussionAnalysisPrompt(discussion: Discussion): string {
  return `
You are Athena, an institutional intelligence operator.

Your task is to analyze a community discussion and produce both:
1. Strategic intelligence for Laurent/Liana.
2. Copy-paste-ready deployment assets the operator can immediately use in the discussion or social channel.

${ELEVATE_STRATEGY_PROMPT}

Discussion:
${JSON.stringify(discussion, null, 2)}

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside the JSON.
- Do not wrap the JSON in code fences.
- The "recommended_action" field is strategic. It should explain what the operator should do.
- The "suggested_cta" field is NOT a recommendation. It must contain ready-to-use copy-paste content.
- Do not write phrases like "respond with", "position this as", "offer guidance", or "use a soft CTA" inside suggested_cta.
- Write the actual message the operator can paste.
- Keep tone human, helpful, credible, non-salesy, and appropriate for community replies.
- Do not overpromise.
- Do not mention Athena unless the original context clearly supports it.

For suggested_cta, use this exact plain-text asset format:

COMMUNITY_REPLY:
[Write a complete public reply that can be posted directly in the community discussion.]

PRIVATE_MESSAGE:
[Write a short direct message version that can be sent privately.]

SOCIAL_POST:
[Write a short standalone social media post inspired by the discussion. It should be useful for Facebook/Instagram/LinkedIn and should educate without sounding promotional.]

FOLLOW_UP:
[Write a short follow-up reply to use if the prospect responds positively.]

CALL_TO_ACTION:
[Write the exact CTA sentence the operator can paste.]

Return exactly this JSON structure:

{
  "summary": "Concise summary of what the discussion is about.",
  "sentiment": "positive | neutral | negative | mixed",
  "intent": "none | low | medium | high",
  "buyer_stage": "unaware | aware | consideration | decision | high_intent",
  "pain_points": "Detected pain points or concerns.",
  "opportunity_detected": true,
  "opportunity_title": "Short opportunity title if detected, otherwise empty string.",
  "opportunity_reason": "Why this discussion may or may not be an opportunity.",
  "recommended_action": "Strategic recommendation for Laurent/Liana. This is internal guidance, not copy-paste content.",
  "suggested_cta": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...\\n\\nCALL_TO_ACTION:\\n...",
  "risk_level": "low | medium | high",
  "confidence": 0,
  "strategy_prompt_version": "${ELEVATE_STRATEGY_PROMPT_VERSION}"
}

The confidence value must be an integer from 0 to 100.
`;
}
