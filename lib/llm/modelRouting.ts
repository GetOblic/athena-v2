import type { AthenaGenerationKind } from "@/lib/reasoningProfiles";

export type AthenaLLMRole = "analysis" | "premiumStrategicOutput";

export type AthenaLLMStage =
  | "discussion_analysis"
  | "opportunity_generation"
  | "executive_briefing"
  | "deployment_assets"
  | "strategic_blueprint";

/** Additional pipeline stages routed through the analysis role until split further. */
export type AthenaExtendedLLMStage =
  | AthenaLLMStage
  | "community_intelligence"
  | "production_intelligence"
  | "identity_profile"
  | "generic_review";

export type LLMModelRoleConfig = {
  model: string;
  reasoningEffort: string;
};

export type ResolvedModelRoute = {
  stage: AthenaExtendedLLMStage;
  role: AthenaLLMRole;
  model: string;
  reasoningEffort: string;
};

const DEFAULT_ANALYSIS_MODEL = "google/gemini-2.5-flash";
const DEFAULT_PREMIUM_MODEL = "anthropic/claude-sonnet-4";

/** Fallback for calls without an explicit Athena stage (legacy / unspecified). */
export function resolveOpenRouterFallbackModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_PREMIUM_MODEL;
}

export function getLLMModelRoles(): Record<AthenaLLMRole, LLMModelRoleConfig> {
  const premiumFallback = resolveOpenRouterFallbackModel();

  return {
    analysis: {
      model:
        process.env.OPENROUTER_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL,
      reasoningEffort:
        process.env.OPENROUTER_ANALYSIS_REASONING_EFFORT?.trim() || "medium",
    },
    premiumStrategicOutput: {
      model:
        process.env.OPENROUTER_PREMIUM_MODEL?.trim() || premiumFallback,
      reasoningEffort:
        process.env.OPENROUTER_PREMIUM_REASONING_EFFORT?.trim() || "high",
    },
  };
}

export function getLLMStageRoutes(): Record<
  AthenaLLMStage,
  LLMModelRoleConfig
> {
  const roles = getLLMModelRoles();

  return {
    discussion_analysis: roles.analysis,
    opportunity_generation: roles.analysis,
    executive_briefing: roles.analysis,
    deployment_assets: roles.analysis,
    strategic_blueprint: roles.premiumStrategicOutput,
  };
}

const STAGE_TO_ROLE: Record<AthenaLLMStage, AthenaLLMRole> = {
  discussion_analysis: "analysis",
  opportunity_generation: "analysis",
  executive_briefing: "analysis",
  deployment_assets: "analysis",
  strategic_blueprint: "premiumStrategicOutput",
};

const EXTENDED_STAGE_ROLE: Record<
  Exclude<AthenaExtendedLLMStage, AthenaLLMStage>,
  AthenaLLMRole
> = {
  community_intelligence: "analysis",
  production_intelligence: "analysis",
  identity_profile: "analysis",
  generic_review: "analysis",
};

export function resolveAthenaStageFromGenerationKind(
  kind: AthenaGenerationKind,
): AthenaExtendedLLMStage {
  switch (kind) {
    case "discussion_analysis":
      return "discussion_analysis";
    case "executive_briefing":
      return "executive_briefing";
    case "opportunity_review":
      return "opportunity_generation";
    case "strategic_blueprint":
      return "strategic_blueprint";
    case "community_intelligence":
      return "community_intelligence";
    case "production_intelligence":
      return "production_intelligence";
    case "identity_profile":
      return "identity_profile";
    case "generic_review":
      return "generic_review";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function resolveRoleForStage(
  stage: AthenaExtendedLLMStage,
): AthenaLLMRole {
  if (stage in STAGE_TO_ROLE) {
    return STAGE_TO_ROLE[stage as AthenaLLMStage];
  }

  return EXTENDED_STAGE_ROLE[stage as Exclude<AthenaExtendedLLMStage, AthenaLLMStage>];
}

export function resolveModelForStage(
  stage: AthenaExtendedLLMStage,
): ResolvedModelRoute {
  const role = resolveRoleForStage(stage);
  const config = getLLMModelRoles()[role];

  return {
    stage,
    role,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  };
}

export function resolveModelForGenerationKind(
  kind: AthenaGenerationKind,
): ResolvedModelRoute {
  return resolveModelForStage(resolveAthenaStageFromGenerationKind(kind));
}

export function logAthenaLlmRouting(
  route: ResolvedModelRoute,
  reasoning?: string | null,
): void {
  const reasoningLabel = reasoning ?? route.reasoningEffort;
  console.log(
    `[Athena LLM] stage=${route.stage} role=${route.role} model=${route.model} reasoning=${reasoningLabel}`,
  );
}

/** @deprecated Use getLLMModelRoles() */
export const LLM_MODEL_ROLES = getLLMModelRoles();

/** @deprecated Use getLLMStageRoutes() */
export const LLM_STAGE_ROUTES = getLLMStageRoutes();
