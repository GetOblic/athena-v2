"use client";

import { MessagesSquare, Sparkles } from "lucide-react";
import {
  SOCIAL_DETAIL_HEADER_WELL,
  SOCIAL_DETAIL_STATUS_SURFACE,
  socialPlannerDetailPlannerKindChipClass,
  socialPlannerDetailStatusChipClass,
} from "@/lib/socialPlanner/socialPlannerDetailPresentation";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  getLocalizedSocialPlannerGeneratingHeadline,
  getLocalizedSocialPlannerPlannerKindLabel,
  getLocalizedSocialPlannerStageLabel,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type SocialPlannerStatusProps = {
  status: string;
  generationStage: string | null;
  plannerKind?: string | null;
  pollNotice?: string | null;
  messages?: TenantMessages;
};

export function SocialPlannerStatus({
  status,
  generationStage,
  plannerKind = null,
  pollNotice = null,
  messages,
}: SocialPlannerStatusProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const stageLabel = getLocalizedSocialPlannerStageLabel(
    dictionary,
    generationStage,
    plannerKind,
  );
  const inFlight = status === "Queued" || status === "Processing";
  const plannerKindLabel = plannerKind
    ? getLocalizedSocialPlannerPlannerKindLabel(dictionary, plannerKind)
    : null;

  return (
    <div
      className={SOCIAL_DETAIL_STATUS_SURFACE}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className={SOCIAL_DETAIL_HEADER_WELL} aria-hidden="true">
          {inFlight ? (
            <Sparkles className="size-5" />
          ) : (
            <MessagesSquare className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={socialPlannerDetailStatusChipClass(status)}>
              {inFlight
                ? copy.status.generating
                : status === "Processing Failed"
                  ? copy.status.failed
                  : status}
            </span>
            {plannerKindLabel ? (
              <span className={socialPlannerDetailPlannerKindChipClass(plannerKind)}>
                {plannerKindLabel}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {getLocalizedSocialPlannerGeneratingHeadline(dictionary, plannerKind)}
          </h2>
        </div>
      </div>
      {stageLabel ? (
        <p className="mt-4 text-sm leading-7 text-white/60">{stageLabel}</p>
      ) : (
        <p className="mt-4 text-sm leading-7 text-white/60">
          {copy.leaveAndReturn}
        </p>
      )}
      {pollNotice ? (
        <p className="mt-3 text-sm leading-7 text-white/45">{pollNotice}</p>
      ) : null}
    </div>
  );
}
