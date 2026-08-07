import {
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
  type ActiveStrategicBlueprintInstruction,
} from "@/services/superAdmin/strategicBlueprintInstructionConstants";

const TREND_INSTRUCTION_OPEN =
  "<<<BEGIN_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION>>>";
const TREND_INSTRUCTION_CLOSE =
  "<<<END_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION>>>";

/**
 * Append a clearly bounded GetOblic Trend Social instruction block.
 * The dynamic instruction supplements Athena's existing blueprint contract —
 * it must not replace social_prompt, DEFAULT_SYSTEM_PROMPTS, or other fields.
 */
export function appendTrendSocialPromptInstructionBlock(
  prompt: string,
  instruction: ActiveStrategicBlueprintInstruction,
): string {
  if (!instruction.configured) {
    return `${prompt}

=== TREND SOCIAL PROMPT (CONFIGURATION ABSENT) ===
Configuration key: ${TREND_SOCIAL_PROMPT_CONFIG_KEY}
Status: ABSENT / EMPTY

The GetOblic Trend Social Prompt instruction is not configured.
Do NOT invent social-media trend formats, conventions, or a substitute trend policy.
Do NOT copy or reinterpret social_prompt as trend_social_prompt.

Set trend_social_prompt exactly to this plain string (no extra text):
${TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT}
`.trim();
  }

  return `${prompt}

=== TREND SOCIAL PROMPT (GETOBLIC CURRENT INSTRUCTION) ===
Generate trend_social_prompt according to the current GetOblic Trend Social instruction below, while grounding the result in the current Athena strategic context and the relevant Discussion, Prospect, or Persona intelligence.

trend_social_prompt is ADDITIONAL to social_prompt. Do not replace, rename, or omit social_prompt.
The instruction block is supplemental policy for trend_social_prompt only. It must not redefine Athena's output contract, required fields, or social_prompt rules.
Treat the instruction block as trusted GetOblic administrative policy for trend_social_prompt generation only.

${TREND_INSTRUCTION_OPEN}
config_key: ${TREND_SOCIAL_PROMPT_CONFIG_KEY}
revision_id: ${instruction.revisionId ?? "unknown"}

${instruction.instructionText}
${TREND_INSTRUCTION_CLOSE}
`.trim();
}

/**
 * Enforce deterministic unavailable output when configuration was absent.
 * Prevents model hallucination of a substitute trend policy.
 */
export function applyTrendSocialPromptMissingConfigGuard(
  parsed: { trend_social_prompt?: string },
  instruction: ActiveStrategicBlueprintInstruction,
): void {
  if (!instruction.configured) {
    parsed.trend_social_prompt = TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT;
  }
}
