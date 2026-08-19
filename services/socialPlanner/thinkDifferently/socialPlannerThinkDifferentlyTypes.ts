/**
 * Social Planner L8 Think Differently contracts.
 * Source-calendar divergence only — not a generic Athena framework.
 */

import type { SocialPlannerWeekFingerprint } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type {
  SocialCalendarDiverseGenerationResult,
  SocialPlannerHistoricalDiversityResult,
  SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerDiverseGenerationProvenance } from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";

export const SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION =
  "social_planner_think_differently_v1" as const;

export const SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION =
  "social_planner_think_differently_repair_v1" as const;

export const SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION =
  "social_planner_source_divergence_v1" as const;

export const SOCIAL_PLANNER_SOURCE_NEGATIVE_SCHEMA_VERSION =
  "social_planner_source_negative_v1" as const;

export const SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS = {
  weekReject: 0.68,
  assetReject: 0.55,
  minMateriallyDifferentDays: 4,
  materialDayChangedDimensions: 2,
  formatChangeMin: 0.22,
  archetypeChangeMin: 0.22,
  weeklyDirectionChangeMin: 0.22,
  hookChangeMin: 0.45,
  topicAngleHookPreserveDays: 4,
  weekFingerprintNearIdentity: 0.92,
  topicMatch: 0.85,
  angleMatch: 0.85,
} as const;

export const SOCIAL_PLANNER_SOURCE_NEGATIVE_BOUNDS = {
  strategySummaryMaxChars: 280,
  weeklyDirectionMaxChars: 280,
  fieldMaxChars: 80,
} as const;

export type SocialPlannerSourceNegativeDay = {
  date: string;
  assetType: string;
  family: string;
  contentArchetype: string;
  topic: string;
  angle: string;
  hookNormalized: string | null;
  hookType: string;
  objective: string;
  audience: string;
  visualStyle: string;
  calendarAnchorIds: string[];
  calendarAnchorLabels: string[];
};

export type SocialPlannerSourceNegativeContext = {
  schemaVersion: typeof SOCIAL_PLANNER_SOURCE_NEGATIVE_SCHEMA_VERSION;
  period: {
    periodStart: string;
    periodEnd: string;
    dates: string[];
  };
  strategySummary: string;
  weeklyCreativeDirection: string;
  weekFingerprint: SocialPlannerWeekFingerprint;
  days: SocialPlannerSourceNegativeDay[];
};

export type SocialPlannerThinkDifferentlyViolation = {
  code: string;
  message: string;
  candidateDate?: string;
  score?: number;
};

export type SocialPlannerThinkDifferentlyDayComparison = {
  date: string;
  score: number;
  materiallyDifferent: boolean;
  changedDimensions: string[];
  topicAngleArchetypeRepeat: boolean;
  hookReuse: boolean;
};

export type SocialPlannerThinkDifferentlyDivergenceResult = {
  accepted: boolean;
  sourceWeekSimilarity: number;
  highestSourceAssetSimilarity: number;
  formatChangeScore: number;
  archetypeChangeScore: number;
  topicTreatmentChangeScore: number;
  hookChangeScore: number;
  materiallyDifferentDays: number;
  days: SocialPlannerThinkDifferentlyDayComparison[];
  violations: SocialPlannerThinkDifferentlyViolation[];
};

export type SocialPlannerThinkDifferentlyProvenance =
  SocialPlannerDiverseGenerationProvenance & {
    generationMode: "think_differently";
    thinkDifferentlyPromptVersion: typeof SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION;
    thinkDifferentlyRepairPromptVersion: string | null;
    sourceDivergenceAlgorithmVersion: typeof SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION;
    sourceCalendarId: string;
    rootCalendarId: string;
    sourceVersionNumber: number;
    newVersionNumber: number;
    sourceWeekSimilarity: number;
    highestSourceAssetSimilarity: number;
    sourceDivergenceRepairUsed: boolean;
  };

export type SocialPlannerThinkDifferentlyGenerationResult =
  SocialCalendarDiverseGenerationResult & {
    sourcePackage: SocialCalendarPackageV1;
    sourceNegativeContext: SocialPlannerSourceNegativeContext;
    sourceDivergence: SocialPlannerThinkDifferentlyDivergenceResult;
    sourceDivergenceRepairUsed: boolean;
    generationProvenance: SocialPlannerThinkDifferentlyProvenance;
    socialMemory: SocialPlannerSocialMemoryV1;
    historicalDiversity: SocialPlannerHistoricalDiversityResult;
  };

export class SocialCalendarVersionAllocationError extends Error {
  readonly code = "VERSION_ALLOCATION_FAILED";

  constructor(
    message = "Could not allocate a unique Social Calendar version. Please try again.",
  ) {
    super(message);
    this.name = "SocialCalendarVersionAllocationError";
  }
}

export class ThinkDifferentlySourceError extends Error {
  readonly code:
    | "THINK_DIFFERENTLY_SOURCE_NOT_READY"
    | "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID";
  readonly httpStatus: 400 | 409;

  constructor(
    code:
      | "THINK_DIFFERENTLY_SOURCE_NOT_READY"
      | "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID",
    message: string,
    httpStatus: 400 | 409,
  ) {
    super(message);
    this.name = "ThinkDifferentlySourceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isPostgresUniqueViolation(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /duplicate key|unique constraint/i.test(message);
}
