"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS,
  parseSocialCalendarDate,
} from "@/services/socialPlanner/socialCalendarTypes";
import {
  deriveSocialPlannerPeriodEnd,
  formatSocialPlannerMonthCaption,
  formatWeekRangePreview,
  listSocialPlannerPeriodDates,
  todayLocalCalendarDate,
} from "@/components/socialPlanner/socialPlannerDates";
import { buildSocialCalendarCreateBody } from "@/components/socialPlanner/socialPlannerClient";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type SocialPlannerCreateFormHandle = {
  focusComposer: () => void;
};

type SocialPlannerCreateFormProps = {
  submitting: boolean;
  error: string | null;
  onSubmit: (body: ReturnType<typeof buildSocialCalendarCreateBody>) => void;
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export const SocialPlannerCreateForm = forwardRef<
  SocialPlannerCreateFormHandle,
  SocialPlannerCreateFormProps
>(function SocialPlannerCreateForm(
  { submitting, error, onSubmit, messages, locale = "en-US" },
  ref,
) {
  const copy = (messages ?? en).socialPlanner;
  const [periodStart, setPeriodStart] = useState(todayLocalCalendarDate);
  const [guidance, setGuidance] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    focusComposer() {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      dateInputRef.current?.focus();
    },
  }));

  const period = useMemo(() => {
    try {
      const start = parseSocialCalendarDate(periodStart);
      const end = deriveSocialPlannerPeriodEnd(start);
      return {
        start,
        end,
        preview: formatWeekRangePreview(start, end, locale),
        dates: listSocialPlannerPeriodDates(start),
        monthCaption: formatSocialPlannerMonthCaption(start, locale),
      };
    } catch {
      return null;
    }
  }, [periodStart, locale]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setLocalError(null);

    if (!periodStart.trim()) {
      setLocalError(copy.chooseStartDate);
      dateInputRef.current?.focus();
      return;
    }

    try {
      const start = parseSocialCalendarDate(periodStart);
      const end = deriveSocialPlannerPeriodEnd(start);
      onSubmit(
        buildSocialCalendarCreateBody({
          periodStart: start,
          periodEnd: end,
          userGuidance: guidance,
        }),
      );
    } catch {
      setLocalError(copy.chooseValidStartDate);
      dateInputRef.current?.focus();
    }
  }

  const displayError = localError || error;

  return (
    <section
      ref={composerRef}
      id="social-planner-composer"
      className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 sm:p-8"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">{copy.selectWeek}</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            {copy.selectWeekHelp}
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-2" htmlFor="social-planner-week-start">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {copy.weekStarts}
            </span>
            <input
              ref={dateInputRef}
              id="social-planner-week-start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              required
              className="w-full min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            />
          </label>

          {period ? (
            <div className="space-y-2">
              <p className="text-sm text-white/70">
                <span className="text-white/40">
                  {period.monthCaption}
                  {" · "}
                </span>
                {period.preview}
              </p>
              <p className="text-xs leading-6 text-white/40">
                {period.dates
                  .map((date) => date.slice(8, 10))
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </div>

        <label className="block space-y-2" htmlFor="social-planner-guidance">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.optionalDirection}
          </span>
          <textarea
            id="social-planner-guidance"
            value={guidance}
            onChange={(event) =>
              setGuidance(
                event.target.value.slice(0, SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS),
              )
            }
            maxLength={SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS}
            rows={5}
            className="min-h-[140px] w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            placeholder={copy.guidancePlaceholder}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs leading-5 text-white/40">{copy.guidanceHelp}</p>
            {guidance.length > 0 ? (
              <p className="shrink-0 text-xs tabular-nums text-white/35">
                {guidance.length} / {SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS}
              </p>
            ) : null}
          </div>
        </label>

        {displayError ? (
          <p className="text-sm text-rose-200" role="alert">
            {displayError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {submitting ? copy.starting : copy.generateMyWeek}
        </button>
      </form>
    </section>
  );
});
