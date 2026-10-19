/**
 * Which Evergreen dates a conversation revision may regenerate alone.
 * A week-level instruction is applied to the whole week.
 */

import type {
  SocialPlannerConversationRevisionBriefV1,
  SocialPlannerConversationRevisionDayChange,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";

export type EvergreenRevisionDatePlan =
  | { safePartial: true; dates: string[] }
  | { safePartial: false };

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
 * Partial regeneration is safe only when every requested change names an
 * in-period date and the brief has no week-level rewrite.
 */
export function planEvergreenRevisionDates(input: {
  brief: SocialPlannerConversationRevisionBriefV1;
  periodDates: readonly string[];
}): EvergreenRevisionDatePlan {
  const changes = input.brief.dayChanges;
  if (changes.length < 1) return { safePartial: false };

  const period = new Set(input.periodDates);
  const seen = new Set<string>();
  for (const change of changes) {
    if (!period.has(change.date) || seen.has(change.date)) {
      return { safePartial: false };
    }
    seen.add(change.date);
    if (!hasConcreteDayRequest(change) || requestsBroaderWeekRewrite(change)) {
      return { safePartial: false };
    }
  }

  const global = input.brief.global;
  if (
    hasText(global.desiredTone) ||
    hasText(global.audienceShift) ||
    hasText(global.changeSummary) ||
    hasItems(global.desiredObjectives) ||
    hasItems(global.preferredFormats) ||
    hasItems(global.avoidFormats) ||
    hasItems(global.avoidConcepts) ||
    hasItems(global.keepThemes) ||
    hasItems(input.brief.avoid)
  ) {
    return { safePartial: false };
  }

  for (const date of input.brief.preserve) {
    if (seen.has(date) || !period.has(date)) return { safePartial: false };
  }

  return {
    safePartial: true,
    dates: input.periodDates.filter((date) => seen.has(date)),
  };
}
