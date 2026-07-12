import {
  getReasoningProfileForGeneration,
  type AthenaGenerationKind,
} from "@/lib/reasoningProfiles";
import { resolveModelForStage } from "@/lib/llm/modelRouting";
import {
  EXECUTIVE_ROUTING_PROFILE_PREMIUM_V2,
  type ExecutiveVersionReasoningEffort,
} from "@/services/executiveVersions/executiveVersionTypes";

function formatModelLabel(model: string): string {
  const normalized = model.toLowerCase();

  if (normalized.includes("gemini-2.5-flash")) {
    return "Gemini 2.5 Flash";
  }
  if (normalized.includes("claude-sonnet-4") || normalized.includes("sonnet-4")) {
    return "Claude Sonnet 4";
  }
  if (normalized.includes("claude-opus-4")) {
    return "Claude Opus 4";
  }
  if (normalized.includes("o3")) {
    return "OpenAI o3";
  }
  if (normalized.includes("gpt-4")) {
    return "GPT-4";
  }

  const segments = model.split("/");
  const shortName = segments[segments.length - 1] ?? model;
  return shortName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const PIPELINE_STAGES = [
  "discussion_analysis",
  "executive_briefing",
  "deployment_assets",
  "strategic_blueprint",
] as const;

const STAGE_TO_GENERATION_KIND: Record<
  (typeof PIPELINE_STAGES)[number],
  AthenaGenerationKind
> = {
  discussion_analysis: "discussion_analysis",
  executive_briefing: "executive_briefing",
  deployment_assets: "strategic_blueprint",
  strategic_blueprint: "strategic_blueprint",
};

export function buildExecutiveVersionGenerationMetadata(): {
  models_used: string;
  routing_profile: string;
  reasoning_profile: string;
  reasoning_effort: ExecutiveVersionReasoningEffort;
} {
  const analysisModel = resolveModelForStage("discussion_analysis").model;
  const premiumModel = resolveModelForStage("strategic_blueprint").model;

  const modelLabels = [formatModelLabel(analysisModel)];
  if (premiumModel !== analysisModel) {
    modelLabels.push(formatModelLabel(premiumModel));
  }

  const reasoningProfiles = new Set<string>();
  const reasoning_effort: ExecutiveVersionReasoningEffort = {};

  for (const stage of PIPELINE_STAGES) {
    const kind = STAGE_TO_GENERATION_KIND[stage];
    const profile = getReasoningProfileForGeneration(kind);
    reasoningProfiles.add(profile);
    reasoning_effort[stage] = profile;
  }

  return {
    models_used: modelLabels.join(" + "),
    routing_profile: EXECUTIVE_ROUTING_PROFILE_PREMIUM_V2,
    reasoning_profile: [...reasoningProfiles].join(" + "),
    reasoning_effort,
  };
}
