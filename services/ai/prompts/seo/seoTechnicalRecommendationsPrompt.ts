import { SEO_TECHNICAL_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoTechnicalSharedConstraints";
import type { SeoTechnicalExecutiveEvaluation } from "@/services/seo/seoReportTypes";

export function buildSeoTechnicalRecommendationsPrompt(input: {
  organizationContext: string;
  technicalEvidence: string;
  executiveEvaluation: SeoTechnicalExecutiveEvaluation;
}): string {
  return `
You are Athena producing Technical SEO recommendations grounded in deterministic evidence.

${SEO_TECHNICAL_SHARED_OUTPUT_RULES}

Return ONLY JSON:
{
  "pageMetadata": [
    {
      "url": "string",
      "currentTitle": "string|null",
      "recommendedTitle": "string|null",
      "currentDescription": "string|null",
      "recommendedDescription": "string|null",
      "h1Observation": "string|null",
      "recommendedH1": "string|null",
      "canonicalObservation": "string|null",
      "robotsObservation": "string|null"
    }
  ],
  "siteArchitecture": {
    "architectureFindings": ["string"],
    "linkingEvidence": ["string"],
    "weaklyLinkedCandidates": ["string"],
    "recommendedLinks": [
      {
        "fromUrl": "string",
        "toUrl": "string",
        "recommendedAnchor": "string",
        "rationale": "string"
      }
    ],
    "summary": "string"
  },
  "contentHtmlFindings": {
    "headingFindings": ["string"],
    "metadataFindings": ["string"],
    "contentSizeFindings": ["string"],
    "structuralRecommendations": ["string"],
    "summary": "string"
  },
  "structuredData": {
    "detectedSchemaEvidence": ["string"],
    "missingOpportunityAssessment": "string",
    "recommendedSchemaTypes": ["string"],
    "implementationGuidance": ["string"],
    "exampleSnippets": ["string"],
    "summary": "string"
  },
  "imageSeo": {
    "altCoverageSummary": "string",
    "missingAltFindings": ["string"],
    "remediationGuidance": ["string"],
    "summary": "string"
  },
  "crawlFindings": {
    "statusFindings": ["string"],
    "redirectFindings": ["string"],
    "canonicalFindings": ["string"],
    "robotsFindings": ["string"],
    "summary": "string"
  }
}

Rules:
- pageMetadata: include analyzed pages that need metadata/H1/canonical/robots attention; omit healthy pages when unnecessary. Prefer actionable rows over noise.
- recommended titles/descriptions/H1 must be commercially useful and grounded in page + business context.
- weaklyLinkedCandidates / recommendedLinks only when deterministic internal-link evidence supports them.
- exampleSnippets may include compact JSON-LD examples when schema recommendations are warranted.
- Do not invent HTTP statuses, redirects, schema types, or alt counts beyond evidence.

PRIOR EXECUTIVE EVALUATION:
${JSON.stringify(input.executiveEvaluation)}

ORGANIZATION CONTEXT:
${input.organizationContext}

${input.technicalEvidence}
`.trim();
}
