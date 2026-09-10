"use client";

import { useId, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  MessageCircleQuestionMark,
  MessageSquareText,
} from "lucide-react";
import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  CopyButton,
  type AssetCopyTrackingContext,
} from "@/components/deployment/CopyButton";
import {
  SocialCalendarProductionSpec,
  SocialPlannerCopyableField,
} from "@/components/socialPlanner/SocialCalendarProductionSpec";
import { formatSocialPlannerDayHeader } from "@/components/socialPlanner/socialPlannerDates";
import { serializeSocialCalendarAsset } from "@/components/socialPlanner/socialPlannerAssetCopyText";
import {
  SOCIAL_DETAIL_COPY_SURFACE,
  SOCIAL_DETAIL_DAY_ACTION,
  SOCIAL_DETAIL_DAY_ICON,
  SOCIAL_DETAIL_DAY_SURFACE,
  SOCIAL_DETAIL_DEFAULT_OPEN,
  SOCIAL_DETAIL_EXPAND_ACTION,
  SOCIAL_DETAIL_ICON,
  SOCIAL_DETAIL_ICON_WELL,
  SOCIAL_DETAIL_META_CHIP,
  SOCIAL_DETAIL_PLATFORM_CHIP,
  SOCIAL_DETAIL_PRODUCTION_SURFACE,
} from "@/lib/socialPlanner/socialPlannerDetailPresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatSocialPlannerCalendarOpportunity,
  getLocalizedSocialPlannerAssetTypeLabel,
  getLocalizedSocialPlannerObjectiveLabel,
  getLocalizedSocialPlannerPlatformLabel,
  getSocialPlannerCopyChrome,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

type SocialCalendarDayCardProps = {
  asset: SocialCalendarAssetV1;
  onDiscussWithAthena?: (reference: { date: string }) => void;
  tracking: AssetCopyTrackingContext;
  initiallyDone?: boolean;
  initiallyTags?: AssetUsageTag[];
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export function SocialCalendarDayCard({
  asset,
  onDiscussWithAthena,
  tracking,
  initiallyDone = false,
  initiallyTags = [],
  messages,
  locale = "en-US",
}: SocialCalendarDayCardProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const copyChrome = getSocialPlannerCopyChrome(dictionary);
  const [open, setOpen] = useState<boolean>(SOCIAL_DETAIL_DEFAULT_OPEN.day);
  const panelId = useId();
  const selectedAnchors = asset.calendarAnchors.filter((anchor) =>
    Boolean(anchor.label?.trim()),
  );
  const assetCopyText = serializeSocialCalendarAsset(asset);

  return (
    <article
      id={`social-planner-day-${asset.date}`}
      className={`scroll-mt-8 min-w-0 ${SOCIAL_DETAIL_DAY_SURFACE}`}
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className={SOCIAL_DETAIL_DAY_ICON} aria-hidden="true">
          <CalendarDays className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
            {formatSocialPlannerDayHeader(asset.weekday, asset.date, locale)}
          </div>
          <h3 className="break-words text-base font-semibold leading-6 text-white sm:text-lg">
            {asset.concept}
          </h3>
          {asset.hook ? (
            <p className="line-clamp-1 text-sm leading-5 text-white/55">
              {asset.hook}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {asset.recommendedPlatforms.map((platform) => (
              <span key={platform} className={SOCIAL_DETAIL_PLATFORM_CHIP}>
                {getLocalizedSocialPlannerPlatformLabel(platform)}
              </span>
            ))}
            <span className={SOCIAL_DETAIL_META_CHIP}>
              {getLocalizedSocialPlannerAssetTypeLabel(
                dictionary,
                asset.assetType,
              )}
            </span>
            <span className={SOCIAL_DETAIL_META_CHIP}>
              {getLocalizedSocialPlannerObjectiveLabel(
                dictionary,
                asset.primaryObjective,
              )}
            </span>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center justify-end gap-2"
          data-asset-actions=""
        >
          {onDiscussWithAthena ? (
            <button
              type="button"
              onClick={() => onDiscussWithAthena({ date: asset.date })}
              className={SOCIAL_DETAIL_DAY_ACTION}
            >
              <MessageCircleQuestionMark className="size-3.5" aria-hidden="true" />
              {copy.discussWithAthena}
            </button>
          ) : null}
          <CopyButton
            text={assetCopyText}
            tracking={tracking}
            initiallyDone={initiallyDone}
            initiallyTags={initiallyTags}
            showContinue
            variant="utility"
            assetType={asset.assetType}
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
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
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
          {asset.audience ? (
            <p className="text-sm leading-6 text-white/55">
              <span className="text-white/40">{copy.whoThisIsFor}: </span>
              {asset.audience}
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
          {asset.socialCopy?.trim() ? (
            <div className={SOCIAL_DETAIL_COPY_SURFACE}>
              <div className="flex items-start gap-3">
                <span
                  className={`${SOCIAL_DETAIL_ICON_WELL} ${SOCIAL_DETAIL_ICON.cyan}`}
                  aria-hidden="true"
                >
                  <MessageSquareText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <SocialPlannerCopyableField
                    label={copy.socialCopy}
                    value={asset.socialCopy}
                    chrome={copyChrome}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {asset.cta?.trim() ? (
            <SocialPlannerCopyableField
              label={copy.cta}
              value={asset.cta}
              chrome={copyChrome}
            />
          ) : null}
          <div className={SOCIAL_DETAIL_PRODUCTION_SURFACE}>
            <div className="mb-4 flex items-center gap-3">
              <span
                className={`${SOCIAL_DETAIL_ICON_WELL} ${SOCIAL_DETAIL_ICON.amber}`}
                aria-hidden="true"
              >
                <Clapperboard className="size-5" />
              </span>
              <h4 className="text-sm font-semibold text-amber-100/85">
                {copy.productionGuidance}
              </h4>
            </div>
            <SocialCalendarProductionSpec
              spec={asset.productionSpec}
              messages={dictionary}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
