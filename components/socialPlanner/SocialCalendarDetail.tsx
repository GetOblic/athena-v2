"use client";

import { useEffect, useState } from "react";
import type { SocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import type { SocialPlannerConversationAssetReference } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import { SocialCalendarDayCard } from "@/components/socialPlanner/SocialCalendarDayCard";
import { SocialPlannerStatus } from "@/components/socialPlanner/SocialPlannerStatus";
import {
  formatSocialPlannerDayHeader,
  formatSocialPlannerPeriodLabel,
} from "@/components/socialPlanner/socialPlannerDates";
import { isSocialPlannerInFlight } from "@/components/socialPlanner/socialPlannerClient";
import { SocialPlannerAskAthenaPanel } from "@/components/socialPlanner/SocialPlannerAskAthenaPanel";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatSocialPlannerDiscussingLabel,
  formatSocialPlannerJumpToDayAria,
  getLocalizedSocialPlannerAssetTypeLabel,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import { buildSocialCalendarAssetInteractionType } from "@/services/assetInteractions/assetInteractionKeys";
import {
  isAssetUsageTag,
  type AssetUsageTag,
} from "@/services/assetInteractions/assetUsageTags";

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
  messages?: TenantMessages;
  language?: OrganizationLanguage;
  locale?: TenantFormattingLocale;
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
  messages,
  locale = "en-US",
}: SocialCalendarDetailProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const periodLabel = formatSocialPlannerPeriodLabel(
    calendar.periodStart,
    calendar.periodEnd,
    locale,
  );

  if (isSocialPlannerInFlight(calendar.status)) {
    return (
      <SocialPlannerStatus
        status={calendar.status}
        generationStage={calendar.generationStage}
        pollNotice={pollNotice}
        messages={dictionary}
      />
    );
  }

  if (calendar.status === "Processing Failed") {
    return (
      <section className="rounded-[28px] border border-rose-400/25 bg-rose-500/10 p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200">
          {copy.status.failed}
        </div>
        <h2 className="mt-3 text-2xl font-semibold">{copy.couldNotFinish}</h2>
        <p className="mt-3 text-sm leading-7 text-rose-100/75">
          {calendar.error?.message || copy.generationFailedTryAgain}
        </p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </section>
    );
  }

  if (calendar.packageUnavailable || !calendar.package) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">{copy.couldNotDisplay}</h2>
        <p className="mt-3 text-sm leading-7 text-white/50">{periodLabel}</p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </section>
    );
  }

  return (
    <SocialCalendarReadyDetail
      key={calendar.id}
      calendar={{ ...calendar, package: calendar.package }}
      thinkDifferentlyPending={thinkDifferentlyPending}
      thinkDifferentlyError={thinkDifferentlyError}
      applyPending={applyPending}
      applyError={applyError}
      onCreateAnotherWeek={onCreateAnotherWeek}
      onThinkDifferently={onThinkDifferently}
      onApplySuggestions={onApplySuggestions}
      messages={dictionary}
      locale={locale}
    />
  );
}

function SocialCalendarReadyDetail({
  calendar,
  thinkDifferentlyPending,
  thinkDifferentlyError,
  applyPending,
  applyError,
  onCreateAnotherWeek,
  onThinkDifferently,
  onApplySuggestions,
  messages,
  locale,
}: {
  calendar: SocialCalendarDetailDto & {
    package: NonNullable<SocialCalendarDetailDto["package"]>;
  };
  thinkDifferentlyPending: boolean;
  thinkDifferentlyError: string | null;
  applyPending: boolean;
  applyError: string | null;
  onCreateAnotherWeek: () => void;
  onThinkDifferently?: () => void;
  onApplySuggestions?: () => void;
  messages: TenantMessages;
  locale: TenantFormattingLocale;
}) {
  const copy = messages.socialPlanner;
  const periodLabel = formatSocialPlannerPeriodLabel(
    calendar.periodStart,
    calendar.periodEnd,
    locale,
  );
  const socialPackage = calendar.package;
  const assets = socialPackage.assets.slice(0, 7);
  const [discussAssetReference, setDiscussAssetReference] =
    useState<SocialPlannerConversationAssetReference | null>(null);
  const [doneByAssetType, setDoneByAssetType] = useState<
    Record<string, boolean>
  >({});
  const [tagsByAssetType, setTagsByAssetType] = useState<
    Record<string, AssetUsageTag[]>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadInteractionState() {
      setDoneByAssetType({});
      setTagsByAssetType({});
      const params = new URLSearchParams({
        sourceType: "social_calendar",
        sourceId: calendar.id,
      });

      try {
        const response = await fetch(`/api/asset-interactions?${params}`);
        const payload = await parseJsonResponse<{
          interactions?: Record<
            string,
            { done?: boolean; tags?: string[] }
          >;
        }>(response);
        if (cancelled || !response.ok) {
          return;
        }

        const nextDone: Record<string, boolean> = {};
        const nextTags: Record<string, AssetUsageTag[]> = {};
        for (const [assetType, interaction] of Object.entries(
          payload.interactions ?? {},
        )) {
          if (interaction?.done) {
            nextDone[assetType] = true;
          }
          const tags = (interaction?.tags ?? []).filter(isAssetUsageTag);
          if (tags.length > 0) {
            nextTags[assetType] = tags;
          }
        }
        setDoneByAssetType(nextDone);
        setTagsByAssetType(nextTags);
      } catch (error) {
        console.error("[ASSET_COPY] load_done_state_failed", error);
      }
    }

    void loadInteractionState();
    return () => {
      cancelled = true;
    };
  }, [calendar.id]);

  function handleDiscussWithAthena(reference: SocialPlannerConversationAssetReference) {
    setDiscussAssetReference({ date: reference.date });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document
          .getElementById("social-planner-conversation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("social-planner-conversation-input")?.focus();
      }, 0);
    }
  }

  const selectedAsset = discussAssetReference
    ? assets.find((asset) => asset.date === discussAssetReference.date) ?? null
    : null;
  const discussFocusLabel = selectedAsset
    ? formatSocialPlannerDiscussingLabel(
        messages,
        formatSocialPlannerDayHeader(
          selectedAsset.weekday,
          selectedAsset.date,
          locale,
        ),
        getLocalizedSocialPlannerAssetTypeLabel(
          messages,
          selectedAsset.assetType,
        ),
      )
    : null;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.status.ready}
          </div>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">
            {copy.yourSocialWeek}
          </h2>
          <p className="mt-3 text-base text-white/55">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap gap-3" data-ready-actions="">
          {onThinkDifferently ? (
            <button
              type="button"
              title={copy.thinkDifferentlyTitle}
              disabled={thinkDifferentlyPending}
              onClick={onThinkDifferently}
              className="w-full rounded-2xl border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-5 py-3 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {copy.thinkDifferently}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 sm:w-auto"
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </div>

      {thinkDifferentlyError ? (
        <p className="text-sm text-rose-100/80">{thinkDifferentlyError}</p>
      ) : null}

      <nav
        data-day-navigation=""
        aria-label={copy.jumpToDay}
        className="overflow-x-auto"
      >
        <div className="flex flex-nowrap gap-2">
          {assets.map((asset) => {
            const label = formatSocialPlannerDayHeader(
              asset.weekday,
              asset.date,
              locale,
            );
            return (
              <button
                key={asset.date}
                type="button"
                aria-label={formatSocialPlannerJumpToDayAria(messages, label)}
                onClick={() => {
                  document
                    .getElementById(`social-planner-day-${asset.date}`)
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                }}
                className="shrink-0 whitespace-nowrap rounded-2xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-7">
        {socialPackage.strategySummary ? (
          <p className="text-sm leading-7 text-white/50">
            {socialPackage.strategySummary}
          </p>
        ) : null}
        <h3 className="mt-4 text-xl font-semibold">{copy.whyThisWeekWorks}</h3>
        <p className="mt-3 text-sm leading-7 text-white/70">
          {socialPackage.whyThisWeekWorks}
        </p>
      </div>

      <div className="space-y-5">
        {assets.map((asset) => {
          const interactionKey = buildSocialCalendarAssetInteractionType(
            asset.date,
          );
          return (
            <SocialCalendarDayCard
              key={`${asset.date}-${asset.assetType}`}
              asset={asset}
              onDiscussWithAthena={handleDiscussWithAthena}
              tracking={{
                sourceType: "social_calendar",
                sourceId: calendar.id,
                executiveVersionId: null,
                assetType: interactionKey,
              }}
              initiallyDone={Boolean(doneByAssetType[interactionKey])}
              initiallyTags={tagsByAssetType[interactionKey] ?? []}
              messages={messages}
              locale={locale}
            />
          );
        })}
      </div>

      <div data-ask-athena-slot="">
        <SocialPlannerAskAthenaPanel
          calendarId={calendar.id}
          assetReference={discussAssetReference}
          onAssetReferenceChange={setDiscussAssetReference}
          discussFocusLabel={discussFocusLabel}
          applyPending={applyPending}
          applyError={applyError}
          onApply={onApplySuggestions}
          messages={messages}
        />
      </div>
    </section>
  );
}
