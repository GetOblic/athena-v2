/**
 * Discriminated Social Calendar package union.
 * Historical Daily v1 remains the only readable Daily schema.
 */

import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  type SocialCalendarPackageV1,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
  type SocialCalendarEvergreenDayV1,
  type SocialCalendarEvergreenPackageV1,
} from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

export type SocialCalendarGeneratedPackage =
  | SocialCalendarPackageV1
  | SocialCalendarEvergreenPackageV1;

export function isSocialCalendarDailyPackage(
  value: unknown,
): value is SocialCalendarPackageV1 {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion ===
      SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION
  );
}

export function isSocialCalendarEvergreenPackage(
  value: unknown,
): value is SocialCalendarEvergreenPackageV1 {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion ===
      SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION
  );
}

export function socialCalendarPackageMatchesPlannerKind(
  socialPackage: unknown,
  plannerKind: "daily_social" | "evergreen",
): boolean {
  if (plannerKind === "evergreen") {
    return isSocialCalendarEvergreenPackage(socialPackage);
  }
  return isSocialCalendarDailyPackage(socialPackage);
}

export type SocialCalendarWeekItem = {
  date: string;
  weekday: SocialCalendarAssetV1["weekday"] | SocialCalendarEvergreenDayV1["weekday"];
  formatKey: string;
  title: string;
  concept: string;
  preview: string;
  kind: "daily_social" | "evergreen";
};

export function socialCalendarWeekItems(
  socialPackage: SocialCalendarGeneratedPackage,
): SocialCalendarWeekItem[] {
  if (isSocialCalendarEvergreenPackage(socialPackage)) {
    return socialPackage.days.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      formatKey: day.evergreenFormat,
      title: day.title,
      concept: day.concept,
      preview: day.concept,
      kind: "evergreen",
    }));
  }
  return socialPackage.assets.map((asset) => ({
    date: asset.date,
    weekday: asset.weekday,
    formatKey: asset.assetType,
    title: asset.concept,
    concept: asset.concept,
    preview: asset.hook ?? asset.concept,
    kind: "daily_social",
  }));
}
