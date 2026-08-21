/**
 * Presentation helper for Social Planner history model labels.
 * Reads frozen package_json.generationMetadata.stages[].model only.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function formatSocialPlannerModelLabel(model: string): string {
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

export function deriveSocialCalendarModelsUsed(packageJson: unknown): string | null {
  if (!isRecord(packageJson)) return null;

  const metadata = packageJson.generationMetadata;
  if (!isRecord(metadata)) return null;

  const stages = metadata.stages;
  if (!Array.isArray(stages) || stages.length === 0) return null;

  const seen = new Set<string>();
  const labels: string[] = [];

  for (const stage of stages) {
    if (!isRecord(stage)) continue;
    const model = typeof stage.model === "string" ? stage.model.trim() : "";
    if (!model || seen.has(model)) continue;
    seen.add(model);
    labels.push(formatSocialPlannerModelLabel(model));
  }

  return labels.length > 0 ? labels.join(" + ") : null;
}
