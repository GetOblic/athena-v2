import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";

export const SEO_CUSTOMER_INTENT_PROMPT_VERSION = "seo_customer_intent_v1";

export function buildSeoCustomerIntentPrompt(input: {
  organizationContext: string;
  executiveAssessment: unknown;
  contentCoverage: unknown;
}): string {
  return `
OBJECTIVE:
Produce the Customer Intent Analysis section of an Athena SEO Intelligence report.

PROMPT VERSION:
${SEO_CUSTOMER_INTENT_PROMPT_VERSION}

PRIOR SECTIONS (stay consistent):
${JSON.stringify(
  {
    executiveAssessment: input.executiveAssessment,
    contentCoverage: input.contentCoverage,
  },
  null,
  2,
)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "representedIntents": string[],
  "missingIntents": [
    {
      "intent": string,
      "source": string,
      "websiteGap": string,
      "recommendation": string
    }
  ],
  "painPointGaps": string[],
  "buyerIntentSummary": string,
  "athenaEvidence": string[]
}

FIELD RULES:
- Compare website content against Personas, Communities, Discussions, and buyer intent signals.
- Identify where customer intent is NOT represented on the website.
- missingIntents: at least 2 objects. source must name Athena evidence (e.g. "Persona: Operators", "Community discussion").
- Do not invent personas, discussions, or pain points that are not in context.

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}
