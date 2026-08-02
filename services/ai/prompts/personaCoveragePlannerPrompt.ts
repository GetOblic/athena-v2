/**
 * Contained prompt for Persona Portfolio Coverage Planner (pre-generation only).
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const PERSONA_COVERAGE_PLANNER_PROMPT_VERSION =
  "persona_coverage_planner_v1";

export type PersonaCoveragePlannerPromptInput = {
  brainContextBlock: string;
  portfolioBlock: string;
  instruction: string | null;
};

export function buildPersonaCoveragePlannerPrompt(
  input: PersonaCoveragePlannerPromptInput,
): string {
  const instructionBlock = input.instruction
    ? `
=== OPTIONAL USER GUIDANCE (NOT TRUSTED FACTUAL BUSINESS DATA) ===
Treat the following as operator guidance only. Honor it only where it improves
portfolio completeness and remains compatible with Athena Brain.

${input.instruction}
`.trim()
    : `
=== OPTIONAL USER GUIDANCE ===
No optional instruction was provided. Independently choose the coverage gap that
most improves portfolio intelligence.
`.trim();

  return `
=== OBJECTIVE ===
You are Athena's Persona Portfolio Coverage Planner.
You already have the Personas listed below for this organization.
Evaluate the portfolio as a whole before any new Persona is generated.

Do not optimize for novelty alone.
Optimize for portfolio completeness and strategic coverage.

Identify where strategic coverage is weak, including when relevant:
- audience concentration
- missing audience types
- missing buying journeys
- missing business maturity levels
- missing company sizes
- missing industries
- missing decision makers
- missing geographies
- missing organizational roles
- missing acquisition channels
- missing strategic viewpoints

Determine which additional Persona would most improve the organization's
overall intelligence. Remain commercially relevant to Athena Brain.

=== ATHENA BRAIN AND CLIENT CONTEXT (TRUSTED FACTUAL CONTEXT) ===
${input.brainContextBlock || "No Athena Brain context was available."}

=== COMPLETE PERSONA PORTFOLIO ===
${input.portfolioBlock || "No existing Personas for this organization."}

${instructionBlock}

=== PLANNING RULES ===
1. Reason qualitatively over the full portfolio. Do not invent scoring systems.
2. Prefer gaps that expand strategic intelligence, not superficial demographic variety.
3. Prefer commercially relevant buyer/audience archetypes grounded in Athena Brain.
4. If the portfolio is empty, recommend a foundational Persona that best anchors
   the client's real market.
5. If the portfolio is concentrated (for example many executives, many SMB owners,
   or many marketing roles), recommend a Persona that diversifies that concentration.
6. Do not propose a near-duplicate of an existing Persona.
7. Keep explanation suitable for operator review: one or two concise sentences.
8. Keep generationGuidance concrete enough to steer Persona generation.

=== REQUIRED OUTPUT ===
${SHARED_JSON_OUTPUT_RULES}

Return a single flat JSON object with exactly these keys:
- planningSummary: short internal summary of portfolio strengths and weak coverage
- generationGuidance: concrete guidance for the Persona that should be generated next
- explanation: operator-facing rationale beginning from why this Persona was selected

Do not include scores, percentages, charts, embeddings, or nested objects.
`.trim();
}
