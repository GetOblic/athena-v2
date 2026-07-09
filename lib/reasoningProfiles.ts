export type ReasoningProfileType = "FAST" | "BALANCED" | "EXECUTIVE" | "STRATEGIC";

export type OpenRouterReasoningPayload = {
  reasoning: {
    effort: "low" | "medium" | "high" | "xhigh";
  };
};

/** Logical output types — used for profile mapping and validation. */
export type AthenaOutputType =
  | "community_reply"
  | "private_message"
  | "follow_up_reply"
  | "cta"
  | "social_post"
  | "image_prompt"
  | "executive_intelligence"
  | "opportunity_review"
  | "executive_briefing"
  | "strategic_asset_blueprint"
  | "pdf_prompt";

/** Bundled LLM call sites (one OpenRouter request per kind). */
export type AthenaGenerationKind =
  | "discussion_analysis"
  | "executive_briefing"
  | "opportunity_review"
  | "strategic_blueprint"
  | "community_intelligence"
  | "production_intelligence"
  | "identity_profile"
  | "generic_review";

const REASONING_EFFORT: Record<
  ReasoningProfileType,
  OpenRouterReasoningPayload["reasoning"]["effort"]
> = {
  FAST: "low",
  BALANCED: "medium",
  EXECUTIVE: "high",
  STRATEGIC: "xhigh",
};

/** Outputs produced inside each bundled LLM call (for validation/docs). */
export const BUNDLED_OUTPUT_TYPES: Record<AthenaGenerationKind, AthenaOutputType[]> = {
  discussion_analysis: [
    "executive_intelligence",
    "community_reply",
    "private_message",
    "social_post",
    "follow_up_reply",
    "cta",
  ],
  executive_briefing: [
    "executive_briefing",
    "community_reply",
    "private_message",
    "social_post",
    "follow_up_reply",
    "cta",
  ],
  opportunity_review: [
    "opportunity_review",
    "executive_briefing",
    "community_reply",
    "private_message",
    "social_post",
    "follow_up_reply",
    "cta",
  ],
  strategic_blueprint: [
    "strategic_asset_blueprint",
    "pdf_prompt",
    "image_prompt",
    "social_post",
  ],
  community_intelligence: [],
  production_intelligence: [],
  identity_profile: [],
  generic_review: [],
};

export function getReasoningProfile(
  type: ReasoningProfileType,
): OpenRouterReasoningPayload {
  return {
    reasoning: {
      effort: REASONING_EFFORT[type],
    },
  };
}

export function getReasoningProfileForOutputType(
  outputType: AthenaOutputType,
): ReasoningProfileType {
  switch (outputType) {
    case "community_reply":
    case "private_message":
      return "FAST";
    case "follow_up_reply":
    case "cta":
    case "social_post":
    case "image_prompt":
      return "BALANCED";
    case "executive_intelligence":
    case "opportunity_review":
    case "executive_briefing":
      return "EXECUTIVE";
    case "strategic_asset_blueprint":
    case "pdf_prompt":
      return "STRATEGIC";
    default: {
      const exhaustive: never = outputType;
      return exhaustive;
    }
  }
}

/**
 * Resolves reasoning for a bundled OpenRouter call.
 * Uses the highest effort required by any output in that call.
 */
export function getReasoningProfileForGeneration(
  kind: AthenaGenerationKind,
): ReasoningProfileType {
  switch (kind) {
    case "discussion_analysis":
    case "executive_briefing":
    case "opportunity_review":
      return "EXECUTIVE";
    case "strategic_blueprint":
      return "STRATEGIC";
    case "identity_profile":
      return "FAST";
    case "community_intelligence":
    case "production_intelligence":
    case "generic_review":
      return "BALANCED";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function resolveReasoningAttachment(input: {
  model: string;
  profile: ReasoningProfileType;
}): { attach: boolean; effort: OpenRouterReasoningPayload["reasoning"]["effort"] | null } {
  const effort = REASONING_EFFORT[input.profile];
  if (!isReasoningSupportedByModel(input.model)) {
    return { attach: false, effort: null };
  }
  return { attach: true, effort };
}

export function isReasoningUnsupportedError(
  status: number,
  errorText: string,
): boolean {
  if (status !== 400 && status !== 422) {
    return false;
  }
  const normalized = errorText.toLowerCase();
  return (
    normalized.includes("reasoning") ||
    normalized.includes("effort") ||
    normalized.includes("unsupported parameter")
  );
}

export function isReasoningSupportedByModel(model: string): boolean {
  const override = process.env.OPENROUTER_REASONING_ENABLED?.trim().toLowerCase();
  if (override === "false" || override === "0") {
    return false;
  }
  if (override === "true" || override === "1") {
    return true;
  }

  const normalized = model.toLowerCase();
  return (
    /(^|\/)o[134](-|$|-mini|-preview)/.test(normalized) ||
    /deepseek-r1|deepseek\/r1/.test(normalized) ||
    /reasoning|thinking/.test(normalized) ||
    /gpt-5|gpt-oss|gpt-4\.1/.test(normalized) ||
    /claude.*(opus|sonnet|4)/.test(normalized) ||
    /anthropic\/claude-3\.7/.test(normalized)
  );
}

export const ALL_OUTPUT_TYPES: AthenaOutputType[] = [
  "community_reply",
  "private_message",
  "follow_up_reply",
  "cta",
  "social_post",
  "image_prompt",
  "executive_intelligence",
  "opportunity_review",
  "executive_briefing",
  "strategic_asset_blueprint",
  "pdf_prompt",
];

export const ALL_GENERATION_KINDS: AthenaGenerationKind[] = [
  "discussion_analysis",
  "executive_briefing",
  "opportunity_review",
  "strategic_blueprint",
  "community_intelligence",
  "production_intelligence",
  "identity_profile",
  "generic_review",
];
