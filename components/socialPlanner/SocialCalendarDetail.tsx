"use client";

import type { SocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import { SocialCalendarDayCard } from "@/components/socialPlanner/SocialCalendarDayCard";
import { SocialPlannerStatus } from "@/components/socialPlanner/SocialPlannerStatus";
import { formatSocialPlannerPeriodLabel } from "@/components/socialPlanner/socialPlannerDates";
import { isSocialPlannerInFlight } from "@/components/socialPlanner/socialPlannerClient";
import { SocialPlannerAskAthenaPanel } from "@/components/socialPlanner/SocialPlannerAskAthenaPanel";

type SocialCalendarDetailProps = {
  calendar: SocialCalendarDetailDto;
  pollNotice?: string | null;
  thinkDifferentlyPending?: boolean;
  thinkDifferentlyError?: string | null;
  applyPending?: boolean;
  applyError?: string | null;
  onCreateAnotherWeek: () => void;
  onThinkDifferently?: () => void;
  onApplySuggestions?: () => void;
};

export function SocialCalendarDetail({
  calendar,
  pollNotice = null,
  thinkDifferentlyPending = false,
  thinkDifferentlyError = null,
  applyPending = false,
  applyError = null,
  onCreateAnotherWeek,
  onThinkDifferently,
  onApplySuggestions,
}: SocialCalendarDetailProps) {
  const periodLabel = formatSocialPlannerPeriodLabel(
    calendar.periodStart,
    calendar.periodEnd,
  );

  if (isSocialPlannerInFlight(calendar.status)) {
    return (
      <SocialPlannerStatus
        status={calendar.status}
        generationStage={calendar.generationStage}
        pollNotice={pollNotice}
      />
    );
  }

  if (calendar.status === "Processing Failed") {
    return (
      <section className="rounded-[28px] border border-rose-400/25 bg-rose-500/10 p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200">
          Failed
        </div>
        <h2 className="mt-3 text-2xl font-semibold">
          Athena could not finish this week.
        </h2>
        <p className="mt-3 text-sm leading-7 text-rose-100/75">
          {calendar.error?.message || "Generation failed. Please try again."}
        </p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            Create Another Week
          </button>
        </div>
      </section>
    );
  }

  if (calendar.packageUnavailable || !calendar.package) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">This calendar could not be displayed.</h2>
        <p className="mt-3 text-sm leading-7 text-white/50">{periodLabel}</p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            Create Another Week
          </button>
        </div>
      </section>
    );
  }

  const socialPackage = calendar.package;
  const assets = socialPackage.assets.slice(0, 7);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Ready
          </div>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">
            Your Social Week
          </h2>
          <p className="mt-3 text-base text-white/55">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap gap-3" data-ready-actions="">
          {onThinkDifferently ? (
            <button
              type="button"
              title="Create a materially different version of this week."
              disabled={thinkDifferentlyPending}
              onClick={onThinkDifferently}
              className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              Think Differently
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 sm:w-auto"
          >
            Create Another Week
          </button>
        </div>
      </div>

      {thinkDifferentlyError ? (
        <p className="text-sm text-rose-100/80">{thinkDifferentlyError}</p>
      ) : null}

      <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-7">
        {socialPackage.strategySummary ? (
          <p className="text-sm leading-7 text-white/50">
            {socialPackage.strategySummary}
          </p>
        ) : null}
        <h3 className="mt-4 text-xl font-semibold">Why This Week Works</h3>
        <p className="mt-3 text-sm leading-7 text-white/70">
          {socialPackage.whyThisWeekWorks}
        </p>
      </div>

      <div className="space-y-5">
        {assets.map((asset) => (
          <SocialCalendarDayCard
            key={`${asset.date}-${asset.assetType}`}
            asset={asset}
          />
        ))}
      </div>

      <div data-ask-athena-slot="">
        <SocialPlannerAskAthenaPanel
          calendarId={calendar.id}
          applyPending={applyPending}
          applyError={applyError}
          onApply={onApplySuggestions}
        />
      </div>
    </section>
  );
}
