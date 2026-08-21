/**
 * Public Social Planner API DTOs. Never expose raw DB rows or provenance.
 */

import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import { deriveSocialCalendarModelsUsed } from "@/services/socialPlanner/socialCalendarModelsUsed";
import {
  summarizePersistedSocialCalendarPackage,
  tryParsePersistedSocialCalendarPackage,
} from "@/services/socialPlanner/socialCalendarPersistedPackage";

export const SOCIAL_CALENDAR_PUBLIC_FAILURE = {
  code: "GENERATION_FAILED",
  message: "Generation failed. Please try again.",
} as const;

export const SOCIAL_CALENDAR_HISTORY_PAGE_SIZE = 25 as const;
export const SOCIAL_CALENDAR_HISTORY_MAX_LIMIT = 50 as const;

export type SocialCalendarHistoryPaginationDto = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type SocialCalendarPublicErrorDto = {
  code: typeof SOCIAL_CALENDAR_PUBLIC_FAILURE.code;
  message: typeof SOCIAL_CALENDAR_PUBLIC_FAILURE.message;
};

export type SocialCalendarListItemDto = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: SocialCalendar["status"];
  generationMode: SocialCalendar["generation_mode"];
  generationStage: string | null;
  versionNumber: number;
  sourceCalendarId: string | null;
  rootCalendarId: string | null;
  strategySummary: string | null;
  whyThisWeekWorks: string | null;
  assetCount: number;
  assetTypes: string[];
  families: string[];
  modelsUsed: string | null;
  createdAt: string;
  updatedAt: string;
  error: SocialCalendarPublicErrorDto | null;
};

export type SocialCalendarDetailDto = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: SocialCalendar["status"];
  generationMode: SocialCalendar["generation_mode"];
  generationStage: string | null;
  versionNumber: number;
  sourceCalendarId: string | null;
  rootCalendarId: string | null;
  userGuidance: string | null;
  package: SocialCalendarPackageV1 | null;
  packageUnavailable: boolean;
  createdAt: string;
  updatedAt: string;
  error: SocialCalendarPublicErrorDto | null;
};

export type CreateSocialCalendarResponse = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: SocialCalendar["status"];
  generationMode: SocialCalendar["generation_mode"];
  versionNumber: number;
  createdAt: string;
};

function publicError(
  calendar: SocialCalendar,
): SocialCalendarPublicErrorDto | null {
  if (calendar.status !== "Processing Failed") return null;
  return { ...SOCIAL_CALENDAR_PUBLIC_FAILURE };
}

export function toCreateSocialCalendarResponse(
  calendar: SocialCalendar,
): CreateSocialCalendarResponse {
  return {
    id: calendar.id,
    periodStart: calendar.period_start,
    periodEnd: calendar.period_end,
    status: calendar.status,
    generationMode: calendar.generation_mode,
    versionNumber: calendar.version_number,
    createdAt: calendar.created_at,
  };
}

export function toSocialCalendarListItemDto(
  calendar: SocialCalendar,
): SocialCalendarListItemDto {
  const isReady = calendar.status === "Ready";
  const summary = isReady
    ? summarizePersistedSocialCalendarPackage(calendar.package_json)
    : {
        strategySummary: null,
        whyThisWeekWorks: null,
        assetCount: 0,
        assetTypes: [] as string[],
        families: [] as string[],
      };

  return {
    id: calendar.id,
    periodStart: calendar.period_start,
    periodEnd: calendar.period_end,
    status: calendar.status,
    generationMode: calendar.generation_mode,
    generationStage: calendar.generation_stage,
    versionNumber: calendar.version_number,
    sourceCalendarId: calendar.source_calendar_id,
    rootCalendarId: calendar.root_calendar_id,
    strategySummary: summary.strategySummary,
    whyThisWeekWorks: summary.whyThisWeekWorks,
    assetCount: summary.assetCount,
    assetTypes: summary.assetTypes,
    families: summary.families,
    modelsUsed: isReady
      ? deriveSocialCalendarModelsUsed(calendar.package_json)
      : null,
    createdAt: calendar.created_at,
    updatedAt: calendar.updated_at,
    error: publicError(calendar),
  };
}

export function toSocialCalendarDetailDto(
  calendar: SocialCalendar,
): SocialCalendarDetailDto {
  const isReady = calendar.status === "Ready";
  let socialPackage: SocialCalendarPackageV1 | null = null;
  let packageUnavailable = false;

  if (isReady) {
    socialPackage = tryParsePersistedSocialCalendarPackage(calendar.package_json);
    packageUnavailable = socialPackage == null;
  }

  return {
    id: calendar.id,
    periodStart: calendar.period_start,
    periodEnd: calendar.period_end,
    status: calendar.status,
    generationMode: calendar.generation_mode,
    generationStage: calendar.generation_stage,
    versionNumber: calendar.version_number,
    sourceCalendarId: calendar.source_calendar_id,
    rootCalendarId: calendar.root_calendar_id,
    userGuidance: calendar.user_guidance,
    package: socialPackage,
    packageUnavailable,
    createdAt: calendar.created_at,
    updatedAt: calendar.updated_at,
    error: publicError(calendar),
  };
}
