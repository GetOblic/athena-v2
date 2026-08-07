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
- pageMetadata: OPTIONAL AI overlays only. Include rows for pages where you recommend a title/description/H1 change. Healthy pages may be omitted — Athena merges overlays onto the full deterministic page inventory (technicalCoverage.pages). Do NOT treat sparse pageMetadata as the page inventory.
- recommended titles/descriptions/H1 must be commercially useful and grounded in page + business context.
- weaklyLinkedCandidates: use deterministic weakLinkingCandidates (url + count). Be honest when evidence is thin.
- recommendedLinks: ONLY for source→destination edges present in INTERNAL LINK EDGE SAMPLES (or linkEdgeSamples), and ONLY when both URLs are in the analyzed corpus. AI may improve anchor wording and rationale. AI must NOT invent arbitrary from→to pairs merely because two URLs exist. If evidence is insufficient, return recommendedLinks: [] and say so in linkingEvidence/summary.
- redirectFindings: classify per redirectInterpretationRules. Single-hop final-200 is informational only. Do not recommend optimizing redirect chains unless redirectChainCandidatePages > 0.
- exampleSnippets may include compact JSON-LD examples when schema recommendations are warranted.
- Do not invent HTTP statuses, redirects, schema types, link edges, or alt counts beyond evidence.

PRIOR EXECUTIVE EVALUATION:
${JSON.stringify(input.executiveEvaluation)}

ORGANIZATION CONTEXT:
${input.organizationContext}

${input.technicalEvidence}
`.trim();
}
