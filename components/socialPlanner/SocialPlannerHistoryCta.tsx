import Link from "next/link";
import { Archive, ArrowRight, History } from "lucide-react";
import {
  SOCIAL_FIELD_LABEL_CLASS,
  SOCIAL_HISTORY_CTA_ACTION_DAILY,
  SOCIAL_HISTORY_CTA_ACTION_EVERGREEN,
  SOCIAL_HISTORY_CTA_DAILY,
  SOCIAL_HISTORY_CTA_EVERGREEN,
  SOCIAL_HISTORY_CTA_ICON_DAILY,
  SOCIAL_HISTORY_CTA_ICON_EVERGREEN,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import { socialPlannerHistoryHref } from "@/lib/socialPlanner/socialPlannerRouting";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

type SocialPlannerHistoryCtaProps = {
  plannerKind: SocialCalendarImplementedPlannerKind;
  messages?: TenantMessages;
};

export function SocialPlannerHistoryCta({
  plannerKind,
  messages,
}: SocialPlannerHistoryCtaProps) {
  const copy = (messages ?? en).socialPlanner;
  const isEvergreen = plannerKind === "evergreen";

  return (
    <Link
      href={socialPlannerHistoryHref(plannerKind)}
      data-social-planner-history-cta={plannerKind}
      className={
        isEvergreen ? SOCIAL_HISTORY_CTA_EVERGREEN : SOCIAL_HISTORY_CTA_DAILY
      }
    >
      <span
        className={
          isEvergreen
            ? SOCIAL_HISTORY_CTA_ICON_EVERGREEN
            : SOCIAL_HISTORY_CTA_ICON_DAILY
        }
        aria-hidden="true"
      >
        {isEvergreen ? (
          <Archive className="size-5" />
        ) : (
          <History className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className={SOCIAL_FIELD_LABEL_CLASS}>
          {isEvergreen
            ? copy.historyCtaEyebrowEvergreen
            : copy.historyCtaEyebrowDaily}
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-white">
          {isEvergreen
            ? copy.historyCtaTitleEvergreen
            : copy.historyCtaTitleDaily}
        </h2>
        <p className="text-sm leading-6 text-white/50">
          {isEvergreen
            ? copy.historyCtaBodyEvergreen
            : copy.historyCtaBodyDaily}
        </p>
      </div>
      <span
        className={
          isEvergreen
            ? SOCIAL_HISTORY_CTA_ACTION_EVERGREEN
            : SOCIAL_HISTORY_CTA_ACTION_DAILY
        }
      >
        {isEvergreen
          ? copy.historyCtaActionEvergreen
          : copy.historyCtaActionDaily}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
