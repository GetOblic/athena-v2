import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";

export const SEO_CONTENT_COVERAGE_PROMPT_VERSION = "seo_content_coverage_v1";

export function buildSeoContentCoveragePrompt(input: {
  organizationContext: string;
  executiveAssessment: unknown;
}): string {
  return `
OBJECTIVE:
Produce the Content Coverage Analysis section of an Athena SEO Intelligence report.

PROMPT VERSION:
${SEO_CONTENT_COVERAGE_PROMPT_VERSION}

PRIOR SECTION (executiveAssessment — stay consistent):
${JSON.stringify(input.executiveAssessment, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "wellCoveredServices": string[],
  "weaklyCoveredServices": string[],
  "missingServices": string[],
  "missingCustomerQuestions": string[],
  "missingTrustContent": string[],
  "missingEducationalContent": string[],
  "missingConversionContent": string[],
  "analysis": string,
  "athenaEvidence": string[]
}

FIELD RULES:
- Ground coverage judgments in Deep Website Intelligence pages/knowledge, Brain, Personas, Communities, and Discussions.
- Each array must contain at least 1 item. Prefer concrete service/topic names over generic filler.
- If Deep Website Intelligence is missing, state limited confidence in analysis and avoid inventing page inventory.
- athenaEvidence: short citations like "Deep Scrape services", "Persona pain points", "Community discussions".

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}
