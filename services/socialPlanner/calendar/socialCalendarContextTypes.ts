/**
 * Versioned Social Calendar Context (L2).
 * Frozen later into athena_social_calendars.calendar_context_json.
 *
 * Contains facts and known-opportunity candidates only.
 * Does not contain generation copy, creative selection, or "Why this week works".
 */

import type {
  SocialPlannerGeography,
  SocialPlannerHemisphere,
} from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";

export const SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION =
  "social_calendar_context_v1" as const;

export const SOCIAL_CALENDAR_RESOLVER_VERSION = "social_planner_l2b_v1" as const;

export const SOCIAL_CALENDAR_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type SocialCalendarDayName = (typeof SOCIAL_CALENDAR_DAY_NAMES)[number];

export const SOCIAL_CALENDAR_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type SocialCalendarMonthName =
  (typeof SOCIAL_CALENDAR_MONTH_NAMES)[number];

export const SOCIAL_CALENDAR_SEASONS = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

export type SocialCalendarSeason = (typeof SOCIAL_CALENDAR_SEASONS)[number];

export const SOCIAL_CALENDAR_SELECTED_WEEK_POSITIONS = [
  "beginning",
  "middle",
  "end",
] as const;

export type SocialCalendarSelectedWeekPosition =
  (typeof SOCIAL_CALENDAR_SELECTED_WEEK_POSITIONS)[number];

export const SOCIAL_CALENDAR_DAY_SEMANTICS = [
  "start_of_workweek",
  "midweek",
  "end_of_workweek",
  "weekend",
] as const;

export type SocialCalendarDaySemantic =
  (typeof SOCIAL_CALENDAR_DAY_SEMANTICS)[number];

export const SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES = [
  "public_holiday",
  "civic_observance",
  "cultural_religious_observance",
  "commercial_event",
  "awareness_event",
  "seasonal_event",
  "temporal_day_of_week",
  "temporal_period_boundary",
] as const;

export type SocialCalendarOpportunityCategory =
  (typeof SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES)[number];

export const SOCIAL_CALENDAR_OPPORTUNITY_SCOPES = [
  "global",
  "country",
  "region",
  "hemisphere",
] as const;

export type SocialCalendarOpportunityScope =
  (typeof SOCIAL_CALENDAR_OPPORTUNITY_SCOPES)[number];

/**
 * L2 emits known candidates only. L4 will later choose selected anchors.
 */
export const SOCIAL_CALENDAR_OPPORTUNITY_SELECTION_STATUSES = [
  "candidate",
] as const;

export type SocialCalendarOpportunitySelectionStatus =
  (typeof SOCIAL_CALENDAR_OPPORTUNITY_SELECTION_STATUSES)[number];

export const SOCIAL_CALENDAR_OBSERVED_KINDS = [
  "actual",
  "substitute",
] as const;

export type SocialCalendarObservedKind =
  (typeof SOCIAL_CALENDAR_OBSERVED_KINDS)[number];

export type SocialCalendarOpportunity = {
  id: string;
  label: string;
  date: string;
  category: SocialCalendarOpportunityCategory;
  scope: SocialCalendarOpportunityScope;
  jurisdictionCountryCode: string | null;
  jurisdictionRegionCode: string | null;
  jurisdictionHemisphere: SocialPlannerHemisphere | null;
  selectionStatus: SocialCalendarOpportunitySelectionStatus;
  ruleId: string;
  /** Present for jurisdiction holidays; null for Athena temporal/seasonal facts. */
  observedKind: SocialCalendarObservedKind | null;
  /** date-holidays grammar/rule identity; null for Athena-authored rules. */
  providerRule: string | null;
};

export type SocialCalendarDayContext = {
  date: string;
  dayOfWeek: SocialCalendarDayName;
  /** ISO-8601 weekday: Monday = 1 … Sunday = 7. */
  isoWeekday: number;
  isWeekend: boolean;
  isWeekday: boolean;
  month: number;
  monthName: SocialCalendarMonthName;
  year: number;
  quarter: number;
  positionInSelectedWeek: number;
  selectedWeekPosition: SocialCalendarSelectedWeekPosition;
  isStartOfMonth: boolean;
  isEndOfMonth: boolean;
  isStartOfQuarter: boolean;
  isEndOfQuarter: boolean;
  isStartOfYear: boolean;
  isEndOfYear: boolean;
  season: SocialCalendarSeason | null;
  daySemantics: SocialCalendarDaySemantic[];
  opportunityIds: string[];
};

export type SocialCalendarPeriodContext = {
  periodStart: string;
  periodEnd: string;
  dates: string[];
};

export const SOCIAL_CALENDAR_HOLIDAY_COVERAGE = [
  "none",
  "unsupported_country",
  "country",
  "country_region",
] as const;

export type SocialCalendarHolidayCoverage =
  (typeof SOCIAL_CALENDAR_HOLIDAY_COVERAGE)[number];

export const SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME = "date-holidays" as const;

export type SocialCalendarHolidayProviderName =
  typeof SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME;

export type SocialCalendarContextProvenance = {
  resolverVersion: typeof SOCIAL_CALENDAR_RESOLVER_VERSION;
  schemaVersion: typeof SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION;
  holidayCoverage: SocialCalendarHolidayCoverage;
  holidayProvider: SocialCalendarHolidayProviderName;
  holidayProviderVersion: string;
  geographySource: SocialPlannerGeography["source"];
  opportunityRuleIds: string[];
};

export type SocialCalendarContext = {
  schemaVersion: typeof SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION;
  geography: SocialPlannerGeography;
  period: SocialCalendarPeriodContext;
  dayContexts: SocialCalendarDayContext[];
  opportunities: SocialCalendarOpportunity[];
  provenance: SocialCalendarContextProvenance;
};

export class SocialCalendarContextError extends Error {
  readonly code = "INVALID_SOCIAL_CALENDAR_CONTEXT";

  constructor(message = "Social Calendar context is invalid.") {
    super(message);
    this.name = "SocialCalendarContextError";
  }
}
