"use client";

import { useId, useState } from "react";
import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  CopyButton,
  type AssetCopyTrackingContext,
} from "@/components/deployment/CopyButton";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { SocialCalendarProductionSpec, SocialPlannerCopyableField } from "@/components/socialPlanner/SocialCalendarProductionSpec";
import { formatSocialPlannerDayHeader } from "@/components/socialPlanner/socialPlannerDates";
import { serializeSocialCalendarAsset } from "@/components/socialPlanner/socialPlannerAssetCopyText";
import { previewSocialCopy } from "@/components/socialPlanner/socialPlannerClient";
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selectedAnchors = asset.calendarAnchors.filter((anchor) =>
    Boolean(anchor.label?.trim()),
  );
  const assetCopyText = serializeSocialCalendarAsset(asset);

  return (
    <article
      id={`social-planner-day-${asset.date}`}
      className={`scroll-mt-8 min-w-0 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5 sm:p-7`}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
            {formatSocialPlannerDayHeader(asset.weekday, asset.date, locale)}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-asset-actions="">
            {onDiscussWithAthena ? (
              <button
                type="button"
                onClick={() => onDiscussWithAthena({ date: asset.date })}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
              >
                {copy.discussWithAthena}
              </button>
            ) : null}
            <CopyButton
              text={assetCopyText}
              tracking={tracking}
              initiallyDone={initiallyDone}
              initiallyTags={initiallyTags}
              showContinue
              assetType={asset.assetType}
              chrome={copyChrome}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">
            {getLocalizedSocialPlannerAssetTypeLabel(dictionary, asset.assetType)}
          </span>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">
            {getLocalizedSocialPlannerObjectiveLabel(
              dictionary,
              asset.primaryObjective,
            )}
          </span>
        </div>
        <h3 className="text-xl font-semibold leading-8">{asset.concept}</h3>
        {asset.hook ? (
          <p className="text-sm leading-6 text-white/70">{asset.hook}</p>
        ) : null}
        {asset.audience ? (
          <p className="text-sm leading-6 text-white/50">
            <span className="text-white/35">{copy.whoThisIsFor}: </span>
            {asset.audience}
          </p>
        ) : null}
        {selectedAnchors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedAnchors.map((anchor) => (
              <span
                key={`${anchor.sourceCandidateId}-${anchor.label}`}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45"
              >
                {formatSocialPlannerCalendarOpportunity(dictionary, anchor.label)}
              </span>
            ))}
          </div>
        ) : null}
        {asset.socialCopy ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/55">
            {previewSocialCopy(asset.socialCopy)}
          </p>
        ) : null}
      </header>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
        >
          {open ? copy.closeAsset : copy.openAsset}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="mt-6 space-y-6 border-t border-white/10 pt-6">
          <SocialCalendarProductionSpec
            spec={asset.productionSpec}
            messages={dictionary}
          />
          <SocialPlannerCopyableField
            label={copy.socialCopy}
            value={asset.socialCopy}
            chrome={copyChrome}
          />
          {asset.cta?.trim() ? (
            <SocialPlannerCopyableField
              label={copy.cta}
              value={asset.cta}
              chrome={copyChrome}
            />
          ) : null}
          {asset.recommendedPlatforms.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                {copy.recommendedPlatforms}
              </div>
              <div className="flex flex-wrap gap-2">
                {asset.recommendedPlatforms.map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75"
                  >
                    {getLocalizedSocialPlannerPlatformLabel(platform)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
