/**
 * Contained prompt for Athena "Generate Persona" (review candidate, no persistence).
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const PERSONA_GENERATION_PROMPT_VERSION = "persona_generation_v1";

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
No optional instruction was provided. Independently identify one commercially
useful audience or buyer gap from Athena Brain and existing Personas, then fill it.
`.trim();

  const retryBlock = input.noveltyRetryHint
    ? `
=== NOVELTY RETRY CONSTRAINT ===
A previous candidate was rejected as a superficial duplicate of an existing Persona.
Generate a different Persona that fills a meaningfully distinct gap.

Detected overlap:
${input.noveltyRetryHint}

Do not fix this with only a new name, age, city, synonyms, or rewritten description.
`.trim()
    : "";

  return `
=== OBJECTIVE ===
You are Athena. Generate exactly ONE new Persona candidate for this organization.
The candidate must be a commercially relevant audience or buyer archetype that
fills a meaningful gap relative to Personas already present.

=== ATHENA BRAIN AND CLIENT CONTEXT (TRUSTED FACTUAL CONTEXT) ===
Treat the following as factual organizational context. Do not invent unsupported
business details, markets, offers, credentials, or geography.

${input.brainContextBlock || "No Athena Brain context was available."}

=== EXISTING PERSONAS (BOUNDED SUMMARY) ===
These Personas already exist for this organization. Analyze patterns already
represented and avoid superficial paraphrases.

${input.existingPersonasBlock || "No existing Personas."}

${instructionBlock}

${retryBlock}

=== GENERATION RULES ===
1. Analyze the client's actual business and market context from Athena Brain.
2. Identify customer, buyer, or audience patterns already represented.
3. Identify meaningful gaps where applicable, such as:
   - unrepresented roles
   - different seniority or authority levels
   - different business stages
   - different awareness levels
   - different buying motivations
   - different objections
   - different urgency levels
   - different geographic or market conditions
   - different purchasing behavior
   - underrepresented use cases
4. Generate one Persona that fills one useful gap.
5. Avoid superficial novelty based only on a new name, different age, changed city,
   synonyms, or rewritten descriptions.
6. Remain commercially and strategically relevant to the client.
7. Never force novelty at the expense of factual relevance.
8. Prefer concrete, usable descriptive fields over empty placeholders.
9. Leave a field null or omit it when you lack support rather than inventing.
10. Never set reference_website. Always omit it or leave it null/empty.
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
