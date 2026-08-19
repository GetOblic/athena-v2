/**
 * Deterministic seven-day temporal intelligence.
 * Uses UTC calendar-date arithmetic only. No timezone library. No LLM.
 */

import { parseSocialCalendarDate } from "@/services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerHemisphere } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import {
  SOCIAL_CALENDAR_DAY_NAMES,
  SOCIAL_CALENDAR_MONTH_NAMES,
  type SocialCalendarDayContext,
  type SocialCalendarDayName,
  type SocialCalendarDaySemantic,
  type SocialCalendarSeason,
  type SocialCalendarSelectedWeekPosition,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";

const MS_PER_DAY = 86_400_000;

export function listSocialCalendarPeriodDates(
  periodStart: string,
  periodEnd: string,
): string[] {
  const start = parseSocialCalendarDate(periodStart);
  const end = parseSocialCalendarDate(periodEnd);
  const startUtc = Date.parse(`${start}T00:00:00.000Z`);
  const endUtc = Date.parse(`${end}T00:00:00.000Z`);
  const dates: string[] = [];

  for (let utc = startUtc; utc <= endUtc; utc += MS_PER_DAY) {
    const parsed = new Date(utc);
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsed.getUTCDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

export function lastDayOfUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function quarterForMonth(month: number): number {
  return Math.ceil(month / 3);
}

export function isoWeekdayFromJs(jsWeekday: number): number {
  return jsWeekday === 0 ? 7 : jsWeekday;
}

export function selectedWeekPositionForIndex(
  positionInSelectedWeek: number,
): SocialCalendarSelectedWeekPosition {
  if (positionInSelectedWeek <= 2) return "beginning";
  if (positionInSelectedWeek >= 6) return "end";
  return "middle";
}

/**
 * Meteorological seasons. Returns null when hemisphere is unknown
 * or the country spans both hemispheres.
 */
export function resolveMeteorologicalSeason(
  month: number,
  hemisphere: SocialPlannerHemisphere,
): SocialCalendarSeason | null {
  if (hemisphere === "unknown") {
    return null;
  }

  const northern: Record<number, SocialCalendarSeason> = {
    12: "winter",
    1: "winter",
    2: "winter",
    3: "spring",
    4: "spring",
    5: "spring",
    6: "summer",
    7: "summer",
    8: "summer",
    9: "autumn",
    10: "autumn",
    11: "autumn",
  };

  const season = northern[month];
  if (!season) return null;
  if (hemisphere === "northern") return season;

  const opposite: Record<SocialCalendarSeason, SocialCalendarSeason> = {
    spring: "autumn",
    summer: "winter",
    autumn: "spring",
    winter: "summer",
  };
  return opposite[season];
}

export function daySemanticsForWeekday(
  dayOfWeek: SocialCalendarDayName,
): SocialCalendarDaySemantic[] {
  if (dayOfWeek === "Monday") return ["start_of_workweek"];
  if (dayOfWeek === "Wednesday") return ["midweek"];
  if (dayOfWeek === "Friday") return ["end_of_workweek"];
  if (dayOfWeek === "Saturday" || dayOfWeek === "Sunday") return ["weekend"];
  return [];
}

export function buildSocialCalendarDayContext(input: {
  date: string;
  positionInSelectedWeek: number;
  hemisphere: SocialPlannerHemisphere;
}): Omit<SocialCalendarDayContext, "opportunityIds"> {
  const date = parseSocialCalendarDate(input.date);
  const utc = new Date(`${date}T00:00:00.000Z`);
  const year = utc.getUTCFullYear();
  const month = utc.getUTCMonth() + 1;
  const day = utc.getUTCDate();
  const jsWeekday = utc.getUTCDay();
  const isoWeekday = isoWeekdayFromJs(jsWeekday);
  const dayOfWeek = SOCIAL_CALENDAR_DAY_NAMES[jsWeekday];
  const lastDay = lastDayOfUtcMonth(year, month);
  const quarter = quarterForMonth(month);
  const isStartOfMonth = day === 1;
  const isEndOfMonth = day === lastDay;
  const isStartOfQuarter = isStartOfMonth && (month === 1 || month === 4 || month === 7 || month === 10);
  const isEndOfQuarter = isEndOfMonth && (month === 3 || month === 6 || month === 9 || month === 12);
  const isStartOfYear = month === 1 && day === 1;
  const isEndOfYear = month === 12 && day === 31;
  const isWeekend = dayOfWeek === "Saturday" || dayOfWeek === "Sunday";

  return {
    date,
    dayOfWeek,
    isoWeekday,
    isWeekend,
    isWeekday: !isWeekend,
    month,
    monthName: SOCIAL_CALENDAR_MONTH_NAMES[month - 1],
    year,
    quarter,
    positionInSelectedWeek: input.positionInSelectedWeek,
    selectedWeekPosition: selectedWeekPositionForIndex(input.positionInSelectedWeek),
    isStartOfMonth,
    isEndOfMonth,
    isStartOfQuarter,
    isEndOfQuarter,
    isStartOfYear,
    isEndOfYear,
    season: resolveMeteorologicalSeason(month, input.hemisphere),
    daySemantics: daySemanticsForWeekday(dayOfWeek),
  };
}
