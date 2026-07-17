/**
 * Allowlisted GetOblic Type values for Prospect Details metadata.
 * Stored exactly as written. Empty/null clears the field.
 */

export const PROSPECT_GETOBLIC_TYPES = [
  "small-business",
  "pet_grooming",
  "tattoo-parlors",
  "chiropractor",
  "nail-salons",
  "health-wellness",
  "pet_services",
  "hair-salons",
  "massages",
  "barbershop",
  "real-estate",
  "esotericism",
  "podcasters",
] as const;

export type ProspectGetOblicType = (typeof PROSPECT_GETOBLIC_TYPES)[number];

export function isProspectGetOblicType(
  value: string,
): value is ProspectGetOblicType {
  return (PROSPECT_GETOBLIC_TYPES as readonly string[]).includes(value);
}

/**
 * Normalize an optional GetOblic Type for persistence.
 * - null/undefined/blank → null
 * - allowlisted value → exact stored string
 * - anything else → throws
 */
export function normalizeOptionalProspectGetOblicType(
  value?: string | null,
): ProspectGetOblicType | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!isProspectGetOblicType(trimmed)) {
    throw new Error("Invalid GetOblic Type.");
  }
  return trimmed;
}
