/**
 * Deterministic, presentation-only scores for the two independent
 * Build Visibility analysis types.
 *
 * Content Coverage Score belongs ONLY to generationType = "intelligence".
 * On-page Technical Completeness belongs ONLY to generationType = "technical".
 *
 * These scores are never combined, averaged, or rolled into a parent SEO score.
 * No LLM, no API, no persistence, no side effects.
 */

import {
  isSeoIntelligencePackage,
  isSeoTechnicalPackage,
  type SeoContentCoverageAnalysis,
  type SeoReportPackage,
} from "@/services/seo/seoReportTypes";

export type ContentCoverageInventory = {
  wellCovered?: readonly unknown[] | null;
  weakCoverage?: readonly unknown[] | null;
  missingCoverage?: readonly unknown[] | null;
};

export type TechnicalCoveragePercents = {
  titleCoveragePercent?: number | null;
  descriptionCoveragePercent?: number | null;
  h1CoveragePercent?: number | null;
  canonicalCoveragePercent?: number | null;
  schemaCoveragePercent?: number | null;
  imageAltCoveragePercent?: number | null;
};

export type SeoCompletenessBand =
  | "needsAttention"
  | "developing"
  | "strong"
  | "excellentCoverage";

const TECHNICAL_COVERAGE_KEYS = [
  "titleCoveragePercent",
  "descriptionCoveragePercent",
  "h1CoveragePercent",
  "canonicalCoveragePercent",
  "schemaCoveragePercent",
  "imageAltCoveragePercent",
] as const satisfies ReadonlyArray<keyof TechnicalCoveragePercents>;

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function inventoryCount(value: readonly unknown[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function isValidCoveragePercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Content Coverage Score (Visibility Strategy only).
 *
 * well * 1.0 + weak * 0.5 + missing * 0.0, divided by total items, * 100.
 * Returns null when the inventory is empty or missing — never a fake 0.
 */
export function computeContentCoverageScore(
  inventory: ContentCoverageInventory | null | undefined,
): number | null {
  if (!inventory) return null;

  const well = inventoryCount(inventory.wellCovered);
  const weak = inventoryCount(inventory.weakCoverage);
  const missing = inventoryCount(inventory.missingCoverage);
  const total = well + weak + missing;
  if (total === 0) return null;

  return clampScore(((well * 1 + weak * 0.5 + missing * 0) / total) * 100);
}

/**
 * On-page Technical Completeness (Website Technical Health only).
 *
 * Rounded arithmetic mean of available coverage percentages.
 * Nulls are ignored. Numeric 0 remains part of the mean.
 * Returns null when no valid percentages exist — never a fake 0.
 */
export function computeTechnicalCompletenessScore(
  coverage: TechnicalCoveragePercents | null | undefined,
): number | null {
  if (!coverage) return null;

  const values = TECHNICAL_COVERAGE_KEYS.map((key) => coverage[key]).filter(
    isValidCoveragePercent,
  );
  if (values.length === 0) return null;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clampScore(mean);
}

/**
 * Maps the stored intelligence contentCoverage inventory onto the 3-bucket
 * well / weak / missing model. Uses the existing service-coverage arrays:
 * wellCoveredServices, weaklyCoveredServices, missingServices.
 */
export function contentCoverageInventoryFromAnalysis(
  coverage: SeoContentCoverageAnalysis | null | undefined,
): ContentCoverageInventory | null {
  if (!coverage) return null;
  return {
    wellCovered: coverage.wellCoveredServices,
    weakCoverage: coverage.weaklyCoveredServices,
    missingCoverage: coverage.missingServices,
  };
}

export function contentCoverageInventoryFromPackage(
  pkg: SeoReportPackage | null | undefined,
): ContentCoverageInventory | null {
  if (!isSeoIntelligencePackage(pkg)) return null;
  return contentCoverageInventoryFromAnalysis(pkg.contentCoverage);
}

export function technicalCoverageFromPackage(
  pkg: SeoReportPackage | null | undefined,
): TechnicalCoveragePercents | null {
  if (!isSeoTechnicalPackage(pkg)) return null;
  return pkg.technicalCoverage.coverage;
}

export function computeContentCoverageScoreFromPackage(
  pkg: SeoReportPackage | null | undefined,
): number | null {
  return computeContentCoverageScore(contentCoverageInventoryFromPackage(pkg));
}

export function computeTechnicalCompletenessScoreFromPackage(
  pkg: SeoReportPackage | null | undefined,
): number | null {
  return computeTechnicalCompletenessScore(technicalCoverageFromPackage(pkg));
}

export function seoCompletenessBand(score: number): SeoCompletenessBand {
  if (score <= 39) return "needsAttention";
  if (score <= 69) return "developing";
  if (score <= 89) return "strong";
  return "excellentCoverage";
}
