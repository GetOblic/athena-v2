"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, MessagesSquare, RefreshCw, Target } from "lucide-react";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { BlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import type { SocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import type { SocialPlannerConversationAssetReference } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import { SocialCalendarDayCard } from "@/components/socialPlanner/SocialCalendarDayCard";
import { SocialCalendarEvergreenDayCard } from "@/components/socialPlanner/SocialCalendarEvergreenDayCard";
import {
  isSocialCalendarEvergreenPackage,
  socialCalendarWeekItems,
} from "@/services/socialPlanner/generation/socialCalendarPackageUnion";
import { SocialPlannerStatus } from "@/components/socialPlanner/SocialPlannerStatus";
import {
  formatSocialPlannerDayHeader,
  formatSocialPlannerPeriodLabel,
} from "@/components/socialPlanner/socialPlannerDates";
import { isSocialPlannerInFlight } from "@/components/socialPlanner/socialPlannerClient";
import { SocialPlannerAskAthenaPanel } from "@/components/socialPlanner/SocialPlannerAskAthenaPanel";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  SOCIAL_DETAIL_CHIP_META,
  SOCIAL_DETAIL_DAY_NAV_CHIP,
  SOCIAL_DETAIL_DEFAULT_OPEN,
  SOCIAL_DETAIL_FAILED_SURFACE,
  SOCIAL_DETAIL_HEADER_WELL,
  SOCIAL_DETAIL_ICON,
  SOCIAL_DETAIL_ICON_WELL,
  SOCIAL_DETAIL_SNAPSHOT,
  SOCIAL_DETAIL_STRATEGY_SURFACE,
  SOCIAL_DETAIL_UNAVAILABLE_SURFACE,
  SOCIAL_DETAIL_UTILITY_ACTION,
  presentSocialDetailSnapshot,
  shouldShowSocialDetailGenerationMode,
  socialPlannerDetailPlannerKindChipClass,
  socialPlannerDetailStatusChipClass,
} from "@/lib/socialPlanner/socialPlannerDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatSocialPlannerDiscussingLabel,
  formatSocialPlannerJumpToDayAria,
  formatSocialPlannerVersionLabel,
  getLocalizedSocialPlannerAssetTypeLabel,
  getLocalizedSocialPlannerEvergreenFormatLabel,
  getLocalizedSocialPlannerGenerationModeLabel,
  getLocalizedSocialPlannerHistoryStatusLabel,
  getLocalizedSocialPlannerFailedHeadline,
  getLocalizedSocialPlannerPlannerKindLabel,
  getLocalizedSocialPlannerReadyHeadline,
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
  continuationPreferences?: AiWorkspacePreferences | null;
  brandDirection?: BlueprintBrandDirectionInput | null;
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
  continuationPreferences = null,
  brandDirection = null,
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
        plannerKind={calendar.plannerKind}
        pollNotice={pollNotice}
        messages={dictionary}
      />
    );
  }

  if (calendar.status === "Processing Failed") {
    const failedPlannerKindLabel = getLocalizedSocialPlannerPlannerKindLabel(
      dictionary,
      calendar.plannerKind,
    );
    return (
      <section className={SOCIAL_DETAIL_FAILED_SURFACE}>
        <div className="flex items-start gap-3">
          <span
            className={`${SOCIAL_DETAIL_ICON_WELL} ${SOCIAL_DETAIL_ICON.rose}`}
            aria-hidden="true"
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={socialPlannerDetailStatusChipClass(calendar.status)}>
                {copy.status.failed}
              </span>
              <span
                className={socialPlannerDetailPlannerKindChipClass(
                  calendar.plannerKind,
                )}
              >
                {failedPlannerKindLabel}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {getLocalizedSocialPlannerFailedHeadline(
                dictionary,
                calendar.plannerKind,
              )}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-rose-100/75">
          {calendar.error?.message || copy.generationFailedTryAgain}
        </p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className={SOCIAL_DETAIL_UTILITY_ACTION}
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </section>
    );
  }

  if (calendar.packageUnavailable || !calendar.package) {
    return (
      <section className={SOCIAL_DETAIL_UNAVAILABLE_SURFACE}>
        <h2 className="text-2xl font-semibold tracking-tight">
          {copy.couldNotDisplay}
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/50">{periodLabel}</p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className={SOCIAL_DETAIL_UTILITY_ACTION}
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
      continuationPreferences={continuationPreferences}
      brandDirection={brandDirection}
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
  continuationPreferences,
  brandDirection,
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
  continuationPreferences: AiWorkspacePreferences | null;
  brandDirection: BlueprintBrandDirectionInput | null;
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
  const isEvergreen = isSocialCalendarEvergreenPackage(socialPackage);
  const [discussAssetReference, setDiscussAssetReference] =
    useState<SocialPlannerConversationAssetReference | null>(null);
  const [askOpen, setAskOpen] = useState<boolean>(
    SOCIAL_DETAIL_DEFAULT_OPEN.askAthena,
  );
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

  if (
    (calendar.plannerKind === "evergreen" && !isEvergreen) ||
    (calendar.plannerKind !== "evergreen" && isEvergreen)
  ) {
    return (
      <section className={SOCIAL_DETAIL_UNAVAILABLE_SURFACE}>
        <h2 className="text-2xl font-semibold tracking-tight">
          {copy.couldNotDisplay}
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/50">{periodLabel}</p>
        <div className="mt-6" data-ready-actions="">
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className={SOCIAL_DETAIL_UTILITY_ACTION}
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </section>
    );
  }

  const weekItems = socialCalendarWeekItems(socialPackage).slice(0, 7);
  const snapshot = presentSocialDetailSnapshot({
    userGuidance: calendar.userGuidance,
    strategySummary: socialPackage.strategySummary,
  });
  const showGenerationMode = shouldShowSocialDetailGenerationMode(
    calendar.generationMode,
  );
  const plannerKindLabel = getLocalizedSocialPlannerPlannerKindLabel(
    messages,
    calendar.plannerKind,
  );

  function handleDiscussWithAthena(reference: SocialPlannerConversationAssetReference) {
    setDiscussAssetReference({ date: reference.date });
    setAskOpen(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document
          .getElementById("social-planner-conversation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("social-planner-conversation-input")?.focus();
      }, 50);
    }
  }

  const selectedItem = discussAssetReference
    ? weekItems.find((item) => item.date === discussAssetReference.date) ?? null
    : null;
  const discussFocusLabel = selectedItem
    ? formatSocialPlannerDiscussingLabel(
        messages,
        formatSocialPlannerDayHeader(
          selectedItem.weekday,
          selectedItem.date,
          locale,
        ),
        isEvergreen
          ? getLocalizedSocialPlannerEvergreenFormatLabel(
              messages,
              selectedItem.formatKey,
            )
          : getLocalizedSocialPlannerAssetTypeLabel(
              messages,
              selectedItem.formatKey,
            ),
      )
    : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className={SOCIAL_DETAIL_HEADER_WELL} aria-hidden="true">
              <MessagesSquare className="size-5" />
            </span>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
              {copy.title}
            </div>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {getLocalizedSocialPlannerReadyHeadline(
              messages,
              calendar.plannerKind,
            )}
          </h2>
          <p className="mt-2 text-base text-white/55">{periodLabel}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={socialPlannerDetailStatusChipClass(calendar.status)}>
              {getLocalizedSocialPlannerHistoryStatusLabel(
                messages,
                calendar.status,
              )}
            </span>
            <span className={SOCIAL_DETAIL_CHIP_META}>
              {formatSocialPlannerVersionLabel(messages, calendar.versionNumber)}
            </span>
            <span className={socialPlannerDetailPlannerKindChipClass(calendar.plannerKind)}>
              {plannerKindLabel}
            </span>
            {showGenerationMode ? (
              <span className={SOCIAL_DETAIL_CHIP_META}>
                {getLocalizedSocialPlannerGenerationModeLabel(
                  messages,
                  calendar.generationMode,
                )}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-ready-actions="">
          {onThinkDifferently ? (
            <button
              type="button"
              title={copy.thinkDifferentlyTitle}
              disabled={thinkDifferentlyPending}
              onClick={onThinkDifferently}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-5 py-3 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {copy.thinkDifferently}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreateAnotherWeek}
            className={SOCIAL_DETAIL_UTILITY_ACTION}
          >
            {copy.createAnotherWeek}
          </button>
        </div>
      </div>

      {thinkDifferentlyError ? (
        <p className="text-sm text-rose-100/80">{thinkDifferentlyError}</p>
      ) : null}

      <div className={SOCIAL_DETAIL_SNAPSHOT}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={SOCIAL_DETAIL_CHIP_META}>{periodLabel}</span>
          <span className={socialPlannerDetailStatusChipClass(calendar.status)}>
            {getLocalizedSocialPlannerHistoryStatusLabel(
              messages,
              calendar.status,
            )}
          </span>
          <span className={SOCIAL_DETAIL_CHIP_META}>
            {formatSocialPlannerVersionLabel(messages, calendar.versionNumber)}
          </span>
          <span className={socialPlannerDetailPlannerKindChipClass(calendar.plannerKind)}>
            {plannerKindLabel}
          </span>
          {showGenerationMode ? (
            <span className={SOCIAL_DETAIL_CHIP_META}>
              {getLocalizedSocialPlannerGenerationModeLabel(
                messages,
                calendar.generationMode,
              )}
            </span>
          ) : null}
        </div>
        {snapshot.userGuidance ? (
          <p className="mt-2 text-sm leading-6 text-white/50">
            <span className="text-white/35">{copy.optionalDirection}: </span>
            {snapshot.userGuidance}
          </p>
        ) : null}
        {snapshot.strategyPreview ? (
          <p className="mt-2 text-sm leading-6 text-white/45">
            {snapshot.strategyPreview}
          </p>
        ) : null}
      </div>

      <AthenaCollapsibleSection
        title={copy.whyThisWeekWorks}
        summary={snapshot.strategyPreview ?? undefined}
        defaultOpen={SOCIAL_DETAIL_DEFAULT_OPEN.strategy}
        tone="intelligence"
        icon={<Target aria-hidden="true" />}
        iconClassName={SOCIAL_DETAIL_ICON.violet}
        className={SOCIAL_DETAIL_STRATEGY_SURFACE}
      >
        {socialPackage.strategySummary ? (
          <p className="text-sm leading-7 text-white/70">
            {socialPackage.strategySummary}
          </p>
        ) : null}
        <p
          className={
            socialPackage.strategySummary
              ? "mt-4 text-sm leading-7 text-white/70"
              : "text-sm leading-7 text-white/70"
          }
        >
          {socialPackage.whyThisWeekWorks}
        </p>
      </AthenaCollapsibleSection>

      <nav
        data-day-navigation=""
        aria-label={copy.jumpToDay}
        className="overflow-x-auto"
      >
        <div className="flex flex-nowrap gap-2">
          {weekItems.map((item) => {
            const label = formatSocialPlannerDayHeader(
              item.weekday,
              item.date,
              locale,
            );
            return (
              <button
                key={item.date}
                type="button"
                aria-label={formatSocialPlannerJumpToDayAria(messages, label)}
                onClick={() => {
                  document
                    .getElementById(`social-planner-day-${item.date}`)
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                }}
                className={SOCIAL_DETAIL_DAY_NAV_CHIP}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="space-y-4">
        {isEvergreen
          ? socialPackage.days.map((day) => {
              const interactionKey = buildSocialCalendarAssetInteractionType(
                day.date,
              );
              return (
                <SocialCalendarEvergreenDayCard
                  key={`${day.date}-${day.evergreenFormat}`}
                  day={day}
                  onDiscussWithAthena={handleDiscussWithAthena}
                  tracking={{
                    sourceType: "social_calendar",
                    sourceId: calendar.id,
                    executiveVersionId: null,
                    assetType: interactionKey,
                  }}
                  initiallyDone={Boolean(doneByAssetType[interactionKey])}
                  initiallyTags={tagsByAssetType[interactionKey] ?? []}
                  continuationPreferences={continuationPreferences}
                  brandDirection={brandDirection}
                  messages={messages}
                  locale={locale}
                />
              );
            })
          : socialPackage.assets.map((asset) => {
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
                  continuationPreferences={continuationPreferences}
                  brandDirection={brandDirection}
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
          open={askOpen}
          onOpenChange={setAskOpen}
          messages={messages}
        />
      </div>
    </section>
  );
}
