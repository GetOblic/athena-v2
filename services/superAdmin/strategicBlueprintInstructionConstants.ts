import { ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY } from "@/services/estimate/athenaEstimateTypes";

/** Initial / V25 Strategic Asset Blueprint instruction key. */
export const TREND_SOCIAL_PROMPT_CONFIG_KEY = "trend_social_prompt" as const;

/**
 * Re-export Estimate pricing methodology key so the governed-instruction
 * allowlist has a single import surface. Source of truth remains Estimate types.
 */
export { ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY };

/**
 * Deterministic stored output when the active GetOblic instruction is absent
 * or empty. Generation must not invent a substitute trend policy.
 */
export const TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT =
  "[UNAVAILABLE] Trend Social Prompt cannot be produced because the GetOblic Trend Social Prompt instruction is not configured.";

/**
 * Bounded allowlist of product config keys stored in
 * getoblic_strategic_blueprint_instructions.
 * Arbitrary untrusted keys must not silently create uncontrolled products.
 */
export const GOVERNED_INSTRUCTION_CONFIG_KEYS = [
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
] as const;

export type GovernedInstructionConfigKey =
  (typeof GOVERNED_INSTRUCTION_CONFIG_KEYS)[number];

/** @deprecated Prefer GovernedInstructionConfigKey — kept for V25 call sites. */
export type StrategicBlueprintInstructionKey = GovernedInstructionConfigKey;

export function isGovernedInstructionConfigKey(
  value: string,
): value is GovernedInstructionConfigKey {
  return (GOVERNED_INSTRUCTION_CONFIG_KEYS as readonly string[]).includes(
    value,
  );
}

export type ActiveGovernedInstruction = {
  key: GovernedInstructionConfigKey;
  configured: boolean;
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Alias preserved for Trend Social / V25 call sites. */
export type ActiveStrategicBlueprintInstruction = ActiveGovernedInstruction;

export type TrendSocialPromptConfigProvenance = {
  key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
  revision_id: string | null;
  configured: boolean;
};
