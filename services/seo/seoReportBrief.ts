/**
 * Optional report brief normalization for organization-level SEO Intelligence.
 * All fields are optional. Empty/omitted brief → inferred mode.
 */

import type {
  SeoReportBrief,
  SeoReportBriefMode,
} from "@/services/seo/seoReportTypes";

export const SEO_BRIEF_FIELD_LIMITS = {
  name: 120,
  guidance: 4_000,
  focusArea: 500,
  geography: 200,
  constraints: 1_000,
} as const;

export type SeoReportBriefField = keyof typeof SEO_BRIEF_FIELD_LIMITS;

export class SeoReportBriefValidationError extends Error {
  readonly code = "INVALID_BRIEF";
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "SeoReportBriefValidationError";
    this.field = field;
  }
}

function trimToLimit(value: unknown, field: SeoReportBriefField): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new SeoReportBriefValidationError(
      `Brief field "${field}" must be a string.`,
      field,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const limit = SEO_BRIEF_FIELD_LIMITS[field];
  if (trimmed.length > limit) {
    throw new SeoReportBriefValidationError(
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
export function normalizeSeoReportBrief(input: unknown): SeoReportBrief {
  if (input == null) {
    return {};
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new SeoReportBriefValidationError("Brief must be an object.");
  }

  const raw = input as Record<string, unknown>;
  const brief: SeoReportBrief = {};

  const name = trimToLimit(raw.name, "name");
  const guidance = trimToLimit(raw.guidance, "guidance");
  const focusArea = trimToLimit(raw.focusArea, "focusArea");
  const geography = trimToLimit(raw.geography, "geography");
  const constraints = trimToLimit(raw.constraints, "constraints");

  if (name) brief.name = name;
  if (guidance) brief.guidance = guidance;
  if (focusArea) brief.focusArea = focusArea;
  if (geography) brief.geography = geography;
  if (constraints) brief.constraints = constraints;

  return brief;
}

/** True when any useful operator guidance is present (not just a name). */
export function hasUsefulSeoReportGuidance(brief: SeoReportBrief): boolean {
  return Boolean(
    brief.guidance || brief.focusArea || brief.geography || brief.constraints,
  );
}

export function resolveSeoReportBriefMode(
  brief: SeoReportBrief,
): SeoReportBriefMode {
  return hasUsefulSeoReportGuidance(brief) ? "guided" : "inferred";
}

export function defaultReportNameFromBrief(brief: SeoReportBrief): string {
  if (brief.name?.trim()) {
    return brief.name.trim();
  }
  return "Untitled SEO Report";
}

/**
 * Format optional operator guidance as a separate prompt block.
 * Must never be merged into trusted Brain / Deep Scrape context.
 */
export function formatSeoReportBriefGuidanceBlock(
  brief: SeoReportBrief,
  briefMode: SeoReportBriefMode,
): string {
  if (briefMode === "inferred") {
    return [
      "OPERATOR GUIDANCE:",
      "No SEO brief was supplied.",
      "Infer the strongest organization-level SEO Intelligence report from trusted Athena context only.",
      "Set briefMode to \"inferred\".",
    ].join("\n");
  }

  const lines = [
    "OPERATOR GUIDANCE (optional; not trusted business facts):",
    "Treat the following as operator direction only. Do not treat it as verified fact.",
    "Do not merge this guidance into Athena Brain identity, Deep Website Intelligence, or organization memory.",
    `briefMode must be "guided".`,
  ];

  if (brief.name) lines.push(`Suggested name: ${brief.name}`);
  if (brief.guidance) lines.push(`Primary guidance:\n${brief.guidance}`);
  if (brief.focusArea) lines.push(`Focus area: ${brief.focusArea}`);
  if (brief.geography) lines.push(`Geography: ${brief.geography}`);
  if (brief.constraints) lines.push(`Constraints: ${brief.constraints}`);

  return lines.join("\n");
}
