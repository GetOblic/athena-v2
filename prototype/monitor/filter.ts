import type { ExtractedFamily, NormalizedProduct } from "./types";

/**
 * Generic threshold. Adapters do not know the cutoff.
 * The same extracted records can be filtered again without fetching.
 */
export function applyVariationThreshold(
  families: readonly ExtractedFamily[],
  minDistinctColorPatterns: number,
): NormalizedProduct[] {
  if (!Number.isInteger(minDistinctColorPatterns) || minDistinctColorPatterns < 1) {
    throw new Error("INVALID_THRESHOLD");
  }
  return families.map((family) => ({
    ...family,
    thresholdMatch: family.distinctVariationCount >= minDistinctColorPatterns,
  }));
}

export function matchingFamilies(products: readonly NormalizedProduct[]): NormalizedProduct[] {
  return products.filter((product) => product.thresholdMatch);
}

export function collapseByFamilyId(families: readonly ExtractedFamily[]): {
  families: ExtractedFamily[];
  duplicatesRemoved: number;
} {
  const seen = new Map<string, ExtractedFamily>();
  const unkeyed: ExtractedFamily[] = [];
  let duplicatesRemoved = 0;
  for (const family of families) {
    if (!family.productFamilyId) {
      unkeyed.push(family);
      continue;
    }
    if (seen.has(family.productFamilyId)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.set(family.productFamilyId, family);
  }
  return {
    families: [...seen.values(), ...unkeyed],
    duplicatesRemoved,
  };
}
