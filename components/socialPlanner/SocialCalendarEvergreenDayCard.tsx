"use client";

import { useId, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  MessageCircleQuestionMark,
  Newspaper,
} from "lucide-react";
import type { SocialCalendarEvergreenDayV1 } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  CopyButton,
  type AssetCopyTrackingContext,
} from "@/components/deployment/CopyButton";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { BlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import { SocialPlannerCopyableField } from "@/components/socialPlanner/SocialCalendarProductionSpec";
import { SocialPlannerBrandDirection } from "@/components/socialPlanner/SocialPlannerBrandDirection";
import { formatSocialPlannerDayHeader } from "@/components/socialPlanner/socialPlannerDates";
import {
  composeSocialPlannerDayCopyWithBrandDirection,
  serializeSocialCalendarEvergreenDay,
} from "@/components/socialPlanner/socialPlannerAssetCopyText";
import {
  SOCIAL_DETAIL_COPY_SURFACE,
  SOCIAL_DETAIL_DAY_ACTION,
  SOCIAL_DETAIL_DAY_ICON,
  SOCIAL_DETAIL_DEFAULT_OPEN,
  SOCIAL_DETAIL_EVERGREEN_DAY_SURFACE,
  SOCIAL_DETAIL_EVERGREEN_FORMAT_CHIP,
  SOCIAL_DETAIL_EXPAND_ACTION,
  SOCIAL_DETAIL_ICON,
  SOCIAL_DETAIL_ICON_WELL,
  SOCIAL_DETAIL_META_CHIP,
} from "@/lib/socialPlanner/socialPlannerDetailPresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatSocialPlannerCalendarOpportunity,
  getLocalizedSocialPlannerEvergreenFormatLabel,
  getSocialPlannerCopyChrome,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

type SocialCalendarEvergreenDayCardProps = {
  day: SocialCalendarEvergreenDayV1;
  onDiscussWithAthena?: (reference: { date: string }) => void;
  tracking: AssetCopyTrackingContext;
  initiallyDone?: boolean;
  initiallyTags?: AssetUsageTag[];
  continuationPreferences?: AiWorkspacePreferences | null;
  brandDirection?: BlueprintBrandDirectionInput | null;
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export function SocialCalendarEvergreenDayCard({
  day,
  onDiscussWithAthena,
  tracking,
  initiallyDone = false,
  initiallyTags = [],
  continuationPreferences = null,
  brandDirection = null,
  messages,
  locale = "en-US",
}: SocialCalendarEvergreenDayCardProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const copyChrome = getSocialPlannerCopyChrome(dictionary);
  const [open, setOpen] = useState<boolean>(SOCIAL_DETAIL_DEFAULT_OPEN.day);
  const panelId = useId();
  const selectedAnchors = day.calendarAnchors.filter((anchor) =>
    Boolean(anchor.label?.trim()),
  );
  const copyText = composeSocialPlannerDayCopyWithBrandDirection(
    serializeSocialCalendarEvergreenDay(day),
    brandDirection,
  );
  const formatLabel = getLocalizedSocialPlannerEvergreenFormatLabel(
    dictionary,
    day.evergreenFormat,
  );

  return (
    <article
      id={`social-planner-day-${day.date}`}
      className={`scroll-mt-8 min-w-0 ${SOCIAL_DETAIL_EVERGREEN_DAY_SURFACE}`}
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className={SOCIAL_DETAIL_DAY_ICON} aria-hidden="true">
          <CalendarDays className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">
            {formatSocialPlannerDayHeader(day.weekday, day.date, locale)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={SOCIAL_DETAIL_EVERGREEN_FORMAT_CHIP}>
              {formatLabel}
            </span>
          </div>
          <h3 className="break-words text-base font-semibold leading-6 text-white sm:text-lg">
            {day.title}
          </h3>
          {day.concept ? (
            <p className="line-clamp-2 text-sm leading-5 text-white/55">
              {day.concept}
            </p>
          ) : null}
        </div>
        <div
          className="flex flex-wrap items-center justify-end gap-2"
          data-asset-actions=""
        >
          {onDiscussWithAthena ? (
            <button
              type="button"
              onClick={() => onDiscussWithAthena({ date: day.date })}
              className={SOCIAL_DETAIL_DAY_ACTION}
            >
              <MessageCircleQuestionMark className="size-3.5" aria-hidden="true" />
              {copy.discussWithAthena}
            </button>
          ) : null}
          <CopyButton
            text={copyText}
            tracking={tracking}
            initiallyDone={initiallyDone}
            initiallyTags={initiallyTags}
            showContinue
            variant="utility"
            assetType={day.evergreenFormat}
            continuationPreferences={continuationPreferences}
            chrome={copyChrome}
          />
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? copy.closeAsset : copy.openAsset}
            className={SOCIAL_DETAIL_EXPAND_ACTION}
          >
            {open ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            <span className="sr-only">
              {open ? copy.closeAsset : copy.openAsset}
            </span>
          </button>
        </div>
      </header>

      {open ? (
        <div
          id={panelId}
          className="mt-5 space-y-5 border-t border-white/10 pt-5"
        >
          {day.audience ? (
            <p className="text-sm leading-6 text-white/55">
              <span className="text-white/40">{copy.whoThisIsFor}: </span>
              {day.audience}
            </p>
          ) : null}
          {selectedAnchors.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedAnchors.map((anchor) => (
                <span
                  key={`${anchor.sourceCandidateId}-${anchor.label}`}
                  className={SOCIAL_DETAIL_META_CHIP}
                >
                  {formatSocialPlannerCalendarOpportunity(
                    dictionary,
                    anchor.label,
                  )}
                </span>
              ))}
            </div>
          ) : null}
          {day.draft?.trim() ? (
            <div className={SOCIAL_DETAIL_COPY_SURFACE}>
              <div className="flex items-start gap-3">
                <span
                  className={`${SOCIAL_DETAIL_ICON_WELL} ${SOCIAL_DETAIL_ICON.violet}`}
                  aria-hidden="true"
                >
                  <Newspaper className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <SocialPlannerCopyableField
                    label={copy.draft}
                    value={day.draft}
                    chrome={copyChrome}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {day.cta?.trim() ? (
            <SocialPlannerCopyableField
              label={copy.cta}
              value={day.cta}
              chrome={copyChrome}
            />
          ) : null}
          {day.publishingGuidance?.trim() ? (
            <SocialPlannerCopyableField
              label={copy.publishingGuidance}
              value={day.publishingGuidance}
              chrome={copyChrome}
            />
          ) : null}
          <SocialPlannerBrandDirection brandDirection={brandDirection} />
        </div>
      ) : null}
    </article>
  );
}
