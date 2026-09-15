/**
 * Deterministic provisional @getoblic.com client login identity.
 *
 * Transliteration follows repository NFKD precedent
 * (slugifyHolidayLabel): decompose accents, strip combining marks,
 * drop apostrophes, then keep ASCII [a-z0-9] only.
 *
 * Local parts have no separators so "Joe's Plumbing" → joesplumbing
 * and "Chez René" → chezrene. Do not reuse organization hyphen-slugs:
 * those do not transliterate and would emit chez-ren.
 */

export const GETOBLIC_PROVISIONAL_ACCOUNT_DOMAIN = "getoblic.com";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const APOSTROPHES = /['’]/g;
const NON_ASCII_ALNUM = /[^a-z0-9]+/g;

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * First 8 characters of a UUID — same collision-suffix convention as
 * organizationService slug `${baseSlug}-${userId.slice(0, 8)}`.
 */
export function stableShortProspectId(prospectId: string): string {
  return prospectId.trim().toLowerCase().slice(0, 8);
}

export function compactProspectId(prospectId: string): string {
  return prospectId.trim().toLowerCase().replace(/-/g, "");
}

/**
 * ASCII-safe email local-part from a business name.
 * Empty when the name has no usable characters after normalization.
 */
export function normalizeProvisionalEmailLocalPart(businessName: string): string {
  return businessName
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(NON_ASCII_ALNUM, "")
    .trim();
}

export function buildGetoblicAccountEmail(localPart: string): string {
  return normalizeEmailAddress(
    `${localPart}@${GETOBLIC_PROVISIONAL_ACCOUNT_DOMAIN}`,
  );
}

export function emptyLocalPartFallback(prospectId: string): string {
  return `prospect${stableShortProspectId(prospectId)}`;
}

export function collisionLocalPartFallback(
  localPart: string,
  prospectId: string,
): string {
  const shortId = stableShortProspectId(prospectId);
  if (!localPart) {
    return `prospect${compactProspectId(prospectId)}`;
  }
  return `${localPart}-${shortId}`;
}

export type ProvisionalClientAccountEmailCandidates = {
  primary: string;
  fallback: string;
  localPart: string;
};

/**
 * Deterministic primary + collision-safe fallback identities.
 * Primary uses the normalized name when non-empty; otherwise a
 * prospect-id fallback so the local part is never empty.
 */
export function buildProvisionalClientAccountEmailCandidates(input: {
  businessName: string;
  prospectId: string;
}): ProvisionalClientAccountEmailCandidates {
  const localPart = normalizeProvisionalEmailLocalPart(input.businessName);
  const primaryLocal = localPart || emptyLocalPartFallback(input.prospectId);
  return {
    localPart: primaryLocal,
    primary: buildGetoblicAccountEmail(primaryLocal),
    fallback: buildGetoblicAccountEmail(
      collisionLocalPartFallback(localPart, input.prospectId),
    ),
  };
}

export function isGetoblicProvisionalAccountEmail(email: string): boolean {
  const normalized = normalizeEmailAddress(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) {
    return false;
  }
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return (
    domain === GETOBLIC_PROVISIONAL_ACCOUNT_DOMAIN &&
    local.length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)?$/.test(local)
  );
}
