import { SEO_TECHNICAL_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoTechnicalSharedConstraints";

export function buildSeoTechnicalActionPlanPrompt(input: {
  organizationContext: string;
  technicalEvidence: string;
  priorSections: Record<string, unknown>;
  briefMode: "inferred" | "guided";
  suggestedReportName: string;
}): string {
  return `
You are Athena producing a Technical SEO Action Plan and implementation assets.

${SEO_TECHNICAL_SHARED_OUTPUT_RULES}

Return ONLY JSON:
{
  "reportName": "string",
  "disclaimer": "string",
  "actionPlan": {
    "overview": "string",
    "items": [
      {
        "priority": "Critical|High|Improvement",
        "title": "string",
        "affectedPages": ["string"],
        "evidence": "string",
        "reason": "string",
        "recommendedAction": "string"
      }
    ]
  },
  "implementationAssets": {
    "metadataTableNotes": "string",
    "headingRecommendations": ["string"],
    "internalLinkPlan": ["string"],
    "schemaRecommendations": ["string"],
    "redirectRecommendations": ["string"],
    "developerRemediationInstructions": ["string"]
  }
}

Rules:
- actionPlan.items: at least 3 items using priorities Critical / High / Improvement.
- evidence must reference deterministic findings (counts, URLs, statuses) not invented metrics.
- implementationAssets must be developer-ready and commercially useful.
- reportName: concise; prefer "${input.suggestedReportName}" when sensible.
- disclaimer must state the report is based on Athena Website Intelligence technical evidence and is not based on Search Console / PageSpeed / backlink tools.
- briefMode context is "${input.briefMode}".

PRIOR SECTIONS:
${JSON.stringify(input.priorSections)}

ORGANIZATION CONTEXT:
${input.organizationContext}

${input.technicalEvidence}
`.trim();
}
