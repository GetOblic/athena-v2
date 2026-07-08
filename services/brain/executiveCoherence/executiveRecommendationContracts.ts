import type { ExecutiveRecommendation } from "@/services/brain/executiveReasoningTypes";

export type ExecutiveRecommendationContext = {
  initiativeLabel?: string;
  rationale?: string;
  businessOutcome?: string;
  targetAudience?: string;
  assetType?: string;
  whyNow?: string;
};

export function createDefaultExecutiveRecommendation(
  context: ExecutiveRecommendationContext = {},
): ExecutiveRecommendation {
  const initiativeLabel = context.initiativeLabel?.trim() || "the selected initiative";
  const rationale =
    context.rationale?.trim() ||
    "Aligned with executive initiative selection and marketing strategy.";

  return {
    whyThisAsset:
      context.assetType?.trim()
        ? `${context.assetType} implements ${initiativeLabel}. ${rationale}`
        : `Strategic asset implements ${initiativeLabel}. ${rationale}`,
    whyNow: context.whyNow?.trim() || "Current discussion signals justify immediate executive action.",
    expectedBusinessOutcome:
      context.businessOutcome?.trim() ||
      "Advance buyer confidence and improve opportunity win rate.",
    targetAudience:
      context.targetAudience?.trim() ||
      "Primary buyer audience from current executive intelligence.",
    conversionMechanism: "Executive briefing and deployment follow-up.",
    estimatedEffort: "medium",
    estimatedReusePotential: "medium",
    strategicRationale: rationale,
  };
}

export function ensureExecutiveRecommendation(
  recommendation: ExecutiveRecommendation | null | undefined,
  context: ExecutiveRecommendationContext = {},
): ExecutiveRecommendation {
  const defaults = createDefaultExecutiveRecommendation(context);

  if (!recommendation || typeof recommendation !== "object") {
    return defaults;
  }

  return {
    ...defaults,
    ...recommendation,
    whyThisAsset:
      typeof recommendation.whyThisAsset === "string" && recommendation.whyThisAsset.trim()
        ? recommendation.whyThisAsset
        : defaults.whyThisAsset,
    whyNow:
      typeof recommendation.whyNow === "string" && recommendation.whyNow.trim()
        ? recommendation.whyNow
        : defaults.whyNow,
    expectedBusinessOutcome:
      typeof recommendation.expectedBusinessOutcome === "string" &&
      recommendation.expectedBusinessOutcome.trim()
        ? recommendation.expectedBusinessOutcome
        : defaults.expectedBusinessOutcome,
    targetAudience:
      typeof recommendation.targetAudience === "string" && recommendation.targetAudience.trim()
        ? recommendation.targetAudience
        : defaults.targetAudience,
    conversionMechanism:
      typeof recommendation.conversionMechanism === "string" &&
      recommendation.conversionMechanism.trim()
        ? recommendation.conversionMechanism
        : defaults.conversionMechanism,
    estimatedEffort: recommendation.estimatedEffort ?? defaults.estimatedEffort,
    estimatedReusePotential:
      recommendation.estimatedReusePotential ?? defaults.estimatedReusePotential,
    strategicRationale:
      typeof recommendation.strategicRationale === "string" &&
      recommendation.strategicRationale.trim()
        ? recommendation.strategicRationale
        : defaults.strategicRationale,
  };
}

export function resolveWhyThisAsset(
  recommendation: ExecutiveRecommendation | null | undefined,
  context: ExecutiveRecommendationContext = {},
): string {
  return ensureExecutiveRecommendation(recommendation, context).whyThisAsset;
}

export function formatExecutiveRecommendationForPrompt(
  recommendation: ExecutiveRecommendation | null | undefined,
  context: ExecutiveRecommendationContext = {},
): string {
  const resolved = ensureExecutiveRecommendation(recommendation, context);

  return [
    "EXECUTIVE RECOMMENDATION:",
    `- Why this asset: ${resolved.whyThisAsset}`,
    `- Why now: ${resolved.whyNow}`,
    `- Expected business outcome: ${resolved.expectedBusinessOutcome}`,
    `- Target audience: ${resolved.targetAudience}`,
    `- Conversion mechanism: ${resolved.conversionMechanism}`,
    `- Estimated effort: ${resolved.estimatedEffort}`,
    `- Reuse potential: ${resolved.estimatedReusePotential}`,
    `- Strategic rationale: ${resolved.strategicRationale}`,
  ].join("\n");
}
