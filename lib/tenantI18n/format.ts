import type { OrganizationLanguage } from "@/services/organizationLanguage";

/**
 * UX-only formatting locales. Does not affect geography, jurisdiction,
 * timezone, or Social Planner geographic context.
 */
const FORMATTING_LOCALES = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  de: "de-DE",
  pt: "pt-PT",
} as const satisfies Record<OrganizationLanguage, string>;

export type TenantFormattingLocale =
  (typeof FORMATTING_LOCALES)[OrganizationLanguage];

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** Pre-L3.10.1 LearningTimeline fields: month, day, hour, minute. No year. */
const TIMELINE_DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function toFormattingLocale(
  language: OrganizationLanguage,
): TenantFormattingLocale {
  return FORMATTING_LOCALES[language] ?? FORMATTING_LOCALES.en;
}

/**
 * Parse date-only YYYY-MM-DD as a local calendar date to avoid UTC
 * midnight rolling the displayed day backward in western timezones.
 */
function resolveDateInput(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY_RE.exec(trimmed);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  return new Date(trimmed);
}

function formatWithLocale(
  value: Date | string,
  language: OrganizationLanguage,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = resolveDateInput(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(toFormattingLocale(language), options).format(
    date,
  );
}

export function formatTenantDate(
  value: Date | string,
  language: OrganizationLanguage,
): string {
  return formatWithLocale(value, language, DATE_FORMAT);
}

export function formatTenantDateTime(
  value: Date | string,
  language: OrganizationLanguage,
): string {
  return formatWithLocale(value, language, DATETIME_FORMAT);
}

/**
 * Learning Timeline presentation: tenant locale with the pre-L3.10.1
 * information shape (month, day, hour, minute). Does not add a year and
 * does not change stored timestamps or timezone source.
 */
export function formatTenantTimelineDateTime(
  value: Date | string,
  language: OrganizationLanguage,
): string {
  return formatWithLocale(value, language, TIMELINE_DATETIME_FORMAT);
}

/**
 * Timeline presentation from an already-resolved tenant locale.
 * Same semantic fields as formatTenantTimelineDateTime.
 */
export function formatTenantTimelineDateTimeLocale(
  value: Date | string,
  locale: TenantFormattingLocale,
): string {
  const date = resolveDateInput(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, TIMELINE_DATETIME_FORMAT).format(
    date,
  );
}
