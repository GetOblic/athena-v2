import type { Discussion } from "@/services/discussionService";
import {
  ELEVATE_STRATEGY_PROMPT,
  ELEVATE_STRATEGY_PROMPT_VERSION,
} from "@/services/ai/prompts/elevateStrategyPrompt";
import {
  SHARED_DEPLOYMENT_QUALITY,
  SHARED_JSON_OUTPUT_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

export const DISCUSSION_ANALYSIS_PROMPT_VERSION =
  "discussion_analysis_v5_reasoning";

function resolveDomainFramework(brainContextPrompt: string): string {
  if (brainContextPrompt.includes("BUSINESS CONTEXT")) {
    return "Apply domain voice and constraints from Business Context.";
  }

  if (brainContextPrompt.length > 800) {
    return "Apply domain voice and constraints from context above.";
  }

  return ELEVATE_STRATEGY_PROMPT;
}

export function buildDiscussionAnalysisPrompt(
  discussion: Discussion,
  brainContextPrompt = "",
): string {
  const domainFramework = resolveDomainFramework(brainContextPrompt);

  return `
=== OBJECTIVE ===
Analyze the discussion. Produce executive intelligence (JSON fields) and paste-ready deployment assets in suggested_cta.

=== BUSINESS CONTEXT ===
${brainContextPrompt || "No business context provided."}

=== AVAILABLE DATA ===
${domainFramework}

Discussion record:
${JSON.stringify(
  {
    id: discussion.id,
    title: discussion.title,
    body: discussion.body,
    status: discussion.status,
    opportunity_score: discussion.opportunity_score,
    community_id: discussion.community_id,
  },
  null,
  2,
)}

=== REQUIRED OUTPUT ===
${SHARED_JSON_OUTPUT_RULES}

{
  "summary": "Concise summary.",
  "sentiment": "positive | neutral | negative | mixed",
  "intent": "none | low | medium | high",
  "buyer_stage": "unaware | aware | consideration | decision | high_intent",
  "pain_points": "Detected pain points.",
  "opportunity_detected": true,
  "opportunity_title": "Market-pattern title if detected, else empty.",
  "opportunity_reason": "Why this is or is not an opportunity.",
  "recommended_action": "Internal operator guidance only.",
  "suggested_cta": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...\\n\\nCALL_TO_ACTION:\\n...",
  "risk_level": "low | medium | high",
  "confidence": 0,
  "strategy_prompt_version": "${ELEVATE_STRATEGY_PROMPT_VERSION}"
}

confidence must be integer 0-100.

=== QUALITY STANDARD ===
${SHARED_DEPLOYMENT_QUALITY}
Populate each deployment section with complete copy. Executive Intelligence fields stay analytical.
`.trim();
}
