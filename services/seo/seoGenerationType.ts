/**
 * Central SEO generationType normalization.
 * Historical reports without generationType are treated as "intelligence".
 */

export const SEO_GENERATION_TYPES = ["intelligence", "technical"] as const;

export type SeoGenerationType = (typeof SEO_GENERATION_TYPES)[number];

export const DEFAULT_SEO_GENERATION_TYPE: SeoGenerationType = "intelligence";

export function isSeoGenerationType(value: unknown): value is SeoGenerationType {
  return (
    typeof value === "string" &&
    (SEO_GENERATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Normalize generationType from brief_json, package_json, or API input.
 * Missing / unknown → "intelligence" (historical compatibility).
 */
export function normalizeSeoGenerationType(value: unknown): SeoGenerationType {
  if (isSeoGenerationType(value)) {
    return value;
  }
  return DEFAULT_SEO_GENERATION_TYPE;
}

/**
 * Resolve generationType from a brief and/or package object.
 * Prefer package.generationType when present, else brief.generationType,
 * else historical default "intelligence".
 */
export function resolveSeoGenerationType(input: {
  brief?: unknown;
  package?: unknown;
}): SeoGenerationType {
  const pkg =
    input.package &&
    typeof input.package === "object" &&
    !Array.isArray(input.package)
      ? (input.package as Record<string, unknown>).generationType
      : undefined;
  if (isSeoGenerationType(pkg)) {
    return pkg;
  }

  const brief =
    input.brief &&
    typeof input.brief === "object" &&
    !Array.isArray(input.brief)
      ? (input.brief as Record<string, unknown>).generationType
      : undefined;
  return normalizeSeoGenerationType(brief);
}

export function seoGenerationTypeLabel(type: SeoGenerationType): string {
  return type === "technical" ? "Technical SEO" : "SEO Intelligence";
}
