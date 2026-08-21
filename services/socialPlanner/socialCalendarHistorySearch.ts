/**
 * Visible-card search corpus for the Social Planner library.
 * Matches only what the history card communicates — not hidden JSON.
 */

import {
  buildSocialPlannerDateSearchAliases,
  formatSocialPlannerCreatedDate,
  formatSocialPlannerPeriodLabel,
  listSocialPlannerPeriodDates,
} from "@/components/socialPlanner/socialPlannerDates";
import {
  socialPlannerAssetTypeLabel,
  socialPlannerGenerationModeLabel,
  socialPlannerHistoryStatusLabel,
} from "@/components/socialPlanner/socialPlannerLabels";
import type { SocialCalendarListItemDto } from "@/services/socialPlanner/socialCalendarDto";

function periodDatesForSearch(periodStart: string): string[] {
  try {
    return listSocialPlannerPeriodDates(periodStart);
  } catch {
    return periodStart ? [periodStart] : [];
  }
}

export function buildSocialCalendarHistorySearchCorpus(
  item: SocialCalendarListItemDto,
): string {
  const parts: string[] = [
    formatSocialPlannerPeriodLabel(item.periodStart, item.periodEnd),
    item.periodStart,
    item.periodEnd,
    formatSocialPlannerCreatedDate(item.createdAt),
  ];

  for (const iso of periodDatesForSearch(item.periodStart)) {
    parts.push(...buildSocialPlannerDateSearchAliases(iso));
  }
  parts.push(...buildSocialPlannerDateSearchAliases(item.createdAt));

  parts.push(socialPlannerHistoryStatusLabel(item.status));

  const showModeBadge =
    item.generationMode !== "standard" || item.versionNumber > 1;
  if (showModeBadge && item.generationMode !== "standard") {
    parts.push(socialPlannerGenerationModeLabel(item.generationMode));
  }
  if (item.versionNumber > 1) {
    parts.push(`Version ${item.versionNumber}`);
  }

  if (item.strategySummary) {
    parts.push(item.strategySummary);
  }
  if (item.whyThisWeekWorks) {
    parts.push(item.whyThisWeekWorks);
  }
  if (item.modelsUsed) {
    parts.push(item.modelsUsed);
  }

  if (item.status === "Ready") {
    parts.push(`${item.assetCount} assets`);
    for (const assetType of item.assetTypes.slice(0, 4)) {
      parts.push(socialPlannerAssetTypeLabel(assetType));
    }
  }

  return parts.filter(Boolean).join(" ");
}

export function socialCalendarMatchesHistorySearch(
  item: SocialCalendarListItemDto,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return buildSocialCalendarHistorySearchCorpus(item)
    .toLowerCase()
    .includes(needle);
}

export function filterSocialCalendarsByHistorySearch<
  T extends SocialCalendarListItemDto,
>(items: T[], search: string): T[] {
  const needle = search.trim();
  if (!needle) return items;
  return items.filter((item) => socialCalendarMatchesHistorySearch(item, needle));
}

export function paginateSocialCalendarHistoryItems<T>(
  items: readonly T[],
  page: number,
  limit: number,
): T[] {
  const start = Math.max(0, (page - 1) * limit);
  return items.slice(start, start + limit);
}
