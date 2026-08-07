import { SEO_TECHNICAL_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoTechnicalSharedConstraints";
import type { SeoReportBriefMode } from "@/services/seo/seoReportTypes";

export function buildSeoTechnicalExecutivePrompt(input: {
  organizationContext: string;
  technicalEvidence: string;
  briefMode: SeoReportBriefMode;
}): string {
  return `
You are Athena producing a Technical SEO Executive Evaluation.

${SEO_TECHNICAL_SHARED_OUTPUT_RULES}

briefMode must be "${input.briefMode}".

Return ONLY JSON:
{
  "overallAssessment": "string",
  "strengths": ["string"],
  "criticalIssues": ["string"],
  "warnings": ["string"],
  "remediationPriorities": ["string"],
  "summary": "string"
}

Rules:
- strengths: at least 1 item grounded in evidence.
- criticalIssues / warnings: may be empty arrays when none are evidenced.
- remediationPriorities: at least 1 prioritized next step.
- summary: short executive summary for report cards.

ORGANIZATION CONTEXT:
${input.organizationContext}

${input.technicalEvidence}
`.trim();
}
