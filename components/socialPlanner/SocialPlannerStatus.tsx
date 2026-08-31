"use client";

import { en } from "@/lib/tenantI18n/messages/en";
import { getLocalizedSocialPlannerStageLabel } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type SocialPlannerStatusProps = {
  status: string;
  generationStage: string | null;
  pollNotice?: string | null;
  messages?: TenantMessages;
};

export function SocialPlannerStatus({
  status,
  generationStage,
  pollNotice = null,
  messages,
}: SocialPlannerStatusProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const stageLabel = getLocalizedSocialPlannerStageLabel(
    dictionary,
    generationStage,
  );
  const inFlight = status === "Queued" || status === "Processing";

  return (
    <div
      className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8"
      role="status"
      aria-live="polite"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
        {inFlight
          ? copy.status.generating
          : status === "Processing Failed"
            ? copy.status.failed
            : status}
      </div>
      <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
        {copy.planningWeek}
      </h2>
      {stageLabel ? (
        <p className="mt-3 text-sm leading-7 text-white/60">{stageLabel}</p>
      ) : (
        <p className="mt-3 text-sm leading-7 text-white/60">
          {copy.leaveAndReturn}
        </p>
      )}
      {pollNotice ? (
        <p className="mt-3 text-sm leading-7 text-white/45">{pollNotice}</p>
      ) : null}
    </div>
  );
}
