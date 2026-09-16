/**
 * Deterministic Evergreen format rotation.
 * One accepted format per planned day. Not weekday-hardcoded.
 * Day index 0..n walks the six-format set; day 7 begins the next cycle.
 */

import {
  SOCIAL_PLANNER_EVERGREEN_FORMATS,
  type SocialPlannerEvergreenFormat,
} from "@/services/socialPlanner/socialPlannerDailyChannels";

export const SOCIAL_PLANNER_EVERGREEN_ROTATION_SEQUENCE =
  SOCIAL_PLANNER_EVERGREEN_FORMATS;

export function evergreenFormatForDayIndex(
  index: number,
): SocialPlannerEvergreenFormat {
  const sequence = SOCIAL_PLANNER_EVERGREEN_ROTATION_SEQUENCE;
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  return sequence[safeIndex % sequence.length];
}

export type SocialPlannerEvergreenFormatAssignment = {
  date: string;
  evergreenFormat: SocialPlannerEvergreenFormat;
};

export function planEvergreenWeekFormats(
  dates: readonly string[],
): SocialPlannerEvergreenFormatAssignment[] {
  return dates.map((date, index) => ({
    date,
    evergreenFormat: evergreenFormatForDayIndex(index),
  }));
}

export function evergreenFormatAssignmentMap(
  assignments: readonly SocialPlannerEvergreenFormatAssignment[],
): Map<string, SocialPlannerEvergreenFormat> {
  return new Map(
    assignments.map((entry) => [entry.date, entry.evergreenFormat]),
  );
}

export function isSocialPlannerEvergreenFormat(
  value: unknown,
): value is SocialPlannerEvergreenFormat {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_EVERGREEN_FORMATS as readonly string[]).includes(value)
  );
}
