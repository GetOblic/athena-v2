/**
 * Authoritative organization-language contract.
 * Shared by server components, API routes, workers, and later localization/generation.
 * Does not infer language from website, Persona, geography, browser, or cookies.
 */

export const ORGANIZATION_LANGUAGES = ["en", "fr", "es", "it", "de", "pt"] as const;

export type OrganizationLanguage = (typeof ORGANIZATION_LANGUAGES)[number];

export const DEFAULT_ORGANIZATION_LANGUAGE: OrganizationLanguage = "en";

export const ORGANIZATION_LANGUAGE_LABELS: Record<OrganizationLanguage, string> =
  {
    en: "English",
    fr: "Français",
    es: "Español",
    it: "Italiano",
    de: "Deutsch",
    pt: "Português",
  };

const ORGANIZATION_LANGUAGE_SET = new Set<string>(ORGANIZATION_LANGUAGES);

export class OrganizationLanguageInvalidError extends Error {
  constructor(message = "Unsupported organization language.") {
    super(message);
    this.name = "OrganizationLanguageInvalidError";
  }
}

function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function isOrganizationLanguage(
  value: unknown,
): value is OrganizationLanguage {
  const normalized = normalizeLanguageCode(value);
  return (
    normalized !== null && ORGANIZATION_LANGUAGE_SET.has(normalized)
  );
}

/**
 * Fail-closed parse for external or mutation input.
 * Rejects missing, empty, and unsupported values.
 */
export function parseOrganizationLanguage(value: unknown): OrganizationLanguage {
  const normalized = normalizeLanguageCode(value);
  if (normalized && ORGANIZATION_LANGUAGE_SET.has(normalized)) {
    return normalized as OrganizationLanguage;
  }
  throw new OrganizationLanguageInvalidError();
}

/**
 * Compatibility resolve for persisted/legacy values.
 * Falls back to English when the column is missing (pre-migration) or invalid.
 */
export function resolveOrganizationLanguageValue(
  value: unknown,
): OrganizationLanguage {
  const normalized = normalizeLanguageCode(value);
  if (normalized && ORGANIZATION_LANGUAGE_SET.has(normalized)) {
    return normalized as OrganizationLanguage;
  }
  return DEFAULT_ORGANIZATION_LANGUAGE;
}

export function organizationLanguageLabel(
  language: OrganizationLanguage,
): string {
  return ORGANIZATION_LANGUAGE_LABELS[language];
}
