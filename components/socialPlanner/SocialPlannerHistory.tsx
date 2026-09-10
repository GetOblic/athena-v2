"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarSearch } from "lucide-react";
import type {
  SocialCalendarHistoryPaginationDto,
  SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import {
  formatSocialPlannerCreatedDate,
  formatSocialPlannerPeriodLabel,
} from "@/components/socialPlanner/socialPlannerDates";
import { isSocialPlannerInFlight } from "@/components/socialPlanner/socialPlannerClient";
import {
  SOCIAL_EMPTY_SEARCH_CLASS,
  SOCIAL_EMPTY_SEARCH_ICON,
  SOCIAL_HISTORY_HEADING_CLASS,
  SOCIAL_OPEN_ACTION_CLASS,
  SOCIAL_PAGINATION_BUTTON_CLASS,
  SOCIAL_PAGINATION_CLASS,
  SOCIAL_WEEK_CARD_CLASS,
  SOCIAL_WEEK_ICON_CLASS,
  socialPlannerGenerationModeBadgeClass,
  socialPlannerHistoryStatusClass,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatSocialPlannerAssetsCount,
  formatSocialPlannerShowingLabel,
  formatSocialPlannerVersionLabel,
  getLocalizedSocialPlannerAssetTypeLabel,
  getLocalizedSocialPlannerGenerationModeLabel,
  getLocalizedSocialPlannerHistoryStatusLabel,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type SocialPlannerHistoryProps = {
  calendars: SocialCalendarListItemDto[];
  pagination: SocialCalendarHistoryPaginationDto;
  search: string;
  onPageChange: (page: number) => void;
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export function SocialPlannerHistory({
  calendars,
  pagination,
  search,
  onPageChange,
  messages,
  locale = "en-US",
}: SocialPlannerHistoryProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const hasSearch = search.trim().length > 0;
  if (!hasSearch && pagination.total === 0 && calendars.length === 0) {
    return null;
  }

  const rangeStart =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(
    pagination.page * pagination.limit,
    pagination.total,
  );
  const showPagination = pagination.total > pagination.limit;

  return (
    <section className="space-y-4">
      <div>
        <h2 className={SOCIAL_HISTORY_HEADING_CLASS}>{copy.historyTitle}</h2>
        <p className="mt-1 text-sm text-white/45">{copy.historySubtitle}</p>
      </div>

      {calendars.length === 0 ? (
        <div className={SOCIAL_EMPTY_SEARCH_CLASS}>
          <div className={SOCIAL_EMPTY_SEARCH_ICON} aria-hidden="true">
            <CalendarSearch className="size-5" />
          </div>
          <p className="text-sm leading-7 text-white/50">{copy.noSearchMatch}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calendars.map((calendar) => {
            const statusLabel = getLocalizedSocialPlannerHistoryStatusLabel(
              dictionary,
              calendar.status,
            );
            const typeSummary = calendar.assetTypes
              .slice(0, 4)
              .map((type) =>
                getLocalizedSocialPlannerAssetTypeLabel(dictionary, type),
              )
              .join(" · ");

            return (
              <article key={calendar.id} className={SOCIAL_WEEK_CARD_CLASS}>
                <div className="flex items-start gap-3">
                  <span className={SOCIAL_WEEK_ICON_CLASS} aria-hidden="true">
                    <CalendarDays className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold tracking-tight">
                        {formatSocialPlannerPeriodLabel(
                          calendar.periodStart,
                          calendar.periodEnd,
                          locale,
                        )}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={socialPlannerHistoryStatusClass(
                          calendar.status,
                        )}
                      >
                        {statusLabel}
                      </span>
                      {calendar.generationMode !== "standard" ||
                      calendar.versionNumber > 1 ? (
                        <span
                          className={socialPlannerGenerationModeBadgeClass(
                            calendar.generationMode,
                          )}
                        >
                          {[
                            calendar.generationMode !== "standard"
                              ? getLocalizedSocialPlannerGenerationModeLabel(
                                  dictionary,
                                  calendar.generationMode,
                                )
                              : null,
                            calendar.versionNumber > 1
                              ? formatSocialPlannerVersionLabel(
                                  dictionary,
                                  calendar.versionNumber,
                                )
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </div>

                    {calendar.status === "Ready" && calendar.strategySummary ? (
                      <p className="line-clamp-2 text-sm leading-6 text-white/55">
                        {calendar.strategySummary}
                      </p>
                    ) : null}
                    {calendar.status === "Ready" && calendar.whyThisWeekWorks ? (
                      <p className="line-clamp-2 text-sm leading-6 text-white/40">
                        {calendar.whyThisWeekWorks}
                      </p>
                    ) : null}
                    {isSocialPlannerInFlight(calendar.status) ? (
                      <p className="text-sm text-white/45">{copy.stillPlanning}</p>
                    ) : null}
                    {calendar.status === "Processing Failed" ? (
                      <p className="text-sm text-rose-100/70">
                        {copy.generationFailedTryAgain}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-white/35">
                      {calendar.status === "Ready" ? (
                        <span>
                          {formatSocialPlannerAssetsCount(
                            dictionary,
                            calendar.assetCount,
                            typeSummary,
                          )}
                        </span>
                      ) : null}
                      <span>
                        {formatSocialPlannerCreatedDate(
                          calendar.createdAt,
                          locale,
                        )}
                      </span>
                    </div>
                    {calendar.modelsUsed ? (
                      <div className="text-xs leading-5 text-white/55">
                        {calendar.modelsUsed}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link
                    href={`/social-planner/${calendar.id}`}
                    className={SOCIAL_OPEN_ACTION_CLASS}
                  >
                    {copy.openCalendar}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showPagination ? (
        <div className={SOCIAL_PAGINATION_CLASS}>
          <div>
            {formatSocialPlannerShowingLabel(
              dictionary,
              rangeStart,
              rangeEnd,
              pagination.total,
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              className={SOCIAL_PAGINATION_BUTTON_CLASS}
            >
              {copy.previous}
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                onPageChange(
                  Math.min(pagination.totalPages, pagination.page + 1),
                )
              }
              className={SOCIAL_PAGINATION_BUTTON_CLASS}
            >
              {copy.next}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
