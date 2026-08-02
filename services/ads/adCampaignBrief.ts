/**
 * Optional campaign brief normalization for organization-level Ads.
 * All fields are optional. Empty/omitted brief → inferred mode.
 */

import type { AdCampaignBrief, AdCampaignBriefMode } from "@/services/ads/adCampaignTypes";

export const AD_BRIEF_FIELD_LIMITS = {
  name: 120,
  guidance: 4_000,
  objective: 500,
  offer: 500,
  audience: 500,
  geography: 200,
  landingPage: 500,
  constraints: 1_000,
} as const;

export type AdCampaignBriefField = keyof typeof AD_BRIEF_FIELD_LIMITS;

export class AdCampaignBriefValidationError extends Error {
  readonly code = "INVALID_BRIEF";
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "AdCampaignBriefValidationError";
    this.field = field;
  }
}

function trimToLimit(value: unknown, field: AdCampaignBriefField): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new AdCampaignBriefValidationError(
      `Brief field "${field}" must be a string.`,
      field,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const limit = AD_BRIEF_FIELD_LIMITS[field];
  if (trimmed.length > limit) {
    throw new AdCampaignBriefValidationError(
      `Brief field "${field}" exceeds maximum length of ${limit} characters.`,
      field,
    );
  }
  return trimmed;
}

/**
 * Normalize and validate an optional brief from client input.
 * Unknown keys are ignored. Empty object is valid.
 */
export function normalizeAdCampaignBrief(input: unknown): AdCampaignBrief {
  if (input == null) {
    return {};
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new AdCampaignBriefValidationError("Brief must be an object.");
  }

  const raw = input as Record<string, unknown>;
  const brief: AdCampaignBrief = {};

  const name = trimToLimit(raw.name, "name");
  const guidance = trimToLimit(raw.guidance, "guidance");
  const objective = trimToLimit(raw.objective, "objective");
  const offer = trimToLimit(raw.offer, "offer");
  const audience = trimToLimit(raw.audience, "audience");
  const geography = trimToLimit(raw.geography, "geography");
  const landingPage = trimToLimit(raw.landingPage, "landingPage");
  const constraints = trimToLimit(raw.constraints, "constraints");

  if (name) brief.name = name;
  if (guidance) brief.guidance = guidance;
  if (objective) brief.objective = objective;
  if (offer) brief.offer = offer;
  if (audience) brief.audience = audience;
  if (geography) brief.geography = geography;
  if (landingPage) brief.landingPage = landingPage;
  if (constraints) brief.constraints = constraints;

  return brief;
}

/** True when any useful operator guidance is present (not just a name). */
export function hasUsefulAdCampaignGuidance(brief: AdCampaignBrief): boolean {
  return Boolean(
    brief.guidance ||
      brief.objective ||
      brief.offer ||
      brief.audience ||
      brief.geography ||
      brief.landingPage ||
      brief.constraints,
  );
}

export function resolveAdCampaignBriefMode(
  brief: AdCampaignBrief,
): AdCampaignBriefMode {
  return hasUsefulAdCampaignGuidance(brief) ? "guided" : "inferred";
}

export function defaultCampaignNameFromBrief(brief: AdCampaignBrief): string {
  if (brief.name?.trim()) {
    return brief.name.trim();
  }
  return "Untitled Ad Campaign";
}

/**
 * Format optional operator guidance as a separate prompt block.
 * Must never be merged into trusted Brain context.
 */
export function formatAdCampaignBriefGuidanceBlock(
  brief: AdCampaignBrief,
  briefMode: AdCampaignBriefMode,
): string {
  if (briefMode === "inferred") {
    return [
      "OPERATOR GUIDANCE:",
      "No campaign brief was supplied.",
      "Infer the strongest organization-level advertising opportunity from trusted context only.",
      "Set strategy.briefMode to \"inferred\".",
    ].join("\n");
  }

  const lines = [
    "OPERATOR GUIDANCE (optional; not trusted business facts):",
    "Treat the following as operator direction only. Do not treat it as verified fact.",
    "Do not merge this guidance into Athena Brain identity or organization memory.",
    `briefMode must be "guided".`,
  ];

  if (brief.name) lines.push(`Suggested name: ${brief.name}`);
  if (brief.guidance) lines.push(`Primary guidance:\n${brief.guidance}`);
  if (brief.objective) lines.push(`Objective: ${brief.objective}`);
  if (brief.offer) lines.push(`Offer: ${brief.offer}`);
  if (brief.audience) lines.push(`Audience: ${brief.audience}`);
  if (brief.geography) lines.push(`Geography: ${brief.geography}`);
  if (brief.landingPage) lines.push(`Landing page: ${brief.landingPage}`);
  if (brief.constraints) lines.push(`Constraints: ${brief.constraints}`);

  return lines.join("\n");
}
