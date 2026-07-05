import type { Discussion } from "@/services/discussionService";
import {
  ELEVATE_STRATEGY_PROMPT,
  ELEVATE_STRATEGY_PROMPT_VERSION,
} from "@/services/ai/prompts/elevateStrategyPrompt";

export const DISCUSSION_ANALYSIS_PROMPT_VERSION =
  "discussion_analysis_v1_structured_json";

export function buildDiscussionAnalysisPrompt(discussion: Discussion): string {
  return `
You are Athena, an institutional intelligence analyst.

Your task is to analyze a community discussion and extract business intelligence according to the Elevate / Aluma strategy.

${ELEVATE_STRATEGY_PROMPT}

Discussion:
${JSON.stringify(discussion, null, 2)}

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.
Do not wrap the JSON in code fences.

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
  "recommended_action": "Recommended next action for Laurent/Liana.",
  "suggested_cta": "Best soft CTA, if any.",
  "risk_level": "low | medium | high",
  "confidence": 0,
  "strategy_prompt_version": "${ELEVATE_STRATEGY_PROMPT_VERSION}"
}

The confidence value must be an integer from 0 to 100.
`;
}
