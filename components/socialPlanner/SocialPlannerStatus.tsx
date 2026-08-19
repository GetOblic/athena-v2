"use client";

import { socialPlannerStageLabel } from "@/components/socialPlanner/socialPlannerLabels";

type SocialPlannerStatusProps = {
  status: string;
  generationStage: string | null;
  pollNotice?: string | null;
};

export function SocialPlannerStatus({
  status,
  generationStage,
  pollNotice = null,
}: SocialPlannerStatusProps) {
  const stageLabel = socialPlannerStageLabel(generationStage);
  const inFlight = status === "Queued" || status === "Processing";

  return (
    <div
      className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8"
      role="status"
      aria-live="polite"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
        {inFlight ? "Generating" : status === "Processing Failed" ? "Failed" : status}
      </div>
      <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
        Athena is planning your week…
      </h2>
      {stageLabel ? (
        <p className="mt-3 text-sm leading-7 text-white/60">{stageLabel}</p>
      ) : (
        <p className="mt-3 text-sm leading-7 text-white/60">
          You can leave this page and return later.
        </p>
      )}
      {pollNotice ? (
        <p className="mt-3 text-sm leading-7 text-white/45">{pollNotice}</p>
      ) : null}
    </div>
  );
}
