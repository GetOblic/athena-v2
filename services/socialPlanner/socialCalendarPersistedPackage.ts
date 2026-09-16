/**
 * Read-time parsers for persisted Social Calendar JSON.
 * Fail safely — do not re-run generation-time intelligence validation.
 */

import { SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import type { SocialCalendarEvergreenPackageV1 } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import type { SocialCalendarGeneratedPackage } from "@/services/socialPlanner/generation/socialCalendarPackageUnion";
import { SOCIAL_CALENDAR_PERIOD_DAYS } from "@/services/socialPlanner/socialCalendarTypes";
import { validateSocialCalendarContext } from "@/services/socialPlanner/calendar/validateSocialCalendarContext";
import type { SocialCalendarContext } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";

export class PersistedSocialCalendarPackageError extends Error {
  readonly code = "MALFORMED_PERSISTED_PACKAGE";

  constructor(message = "Stored Social Calendar package is malformed.") {
    super(message);
    this.name = "PersistedSocialCalendarPackageError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePersistedPeriod(value: Record<string, unknown>): void {
  if (!isRecord(value.period)) {
    throw new PersistedSocialCalendarPackageError();
  }
  if (
    typeof value.period.periodStart !== "string" ||
    typeof value.period.periodEnd !== "string" ||
    !Array.isArray(value.period.dates) ||
    value.period.dates.length !== SOCIAL_CALENDAR_PERIOD_DAYS
  ) {
    throw new PersistedSocialCalendarPackageError();
  }
  if (typeof value.strategySummary !== "string") {
    throw new PersistedSocialCalendarPackageError();
  }
  if (typeof value.whyThisWeekWorks !== "string") {
    throw new PersistedSocialCalendarPackageError();
  }
}

export function parsePersistedSocialCalendarPackage(
  value: unknown,
): SocialCalendarGeneratedPackage {
  if (!isRecord(value)) {
    throw new PersistedSocialCalendarPackageError();
  }
  parsePersistedPeriod(value);
  if (value.schemaVersion === SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION) {
    if (!Array.isArray(value.assets) || value.assets.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
      throw new PersistedSocialCalendarPackageError();
    }
    return value as unknown as SocialCalendarPackageV1;
  }
  if (value.schemaVersion === SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION) {
    if (!Array.isArray(value.days) || value.days.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
      throw new PersistedSocialCalendarPackageError();
    }
    return value as unknown as SocialCalendarEvergreenPackageV1;
  }
  throw new PersistedSocialCalendarPackageError(
    "Stored Social Calendar package schema is unsupported.",
  );
}

export function tryParsePersistedSocialCalendarPackage(
  value: unknown,
): SocialCalendarGeneratedPackage | null {
  try {
    return parsePersistedSocialCalendarPackage(value);
  } catch {
    return null;
  }
}

export function tryParsePersistedSocialCalendarContext(
  value: unknown,
): SocialCalendarContext | null {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return null;
  }
  try {
    return validateSocialCalendarContext(value as SocialCalendarContext);
  } catch {
    return null;
  }
}

export const SOCIAL_CALENDAR_WHY_THIS_WEEK_SUMMARY_MAX_CHARS = 180;

export type SocialCalendarPackageSummary = {
  strategySummary: string | null;
  whyThisWeekWorks: string | null;
  assetCount: number;
  assetTypes: string[];
  families: string[];
};

export function summarizePersistedSocialCalendarPackage(
  value: unknown,
): SocialCalendarPackageSummary {
  const empty: SocialCalendarPackageSummary = {
    strategySummary: null,
    whyThisWeekWorks: null,
    assetCount: 0,
    assetTypes: [],
    families: [],
  };

  if (!isRecord(value)) return empty;

  const strategySummary =
    typeof value.strategySummary === "string" && value.strategySummary.trim()
      ? value.strategySummary.trim()
      : null;

  let whyThisWeekWorks: string | null = null;
  if (typeof value.whyThisWeekWorks === "string" && value.whyThisWeekWorks.trim()) {
    const trimmed = value.whyThisWeekWorks.trim();
    whyThisWeekWorks =
      trimmed.length > SOCIAL_CALENDAR_WHY_THIS_WEEK_SUMMARY_MAX_CHARS
        ? `${trimmed.slice(0, SOCIAL_CALENDAR_WHY_THIS_WEEK_SUMMARY_MAX_CHARS).trimEnd()}…`
        : trimmed;
  }

  const days = Array.isArray(value.days) ? value.days : [];
  const assets = Array.isArray(value.assets) ? value.assets : days;
  const assetTypes: string[] = [];
  const families: string[] = [];
  for (const asset of assets) {
    if (!isRecord(asset)) continue;
    const formatKey =
      typeof asset.evergreenFormat === "string"
        ? asset.evergreenFormat
        : typeof asset.assetType === "string"
          ? asset.assetType
          : null;
    if (formatKey && !assetTypes.includes(formatKey)) {
      assetTypes.push(formatKey);
    }
    const fingerprint = isRecord(asset.creativeFingerprint)
      ? asset.creativeFingerprint
      : null;
    if (
      fingerprint &&
      typeof fingerprint.family === "string" &&
      !families.includes(fingerprint.family)
    ) {
      families.push(fingerprint.family);
    }
  }

  return {
    strategySummary,
    whyThisWeekWorks,
    assetCount: assets.length,
    assetTypes,
    families,
  };
}
