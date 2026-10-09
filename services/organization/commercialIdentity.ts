/**
 * Pure commercial-identity text and Prospect → Client handoff.
 * Optional text trims to null. Blank client fields may be filled once.
 * Existing nonblank client values stay. This module does not persist.
 */

export const PROSPECT_COMMERCIAL_FIELDS = [
  "legal_name",
  "address_line2",
  "postal_code",
  "registration_number",
  "tax_identifier",
  "tax_identifier_label",
] as const;

export type ProspectCommercialField = (typeof PROSPECT_COMMERCIAL_FIELDS)[number];

export const ORGANIZATION_COMMERCIAL_FIELDS = [
  "legal_name",
  "address",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "country",
  "phone",
  "business_email",
  "decision_maker",
  "job_title",
  "registration_number",
  "tax_identifier",
  "tax_identifier_label",
] as const;

export type OrganizationCommercialField =
  (typeof ORGANIZATION_COMMERCIAL_FIELDS)[number];

/**
 * Prospect column → organization column.
 * prospects.email becomes organizations.business_email.
 * organizations.name, website, and authentication email are not in this map.
 */
export const PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS = [
  ["legal_name", "legal_name"],
  ["address", "address"],
  ["address_line2", "address_line2"],
  ["city", "city"],
  ["state", "state"],
  ["postal_code", "postal_code"],
  ["country", "country"],
  ["phone", "phone"],
  ["email", "business_email"],
  ["decision_maker", "decision_maker"],
  ["job_title", "job_title"],
  ["registration_number", "registration_number"],
  ["tax_identifier", "tax_identifier"],
  ["tax_identifier_label", "tax_identifier_label"],
] as const satisfies ReadonlyArray<
  readonly [string, OrganizationCommercialField]
>;

export type OrganizationCommercialIdentityInput = Partial<
  Record<OrganizationCommercialField, unknown>
>;

export function normalizeOptionalCommercialText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isBlankCommercialValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  return value.trim().length === 0;
}

/**
 * Fill only blank organization commercial fields from Prospect text.
 * Ignores notes, website, website intelligence, business name, and auth email.
 */
export function buildBlankCommercialIdentityFill(
  source: object | null | undefined,
  target: object | null | undefined,
): Partial<Record<OrganizationCommercialField, string>> {
  const fill: Partial<Record<OrganizationCommercialField, string>> = {};
  const sourceRecord = source as Record<string, unknown> | null | undefined;
  const targetRecord = target as Record<string, unknown> | null | undefined;
  if (!sourceRecord || !targetRecord) return fill;

  for (const [sourceField, targetField] of PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS) {
    if (!isBlankCommercialValue(targetRecord[targetField])) continue;
    const next = normalizeOptionalCommercialText(sourceRecord[sourceField]);
    if (!next) continue;
    fill[targetField] = next;
  }

  return fill;
}
