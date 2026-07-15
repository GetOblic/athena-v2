/**
 * Strip previously generated Deployment Asset copy from prompt inputs.
 * Returns new objects; never mutates live DB rows or Executive Version snapshots.
 */

export type SanitizedDeploymentAssetGenerationInput<
  TAnalysis extends Record<string, unknown> = Record<string, unknown>,
  TOpportunity extends Record<string, unknown> = Record<string, unknown>,
  TBriefing extends Record<string, unknown> = Record<string, unknown>,
> = {
  analysis: TAnalysis;
  opportunity: TOpportunity | null | undefined;
  briefing: TBriefing | null | undefined;
  removedFields: string[];
};

const DEPLOYMENT_RAW_JSON_KEYS = [
  "deployment_assets",
  "deploymentAssets",
  "suggested_cta",
  "recommended_response",
  "cta",
] as const;

function cloneJson<T>(value: T): T {
  if (value == null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeAnalysisRawJson(
  rawJson: unknown,
  removedFields: string[],
): Record<string, unknown> | null {
  if (rawJson == null) {
    return null;
  }
  if (typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return null;
  }

  const next = { ...(rawJson as Record<string, unknown>) };
  for (const key of DEPLOYMENT_RAW_JSON_KEYS) {
    if (key in next) {
      delete next[key];
      removedFields.push(`analysis.raw_json.${key}`);
    }
  }
  return next;
}

/**
 * Remove generated deployment-copy fields from analysis / opportunity / briefing
 * objects used only for Deployment Assets prompt assembly.
 */
export function sanitizeDeploymentAssetGenerationInput<
  TAnalysis extends Record<string, unknown>,
  TOpportunity extends Record<string, unknown>,
  TBriefing extends Record<string, unknown>,
>(input: {
  analysis: TAnalysis;
  opportunity?: TOpportunity | null;
  briefing?: TBriefing | null;
}): SanitizedDeploymentAssetGenerationInput<TAnalysis, TOpportunity, TBriefing> {
  const removedFields: string[] = [];

  const analysis = cloneJson(input.analysis);

  if ("suggested_cta" in analysis) {
    if (String((analysis as Record<string, unknown>).suggested_cta ?? "").length > 0) {
      removedFields.push("analysis.suggested_cta");
    }
    (analysis as Record<string, unknown>).suggested_cta = "";
  }

  if ("raw_json" in analysis) {
    (analysis as Record<string, unknown>).raw_json = sanitizeAnalysisRawJson(
      (analysis as Record<string, unknown>).raw_json,
      removedFields,
    );
  }

  let opportunity = input.opportunity;
  if (opportunity && typeof opportunity === "object") {
    opportunity = cloneJson(opportunity);
    if ("suggested_cta" in opportunity) {
      if (String((opportunity as Record<string, unknown>).suggested_cta ?? "").length > 0) {
        removedFields.push("opportunity.suggested_cta");
      }
      (opportunity as Record<string, unknown>).suggested_cta = "";
    }
  }

  let briefing = input.briefing;
  if (briefing && typeof briefing === "object") {
    briefing = cloneJson(briefing);
    if ("recommended_response" in briefing) {
      if (
        String((briefing as Record<string, unknown>).recommended_response ?? "")
          .length > 0
      ) {
        removedFields.push("briefing.recommended_response");
      }
      (briefing as Record<string, unknown>).recommended_response = "";
    }
    if ("cta" in briefing) {
      if (String((briefing as Record<string, unknown>).cta ?? "").length > 0) {
        removedFields.push("briefing.cta");
      }
      (briefing as Record<string, unknown>).cta = "";
    }
    if ("raw_json" in briefing) {
      const briefingRaw = (briefing as Record<string, unknown>).raw_json;
      if (briefingRaw && typeof briefingRaw === "object" && !Array.isArray(briefingRaw)) {
        const nextBriefingRaw = { ...(briefingRaw as Record<string, unknown>) };
        if ("deployment_assets" in nextBriefingRaw) {
          delete nextBriefingRaw.deployment_assets;
          removedFields.push("briefing.raw_json.deployment_assets");
        }
        (briefing as Record<string, unknown>).raw_json = nextBriefingRaw;
      }
    }
  }

  return {
    analysis,
    opportunity,
    briefing,
    removedFields,
  };
}

export function logDeploymentAssetPromptSanitization(input: {
  sourceType: "prospect" | "discussion";
  discussionId?: string | null;
  organizationId?: string | null;
  triggerType?: string | null;
  regenerationRunId?: string | null;
  removedFields: string[];
}): void {
  if (input.removedFields.length === 0) {
    return;
  }

  console.log(
    JSON.stringify({
      prefix: "[ATHENA_DEPLOYMENT_PROMPT_SANITIZE]",
      event: "prior_deployment_context_sanitized",
      sourceType: input.sourceType,
      discussionId: input.discussionId ?? null,
      organizationId: input.organizationId ?? null,
      triggerType: input.triggerType ?? null,
      regenerationRunId: input.regenerationRunId ?? null,
      removedFields: input.removedFields,
    }),
  );
}
