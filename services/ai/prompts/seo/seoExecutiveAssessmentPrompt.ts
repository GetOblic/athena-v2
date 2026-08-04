import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";
import type { SeoReportBriefMode } from "@/services/seo/seoReportTypes";

export const SEO_EXECUTIVE_ASSESSMENT_PROMPT_VERSION =
  "seo_executive_assessment_v1";

export function buildSeoExecutiveAssessmentPrompt(input: {
  organizationContext: string;
  briefMode: SeoReportBriefMode;
}): string {
  return `
OBJECTIVE:
Produce the Executive SEO Assessment section of an Athena SEO Intelligence report.

PROMPT VERSION:
${SEO_EXECUTIVE_ASSESSMENT_PROMPT_VERSION}

BRIEF MODE:
${input.briefMode}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "overallAssessment": string,
  "strengths": string[],
  "weaknesses": string[],
  "seoReadiness": string,
  "businessVisibilityAssessment": string,
  "summary": string
}

FIELD RULES:
- Assess overall website content readiness for organic business visibility — not technical crawl health.
- strengths and weaknesses: at least 2 items each, grounded in Deep Website Intelligence + Brain.
- seoReadiness: qualitative readiness statement (not a numeric score pretending to be from tools).
- businessVisibilityAssessment: how well the business can be found and understood for its real offers/audiences.
- summary: concise operator-facing overview (2-4 sentences).
- Do not invent website coverage that Deep Scrape / Brain does not support.

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}
