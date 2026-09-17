import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SocialPlannerHistoryPageWorkspace } from "@/components/socialPlanner/SocialPlannerHistoryPageWorkspace";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import {
  SOCIAL_HISTORY_BACK_LINK,
  SOCIAL_HISTORY_PAGE_ICON_DAILY,
  SOCIAL_HISTORY_PAGE_ICON_EVERGREEN,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import { socialPlannerWorkspaceHref } from "@/lib/socialPlanner/socialPlannerRouting";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  toSocialCalendarListItemDto,
  type SocialCalendarHistoryPaginationDto,
  type SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { listSocialCalendars } from "@/services/socialPlanner/socialCalendarService";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export async function SocialPlannerHistoryRoutePage({
  plannerKind,
}: {
  plannerKind: SocialCalendarImplementedPlannerKind;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ locale, messages }, freeProgression] = await Promise.all([
    getTenantLocalization(),
    loadFreeProgressionState(),
  ]);
  const copy = messages.socialPlanner;
  const isEvergreen = plannerKind === "evergreen";

  let calendars: SocialCalendarListItemDto[] = [];
  let pagination: SocialCalendarHistoryPaginationDto = {
    page: 1,
    limit: SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
  };
  let loadError: string | null = null;

  try {
    const result = await listSocialCalendars(organizationId, {
      search: "",
      page: 1,
      limit: SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
      plannerKind,
    });
    calendars = result.calendars.map(toSocialCalendarListItemDto);
    pagination = result.pagination;
  } catch (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] history_page_load_failed", error);
    loadError = copy.loadFailed;
  }

  return (
    <TenantAppShell
      currentPath="/social-planner"
      messages={messages}
      {...freeProgression}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={
            isEvergreen
              ? SOCIAL_HISTORY_PAGE_ICON_EVERGREEN
              : SOCIAL_HISTORY_PAGE_ICON_DAILY
          }
          aria-hidden="true"
        >
          <History className="size-5" />
        </span>
      </div>
      <TractionPageHeader
        eyebrow={copy.title}
        title={
          isEvergreen
            ? copy.historyPageTitleEvergreen
            : copy.historyPageTitleDaily
        }
        subtitle={
          isEvergreen
            ? copy.historyPageSubtitleEvergreen
            : copy.historyPageSubtitleDaily
        }
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: copy.traction.audiences,
            },
            {
              href: "/ads",
              label: copy.traction.advertising,
            },
            {
              href: "/social-planner",
              label: copy.title,
              current: true,
            },
          ]}
        />
      </TractionPageHeader>

      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Link
          href={socialPlannerWorkspaceHref({ planner: plannerKind })}
          className={SOCIAL_HISTORY_BACK_LINK}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {isEvergreen
            ? copy.backToEvergreenPlanner
            : copy.backToDailyPlanner}
        </Link>

        <SocialPlannerHistoryPageWorkspace
          plannerKind={plannerKind}
          initialCalendars={calendars}
          initialPagination={pagination}
          loadError={loadError}
          messages={messages}
          locale={locale}
        />
      </div>
    </TenantAppShell>
  );
}
