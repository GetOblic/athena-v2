import type { Community } from "@/services/communityService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  ELEVATE_STRATEGY_PROMPT,
  ELEVATE_STRATEGY_PROMPT_VERSION,
} from "@/services/ai/prompts/elevateStrategyPrompt";

export const COMMUNITY_INTELLIGENCE_PROMPT_VERSION =
  "community_intelligence_v1_structured_json";

export function buildCommunityIntelligencePrompt({
  community,
  analyses,
}: {
  community: Community;
  analyses: DiscussionAnalysis[];
}): string {
  return `
You are Athena, an executive institutional intelligence analyst.

Your task is to synthesize multiple discussion analyses into strategic community-level intelligence.

${ELEVATE_STRATEGY_PROMPT}

Community:
${JSON.stringify(community, null, 2)}

Recent Discussion Analyses:
${JSON.stringify(analyses, null, 2)}

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.
Do not wrap the JSON in code fences.

Return exactly this JSON structure:

{
  "executive_summary": "Executive-level summary of what is happening in this community.",
  "market_trends": "Important emerging trends across the analyzed discussions.",
  "recurring_pain_points": "Repeated pain points found across the community.",
  "recurring_objections": "Repeated objections, hesitations, fears, or barriers.",
  "recurring_questions": "Repeated questions being asked by prospects.",
  "buyer_stage_distribution": "Synthesis of buyer stages across the community.",
  "high_value_opportunities": "Most valuable commercial or strategic opportunities detected.",
  "recommended_campaigns": "Campaigns Athena recommends based on the community intelligence.",
  "recommended_content": "Content themes or posts that should be created.",
  "recommended_lead_magnets": "Lead magnets that would match the observed market demand.",
  "recommended_webinars": "Webinar or training topics that would address the detected demand.",
  "strategic_recommendations": "Prioritized strategic recommendations for Laurent/Liana.",
  "confidence": 0,
  "strategy_prompt_version": "${ELEVATE_STRATEGY_PROMPT_VERSION}"
}

The confidence value must be an integer from 0 to 100.
`;
}
