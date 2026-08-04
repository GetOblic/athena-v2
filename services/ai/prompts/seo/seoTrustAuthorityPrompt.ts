import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";

export const SEO_TRUST_AUTHORITY_PROMPT_VERSION = "seo_trust_authority_v1";

export function buildSeoTrustAuthorityPrompt(input: {
  organizationContext: string;
  priorSections: unknown;
}): string {
  return `
OBJECTIVE:
Produce the Trust & Authority Analysis section of an Athena SEO Intelligence report.

PROMPT VERSION:
${SEO_TRUST_AUTHORITY_PROMPT_VERSION}

PRIOR SECTIONS (stay consistent):
${JSON.stringify(input.priorSections, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "trustSignals": string,
  "testimonials": string,
  "caseStudies": string,
  "expertPositioning": string,
  "authorityMessaging": string,
  "differentiation": string,
  "callsToAction": string,
  "consistency": string,
  "recommendations": string[],
  "athenaEvidence": string[]
}

FIELD RULES:
- Evaluate trust/authority primarily from Deep Website Intelligence evidence.
- If Deep Scrape shows weak/missing testimonials or case studies, say so clearly.
- recommendations: at least 2 concrete content/authority improvements.
- Do not invent client names, results, awards, or proof points.

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}
