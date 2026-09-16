"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
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
import {
  SOCIAL_COMPOSER_ICON,
  SOCIAL_COMPOSER_SURFACE,
  SOCIAL_FIELD_CLASS,
  SOCIAL_FIELD_HELP_CLASS,
  SOCIAL_FIELD_LABEL_CLASS,
  SOCIAL_PRIMARY_CLASS,
  SOCIAL_TEXTAREA_CLASS,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import {
  SOCIAL_PLANNER_TARGET_CLEAR_HREF,
  SOCIAL_TARGET_CLEAR_CLASS,
  SOCIAL_TARGET_SURFACE_CLASS,
  type SocialPlannerTargetAudienceView,
} from "@/lib/socialPlanner/socialPlannerTargetPresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

export type SocialPlannerCreateFormHandle = {
  focusComposer: () => void;
};

type SocialPlannerCreateFormProps = {
  plannerKind: SocialCalendarImplementedPlannerKind;
  submitting: boolean;
  error: string | null;
  targetAudience?: SocialPlannerTargetAudienceView | null;
  clearHref?: string;
  onSubmit: (body: ReturnType<typeof buildSocialCalendarCreateBody>) => void;
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export const SocialPlannerCreateForm = forwardRef<
  SocialPlannerCreateFormHandle,
  SocialPlannerCreateFormProps
>(function SocialPlannerCreateForm(
  {
    plannerKind,
    submitting,
    error,
    targetAudience = null,
    clearHref = SOCIAL_PLANNER_TARGET_CLEAR_HREF,
    onSubmit,
    messages,
    locale = "en-US",
  },
  ref,
) {
  const copy = (messages ?? en).socialPlanner;
  const [periodStart, setPeriodStart] = useState(todayLocalCalendarDate);
  const [guidance, setGuidance] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const isEvergreen = plannerKind === "evergreen";

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
          personaId: targetAudience?.personaId ?? null,
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
      data-planner-kind={plannerKind}
      className={SOCIAL_COMPOSER_SURFACE}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-start gap-4">
          <span className={SOCIAL_COMPOSER_ICON} aria-hidden="true">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {isEvergreen ? copy.selectWeekEvergreen : copy.selectWeekDaily}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              {isEvergreen ? copy.selectWeekEvergreenHelp : copy.selectWeekDailyHelp}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block space-y-2" htmlFor="social-planner-week-start">
            <span className={SOCIAL_FIELD_LABEL_CLASS}>{copy.weekStarts}</span>
            <input
              ref={dateInputRef}
              id="social-planner-week-start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              required
              className={SOCIAL_FIELD_CLASS}
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
              <p className={`${SOCIAL_FIELD_HELP_CLASS} leading-6`}>
                {period.dates
                  .map((date) => date.slice(8, 10))
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </div>

        {targetAudience ? (
          <div
            data-social-planner-target="audience"
            className={SOCIAL_TARGET_SURFACE_CLASS}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <span className={SOCIAL_FIELD_LABEL_CLASS}>
                  {copy.targetAudience}
                </span>
                <p
                  data-social-planner-target-name=""
                  className="text-sm font-medium text-white"
                >
                  {targetAudience.name}
                </p>
                {targetAudience.summary ? (
                  <p
                    data-social-planner-target-summary=""
                    className="text-sm leading-6 text-white/55"
                  >
                    {targetAudience.summary}
                  </p>
                ) : null}
              </div>
              <Link
                href={clearHref}
                data-social-planner-clear-target=""
                className={SOCIAL_TARGET_CLEAR_CLASS}
              >
                {copy.clear}
              </Link>
            </div>
          </div>
        ) : null}

        <label className="block space-y-2" htmlFor="social-planner-guidance">
          <span className={SOCIAL_FIELD_LABEL_CLASS}>
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
            className={SOCIAL_TEXTAREA_CLASS}
            placeholder={copy.guidancePlaceholder}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className={SOCIAL_FIELD_HELP_CLASS}>{copy.guidanceHelp}</p>
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
          className={SOCIAL_PRIMARY_CLASS}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {submitting
            ? copy.starting
            : isEvergreen
              ? copy.generateEvergreenWeek
              : copy.generateDailyWeek}
        </button>
      </form>
    </section>
  );
});
