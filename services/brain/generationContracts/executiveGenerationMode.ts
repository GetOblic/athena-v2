/** Narrow generation mode for Strategic Blueprint + Deployment Assets only. */

export type ExecutiveGenerationMode = "standard" | "think_differently";

export function normalizeExecutiveGenerationMode(
  value: unknown,
): ExecutiveGenerationMode {
  return value === "think_differently" ? "think_differently" : "standard";
}

export const THINK_DIFFERENTLY_PIPELINE =
  "strategic_blueprint_and_deployment_assets" as const;

export type ThinkDifferentlyJobProgress = {
  generationMode: "think_differently";
  pipeline: typeof THINK_DIFFERENTLY_PIPELINE;
};

export function isThinkDifferentlyJobProgress(
  progress: Record<string, unknown> | null | undefined,
): progress is ThinkDifferentlyJobProgress {
  if (!progress || typeof progress !== "object") return false;
  return (
    progress.generationMode === "think_differently" &&
    progress.pipeline === THINK_DIFFERENTLY_PIPELINE
  );
}

export function buildThinkDifferentlyJobProgress(): ThinkDifferentlyJobProgress {
  return {
    generationMode: "think_differently",
    pipeline: THINK_DIFFERENTLY_PIPELINE,
  };
}
