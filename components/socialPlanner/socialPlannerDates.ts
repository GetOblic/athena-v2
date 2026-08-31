/**
 * Calendar-date helpers for Social Planner UI.
 * Parse YYYY-MM-DD as a calendar date, never as a UTC timestamp for display.
 */

import {
  SOCIAL_CALENDAR_PERIOD_DAYS,
  parseSocialCalendarDate,
} from "@/services/socialPlanner/socialCalendarTypes";
import { deriveSocialCalendarPeriodEnd } from "@/services/socialPlanner/socialCalendarRequest";

const MS_PER_DAY = 86_400_000;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTH_LONG = [
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

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export function parseCalendarDateParts(
  value: string,
): CalendarDateParts | null {
  try {
    const iso = parseSocialCalendarDate(value);
    return {
      year: Number(iso.slice(0, 4)),
      month: Number(iso.slice(5, 7)),
      day: Number(iso.slice(8, 10)),
    };
  } catch {
    return null;
  }
}

function formatUtcYmd(utc: number): string {
  const parsed = new Date(utc);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(iso: string, days: number): string {
  const start = parseSocialCalendarDate(iso);
  const utc = Date.parse(`${start}T00:00:00.000Z`) + days * MS_PER_DAY;
  return formatUtcYmd(utc);
}

export function listSocialPlannerPeriodDates(periodStart: string): string[] {
  parseSocialCalendarDate(periodStart);
  return Array.from({ length: SOCIAL_CALENDAR_PERIOD_DAYS }, (_, index) =>
    addCalendarDays(periodStart, index),
  );
}

export function deriveSocialPlannerPeriodEnd(periodStart: string): string {
  return deriveSocialCalendarPeriodEnd(periodStart);
}

export function todayLocalCalendarDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcParts(iso: string): CalendarDateParts | null {
  return parseCalendarDateParts(iso);
}

function weekdayName(
  parts: CalendarDateParts,
  locale: string,
  width: "short" | "long",
): string {
  if (locale === "en-US") {
    const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return width === "short"
      ? WEEKDAY_SHORT[utc.getUTCDay()]
      : WEEKDAY_LONG[utc.getUTCDay()];
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: width,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

function monthName(
  monthIndex: number,
  locale: string,
  width: "short" | "long",
): string {
  if (locale === "en-US") {
    return width === "short" ? MONTH_SHORT[monthIndex] : MONTH_LONG[monthIndex];
  }
  return new Intl.DateTimeFormat(locale, {
    month: width,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, monthIndex, 1)));
}

export function formatWeekRangePreview(
  periodStart: string,
  periodEnd: string,
  locale = "en-US",
): string {
  const start = utcParts(periodStart);
  const end = utcParts(periodEnd);
  if (!start || !end) return "";
  return `${weekdayName(start, locale, "short")} ${monthName(start.month - 1, locale, "short")} ${start.day} → ${weekdayName(end, locale, "short")} ${monthName(end.month - 1, locale, "short")} ${end.day}`;
}

export function formatSocialPlannerPeriodLabel(
  periodStart: string,
  periodEnd: string,
  locale = "en-US",
): string {
  const start = utcParts(periodStart);
  const end = utcParts(periodEnd);
  if (!start || !end) return `${periodStart} – ${periodEnd}`;

  const startMonth = monthName(start.month - 1, locale, "long");
  const endMonth = monthName(end.month - 1, locale, "long");

  if (start.year === end.year && start.month === end.month) {
    return `${startMonth} ${start.day}–${end.day}, ${start.year}`;
  }

  if (start.year === end.year) {
    return `${startMonth} ${start.day} – ${endMonth} ${end.day}, ${start.year}`;
  }

  return `${startMonth} ${start.day}, ${start.year} – ${endMonth} ${end.day}, ${end.year}`;
}

export function formatSocialPlannerDayHeader(
  weekday: string,
  isoDate: string,
  locale = "en-US",
): string {
  const parts = utcParts(isoDate);
  const dayName = parts
    ? weekdayName(parts, locale, "long")
    : weekday.trim();
  if (!parts) return dayName.toUpperCase();
  return `${dayName.toUpperCase()} · ${monthName(parts.month - 1, locale, "short").toUpperCase()} ${parts.day}`;
}

export function formatSocialPlannerCreatedDate(
  value: string,
  locale = "en-US",
): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatSocialPlannerMonthCaption(
  iso: string,
  locale = "en-US",
): string {
  const parts = utcParts(iso);
  if (!parts) return "";
  return `${monthName(parts.month - 1, locale, "long")} ${parts.year}`;
}

function dateSearchAliasesFromParts(parts: CalendarDateParts): string[] {
  const monthShort = MONTH_SHORT[parts.month - 1];
  const monthLong = MONTH_LONG[parts.month - 1];
  if (!monthShort || !monthLong) return [];

  const year = String(parts.year);
  const day = String(parts.day);
  const iso = `${year}-${String(parts.month).padStart(2, "0")}-${day.padStart(2, "0")}`;

  return [
    iso,
    monthLong,
    monthShort,
    day,
    year,
    `${monthShort} ${day}`,
    `${monthLong} ${day}`,
    `${monthLong} ${day} ${year}`,
    `${monthShort} ${day} ${year}`,
    `${monthLong} ${day}, ${year}`,
    `${monthShort} ${day}, ${year}`,
  ];
}

/**
 * Deterministic date aliases for Social Planner library search.
 * Calendar YYYY-MM-DD values stay timezone-stable; timestamps use UTC parts.
 */
export function buildSocialPlannerDateSearchAliases(value: string): string[] {
  const calendar = parseCalendarDateParts(value);
  if (calendar) {
    return dateSearchAliasesFromParts(calendar);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return [];

  return dateSearchAliasesFromParts({
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  });
}
