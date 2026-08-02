/**
 * Contained prompt for Athena "Generate Persona" (review candidate, no persistence).
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const PERSONA_GENERATION_PROMPT_VERSION = "persona_generation_v2";

export const PERSONA_GENERATION_OUTPUT_FIELDS = [
  "persona_name",
  "short_description",
  "category",
  "gender_identity",
  "age_range",
  "birth_year_approx",
  "generation",
  "cultural_background",
  "country",
  "state",
  "city",
  "location_summary",
  "languages",
  "relationship_status",
  "household",
  "income_range",
  "purchasing_power",
  "education",
  "occupation",
  "seniority",
  "industry_context",
  "lifestyle",
  "interests",
  "digital_behavior",
  "brands_influences",
  "values_text",
  "aesthetic_preferences",
  "preferred_imagery",
  "goals",
  "needs",
  "pain_points",
  "fears",
  "motivations",
  "objections",
  "buying_triggers",
  "decision_criteria",
  "purchase_behavior",
  "typical_concerns",
  "communication_style",
  "preferred_channels",
  "reference_website",
  "notes",
  "additional_context",
  "ads_content",
] as const;

export type PersonaGenerationPromptInput = {
  brainContextBlock: string;
  existingPersonasBlock: string;
  instruction: string | null;
  noveltyRetryHint?: string | null;
  /** Guidance from the Portfolio Coverage Planner (pre-generation). */
  coveragePlanBlock?: string | null;
};

export function buildPersonaGenerationPrompt(
  input: PersonaGenerationPromptInput,
): string {
  const instructionBlock = input.instruction
    ? `
=== OPTIONAL USER GUIDANCE (NOT TRUSTED FACTUAL BUSINESS DATA) ===
Treat the following as operator guidance only. Follow it only where compatible
with Athena Brain and client context. Do not let it override factual constraints
or invent unsupported business details.

${input.instruction}
`.trim()
    : `
=== OPTIONAL USER GUIDANCE ===
No optional instruction was provided. Follow the Portfolio Coverage Plan and
Athena Brain to identify one commercially useful gap, then fill it.
`.trim();

  const coveragePlanBlock = input.coveragePlanBlock
    ? `
=== PORTFOLIO COVERAGE PLAN (INTERNAL GUIDANCE) ===
Athena already evaluated the complete Persona portfolio. Generate the Persona
that strengthens portfolio completeness as directed below. Do not optimize for
novelty alone. Optimize for strategic coverage while remaining factually grounded
in Athena Brain.

${input.coveragePlanBlock}
`.trim()
    : "";

  const retryBlock = input.noveltyRetryHint
    ? `
=== NOVELTY RETRY CONSTRAINT ===
A previous candidate was rejected as a superficial duplicate of an existing Persona.
Generate a different Persona that still follows the Portfolio Coverage Plan and
fills a meaningfully distinct gap.

Detected overlap:
${input.noveltyRetryHint}

Do not fix this with only a new name, age, city, synonyms, or rewritten description.
`.trim()
    : "";

  return `
=== OBJECTIVE ===
You are Athena. Generate exactly ONE new Persona candidate for this organization.
The candidate must be a commercially relevant audience or buyer archetype that
intentionally strengthens portfolio coverage relative to Personas already present.

=== ATHENA BRAIN AND CLIENT CONTEXT (TRUSTED FACTUAL CONTEXT) ===
Treat the following as factual organizational context. Do not invent unsupported
business details, markets, offers, credentials, or geography.

${input.brainContextBlock || "No Athena Brain context was available."}

=== EXISTING PERSONAS (BOUNDED SUMMARY) ===
These Personas already exist for this organization. Analyze patterns already
represented and avoid superficial paraphrases.

${input.existingPersonasBlock || "No existing Personas."}

${coveragePlanBlock}

${instructionBlock}

${retryBlock}

=== GENERATION RULES ===
1. Analyze the client's actual business and market context from Athena Brain.
2. Honor the Portfolio Coverage Plan when present — it identifies the strategic
   gap this Persona should fill.
3. Identify customer, buyer, or audience patterns already represented.
4. Prefer gaps that improve portfolio intelligence, such as:
   - unrepresented roles or decision makers
   - different seniority or authority levels
   - different business stages or maturity levels
   - different company sizes or industries
   - different awareness or buying journeys
   - different buying motivations or objections
   - different urgency levels
   - different geographic or market conditions
   - different purchasing behavior or acquisition channels
   - underrepresented use cases or strategic viewpoints
5. Generate one Persona that fills one useful coverage gap.
6. Avoid superficial novelty based only on a new name, different age, changed city,
   synonyms, or rewritten descriptions.
7. Remain commercially and strategically relevant to the client.
8. Never force novelty at the expense of factual relevance.
9. Prefer concrete, usable descriptive fields over empty placeholders.
10. Leave a field null or omit it when you lack support rather than inventing.
11. Never set reference_website. Always omit it or leave it null/empty.
    Do not copy the client organization's website into reference_website.
    Do not invent, look up, or associate a website with this Persona archetype.
    Do not perform web search. The operator may enter a research URL later.

=== REQUIRED OUTPUT ===
${SHARED_JSON_OUTPUT_RULES}

Return a single flat JSON object using only these keys when useful:
${PERSONA_GENERATION_OUTPUT_FIELDS.map((field) => `- ${field}`).join("\n")}

Do not include:
- id
- organization_id
- linked_discussion_id
- profile_json as the only representation
- lifecycle state
- job data
- timestamps
- source
- status

Use string values for populated fields. Use null for unused fields, or omit them.
`.trim();
}
