/**
 * Historical Social Memory + diversity-evaluation contracts (L5).
 * Fingerprints only — never full prior packages or private intelligence.
 */

import type {
  SocialCalendarPackageV1,
  SocialPlannerAssetFingerprint,
  SocialPlannerGenerationMetadata,
  SocialPlannerWeekFingerprint,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type {
  SocialCalendarGenerationMode,
  SocialCalendarPackageJson,
  SocialCalendarStatus,
} from "@/services/socialPlanner/socialCalendarTypes";

export const SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION =
  "social_planner_social_memory_v1" as const;

export const SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION =
  "social_planner_diversity_v1" as const;

export const SOCIAL_PLANNER_DIVERSITY_REPAIR_PROMPT_VERSION =
  "social_planner_diversity_repair_v1" as const;

export const SOCIAL_PLANNER_HISTORY_TABLE = "athena_social_calendars" as const;

export const SOCIAL_PLANNER_HISTORY_SELECT_COLUMNS = [
  "id",
  "organization_id",
  "period_start",
  "period_end",
  "generation_mode",
  "version_number",
  "status",
  "package_json",
  "created_at",
] as const;

export const SOCIAL_PLANNER_HISTORY_SELECT =
  SOCIAL_PLANNER_HISTORY_SELECT_COLUMNS.join(", ");

export const SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS = {
  maxCalendars: 10,
  maxAssets: 70,
  composedTextMaxChars: 8_000,
  maxComparisons: 8,
  maxTokensPerField: 16,
  recentHardDuplicateRanks: 4,
} as const;

export const SOCIAL_PLANNER_RECENCY = {
  newestWeight: 1,
  step: 0.1,
  floor: 0.1,
} as const;

export type SocialPlannerHistoryRow = {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  generation_mode: SocialCalendarGenerationMode;
  version_number: number;
  status: SocialCalendarStatus;
  package_json: SocialCalendarPackageJson | null;
  created_at: string;
};

export type SocialPlannerHistoryLoader = {
  listReadyCalendars(input: {
    organizationId: string;
    limit: number;
  }): Promise<SocialPlannerHistoryRow[]>;
};

export type SocialPlannerHistoricalAsset = {
  calendarId: string;
  calendarCreatedAt: string;
  periodStart: string;
  periodEnd: string;
  recencyRank: number;
  recencyWeight: number;
  date: string;
  creativeFingerprint: SocialPlannerAssetFingerprint;
};

export type SocialPlannerHistoricalWeek = {
  calendarId: string;
  calendarCreatedAt: string;
  periodStart: string;
  periodEnd: string;
  recencyRank: number;
  recencyWeight: number;
  weekFingerprint: SocialPlannerWeekFingerprint;
  assetTypeCounts: Record<string, number>;
  familyCounts: Record<string, number>;
  objectiveCounts: Record<string, number>;
  archetypeCounts: Record<string, number>;
  audienceCounts: Record<string, number>;
};

export type SocialPlannerSocialMemoryDiagnostics = {
  calendarsConsidered: number;
  calendarsIncluded: number;
  assetsIncluded: number;
  earliestHistoricalCreatedAt: string | null;
  latestHistoricalCreatedAt: string | null;
  malformedPackagesSkipped: number;
  invalidFingerprintRowsSkipped: number;
  memoryCharacterCount: number;
  truncated: boolean;
};

export type SocialPlannerSocialMemoryV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION;
  organizationId: string;
  calendarsConsidered: number;
  calendarsIncluded: number;
  historicalAssets: SocialPlannerHistoricalAsset[];
  historicalWeeks: SocialPlannerHistoricalWeek[];
  recencyWindow: {
    maxCalendars: number;
    maxAssets: number;
    composedTextMaxChars: number;
  };
  diagnostics: SocialPlannerSocialMemoryDiagnostics;
  composedText: string;
};

export type SocialPlannerHistoricalDiversityViolationKind =
  | "hard_duplicate"
  | "asset_similarity"
  | "week_similarity"
  | "clustered_moderate";

export type SocialPlannerHistoricalDiversityViolation = {
  kind: SocialPlannerHistoricalDiversityViolationKind;
  code: string;
  message: string;
  candidateDate?: string;
  historicalCalendarId?: string;
  historicalAssetDate?: string;
  score?: number;
};

export type SocialPlannerHistoricalDiversityWarning = {
  kind: string;
  message: string;
  candidateDate?: string;
};

export type SocialPlannerAssetSimilarityComparison = {
  score: number;
  recencyWeightedScore: number;
  matchedDimensions: string[];
  historicalCalendarId: string;
  historicalAssetDate: string;
  candidateDate: string;
};

export type SocialPlannerHistoricalDiversityResult = {
  accepted: boolean;
  overallScore: number;
  highestAssetSimilarity: number;
  weekSimilarity: number;
  violations: SocialPlannerHistoricalDiversityViolation[];
  warnings: SocialPlannerHistoricalDiversityWarning[];
  comparisons: SocialPlannerAssetSimilarityComparison[];
};

export type SocialPlannerDiverseGenerationProvenance =
  SocialPlannerGenerationMetadata & {
    socialMemorySchemaVersion: typeof SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION;
    diversityAlgorithmVersion: typeof SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION;
    historicalDiversityCheckVersion: typeof SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION;
    historicalCalendarsConsidered: number;
    historicalAssetsConsidered: number;
    highestHistoricalSimilarity: number;
    weekHistoricalSimilarity: number;
    historicalDiversityRepairUsed: boolean;
    diversityRepairPromptVersion: string | null;
  };

export type SocialCalendarDiverseGenerationResult = {
  package: SocialCalendarPackageV1;
  generationProvenance: SocialPlannerDiverseGenerationProvenance;
  socialMemory: SocialPlannerSocialMemoryV1;
  historicalDiversity: SocialPlannerHistoricalDiversityResult;
};
