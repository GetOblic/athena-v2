export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SocialPlannerDetailWorkspace } from "@/components/socialPlanner/SocialPlannerDetailWorkspace";
import { SOCIAL_PLANNER_CALENDAR_ID_RE } from "@/components/socialPlanner/socialPlannerClient";
import { SOCIAL_DETAIL_BACK_LINK } from "@/lib/socialPlanner/socialPlannerDetailPresentation";
import { socialPlannerWorkspaceHref } from "@/lib/socialPlanner/socialPlannerRouting";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import { toBlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import { getOrganizationBrandIdentity } from "@/services/identity/brandIdentityService";
import { toSocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function SocialPlannerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, locale, messages }, continuationPreferences, organizationBrand] =
    await Promise.all([
      getTenantLocalization(),
      getOrganizationAiWorkspacePreferences(organizationId),
      getOrganizationBrandIdentity(organizationId).catch((error) => {
        console.error("[BRAND_DIRECTION] social_planner_load_failed", error);
        return null;
      }),
    ]);
  const brandDirection = toBlueprintBrandDirectionInput(organizationBrand);
  const copy = messages.socialPlanner;
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
    <TenantAppShell currentPath={`/social-planner/${id}`} messages={messages}>
      <Link
        href={socialPlannerWorkspaceHref({
          planner: initialDetail?.plannerKind,
        })}
        className={`mb-6 ${SOCIAL_DETAIL_BACK_LINK}`}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {copy.backToSocialPlanner}
      </Link>
      <SocialPlannerDetailWorkspace
        initialDetail={initialDetail}
        initialDetailError={initialDetailError}
        continuationPreferences={continuationPreferences}
        brandDirection={brandDirection}
        messages={messages}
        language={language}
        locale={locale}
      />
    </TenantAppShell>
  );
}
