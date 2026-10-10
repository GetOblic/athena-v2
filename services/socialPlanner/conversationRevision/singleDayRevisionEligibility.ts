/**
 * Frozen-brief gate for the cost-optimized single-day conversation revision.
 * A selected card, Apply payload, or UI focus is not an input.
 */

import { SOCIAL_CALENDAR_PERIOD_DAYS } from "@/services/socialPlanner/socialCalendarTypes";
import type {
  SocialPlannerConversationRevisionBriefV1,
  SocialPlannerConversationRevisionDayChange,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import type { SocialCalendarPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

export const SINGLE_DAY_REVISION_INELIGIBILITY_REASONS = [
  "evergreen",
  "not_seven_day_period",
  "day_change_count",
  "date_outside_period",
  "week_level_desired_tone",
  "week_level_audience_shift",
  "week_level_change_summary",
  "week_level_desired_objectives",
  "week_level_preferred_formats",
  "week_level_avoid_formats",
  "week_level_avoid_concepts",
  "week_level_avoid",
  "week_level_keep_themes",
  "broader_week_rewrite",
  "ambiguous_day_change",
  "ambiguous_preserve",
] as const;

export type SingleDayRevisionIneligibilityReason =
  (typeof SINGLE_DAY_REVISION_INELIGIBILITY_REASONS)[number];

export type SingleDayRevisionEligibility =
  | {
      eligible: true;
      targetDate: string;
      preservedDates: string[];
    }
  | {
      eligible: false;
      reason: SingleDayRevisionIneligibilityReason;
    };

const WEEK_REWRITE_PATTERN =
  /\b(whole week|entire week|full week|rest of the week|other days|all seven days|all 7 days|every day|rewrite the week|week rewrite)\b/i;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasItems(value: readonly unknown[] | undefined): boolean {
  return (value?.length ?? 0) > 0;
}

function hasConcreteDayRequest(
  change: SocialPlannerConversationRevisionDayChange,
): boolean {
  return (
    Boolean(change.requestedAssetType) ||
    Boolean(change.requestedObjective) ||
    hasText(change.requestedTone) ||
    hasText(change.requestedConceptDirection) ||
    hasText(change.requestedChangeSummary)
  );
}

function requestsBroaderWeekRewrite(
  change: SocialPlannerConversationRevisionDayChange,
): boolean {
  const text = [
    change.requestedTone,
    change.requestedConceptDirection,
    change.requestedChangeSummary,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  return WEEK_REWRITE_PATTERN.test(text);
}

/**
 * Single-day path only for a Daily week whose frozen brief names exactly one
 * in-period day and carries no week-level or ambiguous rewrite.
 */
export function evaluateSingleDayConversationRevisionEligibility(input: {
  brief: SocialPlannerConversationRevisionBriefV1;
  periodDates: readonly string[];
  plannerKind: SocialCalendarPlannerKind;
}): SingleDayRevisionEligibility {
  if (input.plannerKind !== "daily_social") {
    return { eligible: false, reason: "evergreen" };
  }
  if (input.periodDates.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    return { eligible: false, reason: "not_seven_day_period" };
  }
  if (input.brief.dayChanges.length !== 1) {
    return { eligible: false, reason: "day_change_count" };
  }

  const change = input.brief.dayChanges[0];
  const targetDate = change?.date ?? "";
  if (!input.periodDates.includes(targetDate)) {
    return { eligible: false, reason: "date_outside_period" };
  }

  const global = input.brief.global;
  if (hasText(global.desiredTone)) {
    return { eligible: false, reason: "week_level_desired_tone" };
  }
  if (hasText(global.audienceShift)) {
    return { eligible: false, reason: "week_level_audience_shift" };
  }
  if (hasText(global.changeSummary)) {
    return { eligible: false, reason: "week_level_change_summary" };
  }
  if (hasItems(global.desiredObjectives)) {
    return { eligible: false, reason: "week_level_desired_objectives" };
  }
  if (hasItems(global.preferredFormats)) {
    return { eligible: false, reason: "week_level_preferred_formats" };
  }
  if (hasItems(global.avoidFormats)) {
    return { eligible: false, reason: "week_level_avoid_formats" };
  }
  if (hasItems(global.avoidConcepts)) {
    return { eligible: false, reason: "week_level_avoid_concepts" };
  }
  if (hasItems(input.brief.avoid)) {
    return { eligible: false, reason: "week_level_avoid" };
  }
  if (hasItems(global.keepThemes)) {
    return { eligible: false, reason: "week_level_keep_themes" };
  }
  if (!change || !hasConcreteDayRequest(change)) {
    return { eligible: false, reason: "ambiguous_day_change" };
  }
  if (requestsBroaderWeekRewrite(change)) {
    return { eligible: false, reason: "broader_week_rewrite" };
  }

  const period = new Set(input.periodDates);
  if (
    input.brief.preserve.some(
      (date) => date === targetDate || !period.has(date),
    )
  ) {
    return { eligible: false, reason: "ambiguous_preserve" };
  }

  return {
    eligible: true,
    targetDate,
    preservedDates: input.periodDates.filter((date) => date !== targetDate),
  };
}
