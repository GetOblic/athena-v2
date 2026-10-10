/**
 * Deterministic seven-day merge for a single generated replacement asset.
 * The six unaffected source assets are copied. Strategy text is kept.
 */

import { isDeepStrictEqual } from "node:util";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  type SocialCalendarAssetV1,
  type SocialCalendarPackageV1,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

export function isSingleDayPackageShapedOutput(
  raw: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(raw.assets) ||
    raw.schemaVersion === SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION ||
    typeof raw.strategySummary === "string" ||
    typeof raw.whyThisWeekWorks === "string"
  );
}

export function isSingleDayAssetShapedOutput(
  raw: Record<string, unknown>,
): boolean {
  return typeof raw.assetType === "string" && typeof raw.date === "string";
}

/**
 * Place the replacement on the target date and copy every other source asset
 * in the original period order. Does not mutate the source package.
 */
export function buildMergedSingleDayPackageRaw(input: {
  sourcePackage: SocialCalendarPackageV1;
  targetDate: string;
  replacementAsset: Record<string, unknown>;
}): Record<string, unknown> {
  const sourceByDate = new Map(
    input.sourcePackage.assets.map((asset) => [asset.date, asset]),
  );
  const assets = input.sourcePackage.period.dates.map((date) => {
    if (date === input.targetDate) {
      return {
        ...input.replacementAsset,
        date: input.targetDate,
      };
    }
    const sourceAsset = sourceByDate.get(date);
    if (!sourceAsset) {
      return { date };
    }
    return structuredClone(sourceAsset);
  });

  return {
    schemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    strategySummary: input.sourcePackage.strategySummary,
    whyThisWeekWorks: input.sourcePackage.whyThisWeekWorks,
    assets,
  };
}

export function preservedAssetsMatchSource(input: {
  sourcePackage: SocialCalendarPackageV1;
  mergedPackage: SocialCalendarPackageV1;
  preservedDates: readonly string[];
}): boolean {
  const sourceByDate = new Map(
    input.sourcePackage.assets.map((asset) => [asset.date, asset]),
  );
  const mergedByDate = new Map(
    input.mergedPackage.assets.map((asset) => [asset.date, asset]),
  );
  return input.preservedDates.every((date) => {
    const source = sourceByDate.get(date);
    const merged = mergedByDate.get(date);
    return Boolean(source && merged && isDeepStrictEqual(source, merged));
  });
}

export type PreservedAssetSnapshot = Pick<
  SocialCalendarAssetV1,
  | "date"
  | "assetType"
  | "contentArchetype"
  | "primaryObjective"
  | "audience"
  | "personaIds"
  | "topic"
  | "angle"
  | "hook"
  | "concept"
  | "productionSpec"
  | "socialCopy"
  | "cta"
>;

export function snapshotPreservedAssets(
  sourcePackage: SocialCalendarPackageV1,
  preservedDates: readonly string[],
): PreservedAssetSnapshot[] {
  const allowed = new Set(preservedDates);
  return sourcePackage.assets
    .filter((asset) => allowed.has(asset.date))
    .map((asset) => ({
      date: asset.date,
      assetType: asset.assetType,
      contentArchetype: asset.contentArchetype,
      primaryObjective: asset.primaryObjective,
      audience: asset.audience,
      personaIds: [...asset.personaIds],
      topic: asset.topic,
      angle: asset.angle,
      hook: asset.hook,
      concept: asset.concept,
      productionSpec: structuredClone(asset.productionSpec),
      socialCopy: asset.socialCopy,
      cta: asset.cta,
    }));
}
