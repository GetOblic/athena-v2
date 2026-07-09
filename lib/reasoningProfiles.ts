export type ReasoningProfileType = "FAST" | "BALANCED" | "EXECUTIVE" | "STRATEGIC";

export type OpenRouterReasoningPayload = {
  reasoning: {
    effort: "low" | "medium" | "high" | "xhigh";
  };
};

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

export function getReasoningProfile(
  type: ReasoningProfileType,
): OpenRouterReasoningPayload {
  return {
    reasoning: {
      effort: REASONING_EFFORT[type],
    },
  };
}

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
    /gpt-5|gpt-oss/.test(normalized) ||
    /claude.*(4|opus|sonnet).*thinking/.test(normalized)
  );
}
