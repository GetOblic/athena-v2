/** Initial / sole V25 Strategic Asset Blueprint instruction key. */
export const TREND_SOCIAL_PROMPT_CONFIG_KEY = "trend_social_prompt" as const;

/**
 * Deterministic stored output when the active GetOblic instruction is absent
 * or empty. Generation must not invent a substitute trend policy.
 */
export const TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT =
  "[UNAVAILABLE] Trend Social Prompt cannot be produced because the GetOblic Trend Social Prompt instruction is not configured.";

export type StrategicBlueprintInstructionKey =
  typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;

export type ActiveStrategicBlueprintInstruction = {
  key: StrategicBlueprintInstructionKey;
  configured: boolean;
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type TrendSocialPromptConfigProvenance = {
  key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
  revision_id: string | null;
  configured: boolean;
};
