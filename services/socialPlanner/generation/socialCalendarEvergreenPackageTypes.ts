/**
 * Evergreen Social Calendar generated-package contract.
 * Discriminated from Daily social_calendar_package_v1. No migration.
 * Reuses canonical Deployment Asset keys as FORMAT IDENTITY only.
 */

import type {
  SocialCalendarDayName,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type {
  SocialCalendarSelectedAnchor,
  SocialPlannerContentArchetype,
  SocialPlannerCtaType,
  SocialPlannerGenerationMetadata,
  SocialPlannerHookType,
  SocialPlannerObjective,
  SocialPlannerSourceSignal,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialPlannerEvergreenFormat } from "@/services/socialPlanner/socialPlannerDailyChannels";

export const SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION =
  "social_calendar_evergreen_package_v1" as const;

export const SOCIAL_PLANNER_EVERGREEN_PROMPT_VERSION =
  "social_planner_evergreen_v1" as const;

export const SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION =
  "social_planner_evergreen_repair_v1" as const;

export const SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION =
  "social_planner_evergreen_strategy_v1" as const;

export type SocialPlannerEvergreenFingerprint = {
  evergreenFormat: SocialPlannerEvergreenFormat;
  contentArchetype: SocialPlannerContentArchetype;
  topic: string;
  angle: string;
  hookType: SocialPlannerHookType;
  hookNormalized: string | null;
  objective: SocialPlannerObjective;
  audience: string;
  personaIds: string[];
  ctaType: SocialPlannerCtaType;
  calendarAnchorIds: string[];
};

export type SocialPlannerEvergreenWeekFingerprint = {
  evergreenFormats: SocialPlannerEvergreenFormat[];
  objectives: SocialPlannerObjective[];
  archetypes: SocialPlannerContentArchetype[];
  personaIds: string[];
  topics: string[];
  calendarAnchorIds: string[];
};

export type SocialCalendarEvergreenDayV1 = {
  date: string;
  weekday: SocialCalendarDayName;
  evergreenFormat: SocialPlannerEvergreenFormat;
  title: string;
  concept: string;
  draft: string;
  cta: string | null;
  publishingGuidance: string | null;
  audience: string;
  personaIds: string[];
  topic: string;
  angle: string;
  calendarAnchors: SocialCalendarSelectedAnchor[];
  calendarReason: string | null;
  sourceSignals: SocialPlannerSourceSignal[];
  creativeFingerprint: SocialPlannerEvergreenFingerprint;
};

export type SocialPlannerEvergreenGenerationMetadata = Omit<
  SocialPlannerGenerationMetadata,
  "packageSchemaVersion"
> & {
  packageSchemaVersion: typeof SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION;
  plannerKind: "evergreen";
};

export type SocialCalendarEvergreenPackageV1 = {
  schemaVersion: typeof SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION;
  plannerKind: "evergreen";
  period: {
    periodStart: string;
    periodEnd: string;
    dates: string[];
  };
  strategySummary: string;
  whyThisWeekWorks: string;
  days: SocialCalendarEvergreenDayV1[];
  weekFingerprint: SocialPlannerEvergreenWeekFingerprint;
  generationMetadata: SocialPlannerEvergreenGenerationMetadata;
};

export type SocialCalendarEvergreenGenerationResult = {
  package: SocialCalendarEvergreenPackageV1;
  generationProvenance: SocialPlannerEvergreenGenerationMetadata;
};

export const SOCIAL_PLANNER_EVERGREEN_PACKAGE_LIMITS = {
  packageMaxChars: 96_000,
  dayMaxChars: 16_000,
  strategySummaryMaxChars: 500,
  whyThisWeekWorksMinChars: 80,
  whyThisWeekWorksMaxChars: 700,
  whyThisWeekWorksMinSentences: 2,
  whyThisWeekWorksMaxSentences: 4,
  titleMaxChars: 200,
  conceptMaxChars: 600,
  topicMaxChars: 240,
  angleMaxChars: 240,
  audienceMaxChars: 220,
  draftMaxChars: 12_000,
  ctaMaxChars: 280,
  publishingGuidanceMaxChars: 800,
  calendarReasonMaxChars: 280,
  sourceSignalsMax: 6,
  personaIdsPerDayMax: 2,
  anchorsPerDayMax: 2,
} as const;

export const SOCIAL_PLANNER_EVERGREEN_DRAFT_MIN_CHARS = {
  blog_post_idea: 700,
  newsletter_idea: 500,
  substack_post: 700,
  reddit_post: 220,
  skool_post: 220,
  skool_course_idea: 400,
} as const satisfies Record<SocialPlannerEvergreenFormat, number>;
