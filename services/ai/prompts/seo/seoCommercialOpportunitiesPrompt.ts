import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";

export const SEO_COMMERCIAL_OPPORTUNITIES_PROMPT_VERSION =
  "seo_commercial_opportunities_v1";

export function buildSeoCommercialOpportunitiesPrompt(input: {
  organizationContext: string;
  priorSections: unknown;
}): string {
  return `
OBJECTIVE:
Produce the Commercial Opportunity Analysis section of an Athena SEO Intelligence report.

PROMPT VERSION:
${SEO_COMMERCIAL_OPPORTUNITIES_PROMPT_VERSION}

PRIOR SECTIONS (stay consistent):
${JSON.stringify(input.priorSections, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "opportunities": [
    {
      "contentType": string,
      "title": string,
      "rationale": string,
      "expectedImpact": string,
      "athenaEvidence": string[]
    }
  ],
  "summary": string
}

FIELD RULES:
- Recommend new content likely to increase organic visibility and commercial demand capture.
- contentType examples: Service page, FAQ page, Comparison page, Educational page, Location page, Landing page, Trust page, Case study, Guide.
- At least 3 opportunities. Do not invent demand — ground each opportunity in Athena intelligence.
- expectedImpact must be qualitative business impact (visibility, lead quality, trust) — never invent traffic/ranking numbers.
- Optional Ads keyword themes may inform themes, but never invent volume/CPC.

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}
