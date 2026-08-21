"use client";

import Link from "next/link";
import type {
  SocialCalendarHistoryPaginationDto,
  SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import {
  formatSocialPlannerCreatedDate,
  formatSocialPlannerPeriodLabel,
} from "@/components/socialPlanner/socialPlannerDates";
import {
  socialPlannerAssetTypeLabel,
  socialPlannerGenerationModeLabel,
  socialPlannerHistoryStatusLabel,
} from "@/components/socialPlanner/socialPlannerLabels";
import { isSocialPlannerInFlight } from "@/components/socialPlanner/socialPlannerClient";

type SocialPlannerHistoryProps = {
  calendars: SocialCalendarListItemDto[];
  pagination: SocialCalendarHistoryPaginationDto;
  search: string;
  onPageChange: (page: number) => void;
};

function statusTone(status: string): string {
  if (status === "Ready") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "Processing Failed") {
    return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  }
  return "border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 text-[var(--athena-orange)]";
}

function generationModeBadgeClass(generationMode: string): string {
  if (generationMode === "think_differently") {
    return "inline-flex rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--athena-success)]";
  }
  return "inline-flex rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50";
}

export function SocialPlannerHistory({
  calendars,
  pagination,
  search,
  onPageChange,
}: SocialPlannerHistoryProps) {
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
        <h2 className="text-3xl font-semibold tracking-tight">
          Your Social Calendars
        </h2>
        <p className="mt-2 text-sm text-white/45">
          Newest first. Open any week without regenerating it.
        </p>
      </div>

      {calendars.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-center">
          <p className="text-sm leading-7 text-white/50">
            No calendars match your search.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {calendars.map((calendar) => {
            const statusLabel = socialPlannerHistoryStatusLabel(calendar.status);
            const typeSummary = calendar.assetTypes
              .slice(0, 4)
              .map(socialPlannerAssetTypeLabel)
              .join(" · ");

            return (
              <article
                key={calendar.id}
                className={`${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS} flex flex-col gap-4 rounded-[24px] bg-[var(--athena-card)] p-5`}
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">
                      {formatSocialPlannerPeriodLabel(
                        calendar.periodStart,
                        calendar.periodEnd,
                      )}
                    </h3>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(
                        calendar.status,
                      )}`}
                    >
                      {statusLabel}
                    </span>
                    {calendar.generationMode !== "standard" ||
                    calendar.versionNumber > 1 ? (
                      <span
                        className={generationModeBadgeClass(
                          calendar.generationMode,
                        )}
                      >
                        {[
                          calendar.generationMode !== "standard"
                            ? socialPlannerGenerationModeLabel(
                                calendar.generationMode,
                              )
                            : null,
                          calendar.versionNumber > 1
                            ? `Version ${calendar.versionNumber}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </div>

                  {calendar.status === "Ready" && calendar.strategySummary ? (
                    <p className="text-sm leading-6 text-white/55">
                      {calendar.strategySummary}
                    </p>
                  ) : null}
                  {calendar.status === "Ready" && calendar.whyThisWeekWorks ? (
                    <p className="line-clamp-2 text-sm leading-6 text-white/40">
                      {calendar.whyThisWeekWorks}
                    </p>
                  ) : null}
                  {isSocialPlannerInFlight(calendar.status) ? (
                    <p className="text-sm text-white/45">
                      Athena is still planning this week.
                    </p>
                  ) : null}
                  {calendar.status === "Processing Failed" ? (
                    <p className="text-sm text-rose-100/70">
                      Generation failed. Please try again.
                    </p>
                  ) : null}

                  <div className="space-y-1 text-xs leading-5">
                    <div className="text-white/35">
                      {formatSocialPlannerCreatedDate(calendar.createdAt)}
                    </div>
                    {calendar.modelsUsed ? (
                      <div className="text-white/55">{calendar.modelsUsed}</div>
                    ) : null}
                    {calendar.status === "Ready" ? (
                      <div className="text-white/35">
                        {`${calendar.assetCount} assets${
                          typeSummary ? ` · ${typeSummary}` : ""
                        }`}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <Link
                    href={`/social-planner/${calendar.id}`}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] sm:w-auto"
                  >
                    Open Calendar
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showPagination ? (
        <div className="flex items-center justify-between text-sm text-white/45">
          <div>
            Showing {rangeStart}–{rangeEnd} of {pagination.total}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                onPageChange(
                  Math.min(pagination.totalPages, pagination.page + 1),
                )
              }
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
