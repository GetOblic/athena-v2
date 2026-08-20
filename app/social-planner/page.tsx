export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SocialPlannerWorkspace } from "@/components/socialPlanner/SocialPlannerWorkspace";
import { SOCIAL_PLANNER_CALENDAR_ID_RE } from "@/components/socialPlanner/socialPlannerClient";
import { toSocialCalendarListItemDto } from "@/services/socialPlanner/socialCalendarDto";
import { listSocialCalendars } from "@/services/socialPlanner/socialCalendarService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function SocialPlannerPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const params = searchParams ? await searchParams : {};
  const requestedId =
    typeof params.id === "string" && SOCIAL_PLANNER_CALENDAR_ID_RE.test(params.id)
      ? params.id
      : null;

  if (requestedId) {
    redirect(`/social-planner/${requestedId}`);
  }

  let calendars: ReturnType<typeof toSocialCalendarListItemDto>[] = [];
  let loadError: string | null = null;

  try {
    calendars = (await listSocialCalendars(organizationId)).map(
      toSocialCalendarListItemDto,
    );
  } catch (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] library_load_failed", error);
    loadError = "Failed to load Social Calendars for this organization.";
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-5 py-8 text-white sm:p-10">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Social Planner
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Social Planner
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Plan your next seven social assets with one push.
        </p>
      </div>

      <SocialPlannerWorkspace
        initialCalendars={calendars}
        loadError={loadError}
      />
    </main>
  );
}
