export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SocialPlannerDetailWorkspace } from "@/components/socialPlanner/SocialPlannerDetailWorkspace";
import { SOCIAL_PLANNER_CALENDAR_ID_RE } from "@/components/socialPlanner/socialPlannerClient";
import { toSocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function SocialPlannerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { id } = await params;

  let initialDetail: ReturnType<typeof toSocialCalendarDetailDto> | null = null;
  let initialDetailError: "not_found" | "load_failed" | null = null;

  if (!SOCIAL_PLANNER_CALENDAR_ID_RE.test(id)) {
    initialDetailError = "not_found";
  } else {
    try {
      const calendar = await getSocialCalendarById(id, organizationId);
      if (!calendar) {
        initialDetailError = "not_found";
      } else {
        initialDetail = toSocialCalendarDetailDto(calendar);
      }
    } catch (error) {
      console.error("[ATHENA_SOCIAL_PLANNER] detail_load_failed", error);
      initialDetailError = "load_failed";
    }
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-5 py-8 text-white sm:p-10">
      <AthenaBrandLink className="mb-8" />

      <Link href="/social-planner" className="text-sm text-[var(--athena-orange)]">
        ← Back to Social Planner
      </Link>

      <div className="mt-10">
        <SocialPlannerDetailWorkspace
          initialDetail={initialDetail}
          initialDetailError={initialDetailError}
        />
      </div>
    </main>
  );
}
