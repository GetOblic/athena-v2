/**
 * Bounded Ready-calendar Social Memory loader (L5).
 * Injectable history source — tests never touch a live database.
 */

import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_ASSET_FAMILIES,
  SOCIAL_PLANNER_ASSET_TYPES,
  SOCIAL_PLANNER_CONTENT_ARCHETYPES,
  SOCIAL_PLANNER_CTA_TYPES,
  SOCIAL_PLANNER_HOOK_TYPES,
  SOCIAL_PLANNER_OBJECTIVES,
  type SocialPlannerAssetFingerprint,
  type SocialPlannerWeekFingerprint,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { buildWeekFingerprint } from "@/services/socialPlanner/generation/socialPlannerCreativeFingerprint";
import { SocialPlannerSocialMemoryError } from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_HISTORY_SELECT,
  SOCIAL_PLANNER_HISTORY_TABLE,
  SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoricalAsset,
  type SocialPlannerHistoricalWeek,
  type SocialPlannerHistoryLoader,
  type SocialPlannerHistoryRow,
  type SocialPlannerSocialMemoryDiagnostics,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import { socialPlannerRecencyWeight } from "@/services/socialPlanner/diversity/socialPlannerSimilarity";
import { composeSocialPlannerMemoryText } from "@/services/socialPlanner/diversity/socialPlannerDiversityPrompt";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isAssetFingerprint(value: unknown): value is SocialPlannerAssetFingerprint {
  if (!isRecord(value)) return false;
  return (
    typeof value.assetType === "string" &&
    (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes(value.assetType) &&
    typeof value.family === "string" &&
    (SOCIAL_PLANNER_ASSET_FAMILIES as readonly string[]).includes(value.family) &&
    typeof value.contentArchetype === "string" &&
    (SOCIAL_PLANNER_CONTENT_ARCHETYPES as readonly string[]).includes(
      value.contentArchetype,
    ) &&
    typeof value.topic === "string" &&
    typeof value.angle === "string" &&
    typeof value.hookType === "string" &&
    (SOCIAL_PLANNER_HOOK_TYPES as readonly string[]).includes(value.hookType) &&
    (value.hookNormalized === null || typeof value.hookNormalized === "string") &&
    typeof value.objective === "string" &&
    (SOCIAL_PLANNER_OBJECTIVES as readonly string[]).includes(value.objective) &&
    typeof value.audience === "string" &&
    isStringArray(value.personaIds) &&
    typeof value.ctaType === "string" &&
    (SOCIAL_PLANNER_CTA_TYPES as readonly string[]).includes(value.ctaType) &&
    typeof value.visualStyle === "string" &&
    isStringArray(value.calendarAnchorIds)
  );
}

function isWeekFingerprint(value: unknown): value is SocialPlannerWeekFingerprint {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.assetTypes) &&
    isStringArray(value.families) &&
    isStringArray(value.objectives) &&
    isStringArray(value.archetypes) &&
    isStringArray(value.personaIds) &&
    isStringArray(value.topics) &&
    isStringArray(value.calendarAnchorIds)
  );
}

function compareHistoryRows(
  left: SocialPlannerHistoryRow,
  right: SocialPlannerHistoryRow,
): number {
  if (left.created_at !== right.created_at) {
    return left.created_at < right.created_at ? 1 : -1;
  }
  return left.id < right.id ? 1 : -1;
}

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function extractHistoricalAssets(packageJson: unknown): {
  assets: Array<{ date: string; fingerprint: SocialPlannerAssetFingerprint }>;
  weekFingerprint: SocialPlannerWeekFingerprint | null;
  malformed: boolean;
  unsupportedSchema: boolean;
  invalidFingerprints: number;
} {
  if (!isRecord(packageJson)) {
    return {
      assets: [],
      weekFingerprint: null,
      malformed: true,
      unsupportedSchema: false,
      invalidFingerprints: 0,
    };
  }

  if (
    packageJson.schemaVersion != null &&
    packageJson.schemaVersion !== SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION
  ) {
    return {
      assets: [],
      weekFingerprint: null,
      malformed: false,
      unsupportedSchema: true,
      invalidFingerprints: 0,
    };
  }

  if (!Array.isArray(packageJson.assets)) {
    return {
      assets: [],
      weekFingerprint: null,
      malformed: true,
      unsupportedSchema: false,
      invalidFingerprints: 0,
    };
  }

  const assets: Array<{ date: string; fingerprint: SocialPlannerAssetFingerprint }> =
    [];
  let invalidFingerprints = 0;
  for (const entry of packageJson.assets) {
    if (!isRecord(entry) || typeof entry.date !== "string") {
      invalidFingerprints += 1;
      continue;
    }
    if (!isAssetFingerprint(entry.creativeFingerprint)) {
      invalidFingerprints += 1;
      continue;
    }
    assets.push({
      date: entry.date,
      fingerprint: entry.creativeFingerprint,
    });
  }

  const weekFingerprint = isWeekFingerprint(packageJson.weekFingerprint)
    ? packageJson.weekFingerprint
    : assets.length > 0
      ? buildWeekFingerprint(
          assets.map((asset) => ({ creativeFingerprint: asset.fingerprint })),
        )
      : null;

  return {
    assets,
    weekFingerprint,
    malformed: false,
    unsupportedSchema: false,
    invalidFingerprints,
  };
}

export function composeSocialPlannerSocialMemory(input: {
  organizationId: string;
  rows: SocialPlannerHistoryRow[];
}): SocialPlannerSocialMemoryV1 {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new SocialPlannerSocialMemoryError({
      reason: "TENANT_MISMATCH",
      message: "Social Memory requires a trusted organization id.",
      retryable: false,
    });
  }

  const ordered = [...input.rows].sort(compareHistoryRows);
  const considered = ordered.slice(0, SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxCalendars);

  let malformedPackagesSkipped = 0;
  let invalidFingerprintRowsSkipped = 0;
  const historicalAssets: SocialPlannerHistoricalAsset[] = [];
  const historicalWeeks: SocialPlannerHistoricalWeek[] = [];

  for (const [rank, row] of considered.entries()) {
    if (row.organization_id !== organizationId) {
      throw new SocialPlannerSocialMemoryError({
        reason: "FOREIGN_ORGANIZATION",
        message:
          "Social Memory refused a historical row that does not belong to the trusted organization.",
        retryable: false,
      });
    }

    if (row.status !== "Ready" || row.package_json == null) {
      malformedPackagesSkipped += 1;
      continue;
    }

    const extracted = extractHistoricalAssets(row.package_json);
    invalidFingerprintRowsSkipped += extracted.invalidFingerprints;
    if (extracted.malformed || extracted.unsupportedSchema) {
      malformedPackagesSkipped += 1;
      continue;
    }
    if (extracted.assets.length === 0 || !extracted.weekFingerprint) {
      malformedPackagesSkipped += 1;
      continue;
    }

    const recencyWeight = socialPlannerRecencyWeight(rank);
    const remainingAssetSlots =
      SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxAssets - historicalAssets.length;
    const includedAssets = extracted.assets.slice(0, remainingAssetSlots);

    for (const asset of includedAssets) {
      historicalAssets.push({
        calendarId: row.id,
        calendarCreatedAt: row.created_at,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recencyRank: rank,
        recencyWeight,
        date: asset.date,
        creativeFingerprint: asset.fingerprint,
      });
    }

    historicalWeeks.push({
      calendarId: row.id,
      calendarCreatedAt: row.created_at,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      recencyRank: rank,
      recencyWeight,
      weekFingerprint: extracted.weekFingerprint,
      assetTypeCounts: countValues(
        includedAssets.map((asset) => asset.fingerprint.assetType),
      ),
      familyCounts: countValues(
        includedAssets.map((asset) => asset.fingerprint.family),
      ),
      objectiveCounts: countValues(
        includedAssets.map((asset) => asset.fingerprint.objective),
      ),
      archetypeCounts: countValues(
        includedAssets.map((asset) => asset.fingerprint.contentArchetype),
      ),
      audienceCounts: countValues(
        includedAssets.map((asset) => asset.fingerprint.audience),
      ),
    });

    if (historicalAssets.length >= SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxAssets) {
      break;
    }
  }

  const createdAtValues = historicalWeeks.map((week) => week.calendarCreatedAt);
  const composed = composeSocialPlannerMemoryText(historicalAssets, historicalWeeks);
  const diagnostics: SocialPlannerSocialMemoryDiagnostics = {
    calendarsConsidered: considered.length,
    calendarsIncluded: historicalWeeks.length,
    assetsIncluded: historicalAssets.length,
    earliestHistoricalCreatedAt:
      createdAtValues.length > 0
        ? createdAtValues[createdAtValues.length - 1] ?? null
        : null,
    latestHistoricalCreatedAt: createdAtValues[0] ?? null,
    malformedPackagesSkipped,
    invalidFingerprintRowsSkipped,
    memoryCharacterCount: composed.text.length,
    truncated: composed.truncated,
  };

  return {
    schemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    organizationId,
    calendarsConsidered: diagnostics.calendarsConsidered,
    calendarsIncluded: diagnostics.calendarsIncluded,
    historicalAssets,
    historicalWeeks,
    recencyWindow: {
      maxCalendars: SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxCalendars,
      maxAssets: SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxAssets,
      composedTextMaxChars: SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.composedTextMaxChars,
    },
    diagnostics,
    composedText: composed.text,
  };
}

/**
 * L6 query shape against athena_social_calendars:
 * select SOCIAL_PLANNER_HISTORY_SELECT
 * where organization_id = trusted org
 *   and status = 'Ready'
 *   and package_json is not null
 * order by created_at desc
 * limit maxCalendars
 */
export const SOCIAL_PLANNER_READY_HISTORY_QUERY = {
  table: SOCIAL_PLANNER_HISTORY_TABLE,
  columns: SOCIAL_PLANNER_HISTORY_SELECT,
  status: "Ready" as const,
  orderBy: "created_at" as const,
  orderDirection: "desc" as const,
};

export async function loadSocialPlannerSocialMemory(input: {
  organizationId: string;
  historyLoader: SocialPlannerHistoryLoader;
}): Promise<SocialPlannerSocialMemoryV1> {
  let rows: SocialPlannerHistoryRow[];
  try {
    rows = await input.historyLoader.listReadyCalendars({
      organizationId: input.organizationId,
      limit: SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxCalendars,
    });
  } catch (error) {
    if (error instanceof SocialPlannerSocialMemoryError) throw error;
    throw new SocialPlannerSocialMemoryError({
      reason: "LOADER_FAILED",
      message: "Social Planner historical memory could not be loaded.",
      retryable: true,
    });
  }

  return composeSocialPlannerSocialMemory({
    organizationId: input.organizationId,
    rows,
  });
}

export function emptySocialPlannerSocialMemory(
  organizationId: string,
): SocialPlannerSocialMemoryV1 {
  return composeSocialPlannerSocialMemory({
    organizationId,
    rows: [],
  });
}
