import type { Opportunity } from "@/services/opportunityService";

export const OPPORTUNITY_REVIEW_PROMPT_VERSION =
  "opportunity_review_v2_structured_json";

export function buildOpportunityReviewPrompt(opportunity: Opportunity): string {
  return `
You are Athena, an institutional intelligence analyst.

Analyze this business opportunity and return ONLY valid JSON.

Do not include markdown.
Do not include explanations outside the JSON.
Do not wrap the JSON in code fences.

Opportunity:
${JSON.stringify(opportunity, null, 2)}

Return exactly this JSON structure:

{
  "summary": "Concise executive summary of the opportunity.",
  "pain_points": "Main pain points or business problems detected.",
  "buyer_stage": "Likely buyer stage such as Awareness, Consideration, Decision, or High Intent.",
  "recommended_response": "Recommended human response strategy.",
  "cta": "Best next call to action.",
  "confidence": 0
}

The confidence value must be an integer from 0 to 100.
`;
}
