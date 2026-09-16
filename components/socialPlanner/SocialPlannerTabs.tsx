import Link from "next/link";
import { Newspaper, Share2 } from "lucide-react";
import { socialPlannerWorkspaceHref } from "@/lib/socialPlanner/socialPlannerRouting";
import {
  SOCIAL_KIND_DAILY_CARD,
  SOCIAL_KIND_DAILY_CARD_IDLE,
  SOCIAL_KIND_DAILY_ICON,
  SOCIAL_KIND_EVERGREEN_CARD,
  SOCIAL_KIND_EVERGREEN_CARD_IDLE,
  SOCIAL_KIND_EVERGREEN_ICON,
  SOCIAL_TAB_BUTTON,
  SOCIAL_TAB_LIST,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

type SocialPlannerTabsProps = {
  plannerKind: SocialCalendarImplementedPlannerKind;
  personaId?: string | null;
  messages?: TenantMessages;
};

export function SocialPlannerTabs({
  plannerKind,
  personaId = null,
  messages,
}: SocialPlannerTabsProps) {
  const copy = (messages ?? en).socialPlanner;

  return (
    <nav
      aria-label={copy.title}
      className={SOCIAL_TAB_LIST}
      role="tablist"
    >
      <Link
        href={socialPlannerWorkspaceHref({
          planner: "daily",
          personaId,
        })}
        scroll={false}
        role="tab"
        aria-selected={plannerKind === "daily_social"}
        data-planner-kind="daily_social"
        className={`${SOCIAL_TAB_BUTTON} ${
          plannerKind === "daily_social"
            ? SOCIAL_KIND_DAILY_CARD
            : SOCIAL_KIND_DAILY_CARD_IDLE
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={SOCIAL_KIND_DAILY_ICON} aria-hidden="true">
            <Share2 className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-white">
              {copy.plannerKinds.dailySocial}
            </p>
            <p className="text-xs leading-5 text-white/50">
              {copy.plannerKindDailyHelp}
            </p>
          </div>
        </div>
      </Link>
      <Link
        href={socialPlannerWorkspaceHref({
          planner: "evergreen",
          personaId,
        })}
        scroll={false}
        role="tab"
        aria-selected={plannerKind === "evergreen"}
        data-planner-kind="evergreen"
        className={`${SOCIAL_TAB_BUTTON} ${
          plannerKind === "evergreen"
            ? SOCIAL_KIND_EVERGREEN_CARD
            : SOCIAL_KIND_EVERGREEN_CARD_IDLE
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={SOCIAL_KIND_EVERGREEN_ICON} aria-hidden="true">
            <Newspaper className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-white">
              {copy.plannerKinds.evergreen}
            </p>
            <p className="text-xs leading-5 text-white/50">
              {copy.plannerKindEvergreenHelp}
            </p>
          </div>
        </div>
      </Link>
    </nav>
  );
}
