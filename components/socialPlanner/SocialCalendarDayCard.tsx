"use client";

import { useId, useState } from "react";
import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { CopyButton } from "@/components/deployment/CopyButton";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { SocialCalendarProductionSpec, SocialPlannerCopyableField } from "@/components/socialPlanner/SocialCalendarProductionSpec";
import { formatSocialPlannerDayHeader } from "@/components/socialPlanner/socialPlannerDates";
import { serializeSocialCalendarAsset } from "@/components/socialPlanner/socialPlannerAssetCopyText";
import {
  socialPlannerAssetTypeLabel,
  socialPlannerObjectiveLabel,
  socialPlannerPlatformLabel,
} from "@/components/socialPlanner/socialPlannerLabels";
import { previewSocialCopy } from "@/components/socialPlanner/socialPlannerClient";

type SocialCalendarDayCardProps = {
  asset: SocialCalendarAssetV1;
};

export function SocialCalendarDayCard({ asset }: SocialCalendarDayCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selectedAnchors = asset.calendarAnchors.filter((anchor) =>
    Boolean(anchor.label?.trim()),
  );
  const assetCopyText = serializeSocialCalendarAsset(asset);

  return (
    <article
      className={`min-w-0 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5 sm:p-7`}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
            {formatSocialPlannerDayHeader(asset.weekday, asset.date)}
          </div>
          <div data-asset-actions="">
            <CopyButton
              text={assetCopyText}
              tracking={null}
              showContinue
              assetType={asset.assetType}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">
            {socialPlannerAssetTypeLabel(asset.assetType)}
          </span>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">
            {socialPlannerObjectiveLabel(asset.primaryObjective)}
          </span>
        </div>
        <h3 className="text-xl font-semibold leading-8">{asset.concept}</h3>
        {asset.audience ? (
          <p className="text-sm leading-6 text-white/50">{asset.audience}</p>
        ) : null}
        {asset.hook ? (
          <p className="text-sm leading-6 text-white/70">{asset.hook}</p>
        ) : null}
        {selectedAnchors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedAnchors.map((anchor) => (
              <span
                key={`${anchor.sourceCandidateId}-${anchor.label}`}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45"
              >
                Calendar opportunity: {anchor.label}
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
          {open ? "Close Asset" : "Open Asset"}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="mt-6 space-y-6 border-t border-white/10 pt-6">
          <SocialCalendarProductionSpec spec={asset.productionSpec} />
          <SocialPlannerCopyableField label="Social Copy" value={asset.socialCopy} />
          {asset.cta?.trim() ? (
            <SocialPlannerCopyableField label="CTA" value={asset.cta} />
          ) : null}
          {asset.recommendedPlatforms.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                Recommended platforms
              </div>
              <div className="flex flex-wrap gap-2">
                {asset.recommendedPlatforms.map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75"
                  >
                    {socialPlannerPlatformLabel(platform)}
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
