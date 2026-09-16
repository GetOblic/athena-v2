export const dynamic = "force-dynamic";

import { MessagesSquare } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SocialPlannerWorkspace } from "@/components/socialPlanner/SocialPlannerWorkspace";
import { SOCIAL_PLANNER_CALENDAR_ID_RE } from "@/components/socialPlanner/socialPlannerClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import { SOCIAL_PAGE_HEADER_ICON } from "@/lib/socialPlanner/socialPlannerPagePresentation";
import { parseSocialPlannerUrlKind } from "@/lib/socialPlanner/socialPlannerRouting";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  toSocialCalendarListItemDto,
  type SocialCalendarHistoryPaginationDto,
  type SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { listSocialCalendars } from "@/services/socialPlanner/socialCalendarService";
import { resolveSocialPlannerTargetAudienceView } from "@/services/socialPlanner/socialPlannerTargetPersona";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { redirect } from "next/navigation";

export default async function SocialPlannerPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string; personaId?: string; planner?: string }>;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, locale, messages } = await getTenantLocalization();
  const copy = messages.socialPlanner;
  const params = searchParams ? await searchParams : {};
  const requestedId =
    typeof params.id === "string" && SOCIAL_PLANNER_CALENDAR_ID_RE.test(params.id)
      ? params.id
      : null;
  const plannerParse = parseSocialPlannerUrlKind(params.planner);

  if (requestedId) {
    redirect(`/social-planner/${requestedId}`);
  }

  const targetAudience = await resolveSocialPlannerTargetAudienceView(
    typeof params.personaId === "string" ? params.personaId : null,
    organizationId,
  );

  if (plannerParse.kind === "invalid") {
    return (
      <TenantAppShell currentPath="/social-planner" messages={messages}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={SOCIAL_PAGE_HEADER_ICON} aria-hidden="true">
            <MessagesSquare className="size-5" />
          </span>
        </div>
        <TractionPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
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
        <div className="mx-auto w-full max-w-4xl">
          <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-8 text-center">
            <h2 className="text-2xl font-semibold text-rose-100">
              {copy.invalidPlanner}
            </h2>
          </div>
        </div>
      </TenantAppShell>
    );
  }

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
      plannerKind: plannerParse.plannerKind,
    });
    calendars = result.calendars.map(toSocialCalendarListItemDto);
    pagination = result.pagination;
  } catch (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] library_load_failed", error);
    loadError = copy.loadFailed;
  }

  return (
    <TenantAppShell currentPath="/social-planner" messages={messages}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={SOCIAL_PAGE_HEADER_ICON} aria-hidden="true">
          <MessagesSquare className="size-5" />
        </span>
      </div>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
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

      <SocialPlannerWorkspace
        plannerKind={plannerParse.plannerKind}
        initialCalendars={calendars}
        initialPagination={pagination}
        loadError={loadError}
        targetAudience={targetAudience}
        messages={messages}
        language={language}
        locale={locale}
      />
    </TenantAppShell>
  );
}
