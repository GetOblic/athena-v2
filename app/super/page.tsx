export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SuperAdminDashboardClient } from "@/components/superAdmin/SuperAdminDashboardClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_MARKER_COOKIE } from "@/services/superAdmin/superAdminCookieNames";
import { listManageableAccountsForSuperAdmin } from "@/services/superAdmin/superAdminAccounts";
import { listGetOblicDirectoryAllocationsForSuperAdmin } from "@/services/superAdmin/superAdminGetOblicDirectory";
import { listLicenseeCommercialFeesForSuperAdmin } from "@/services/superAdmin/superAdminLicenseeCommercialFees";
import { listLicenseeDefaultLanguagesForSuperAdmin } from "@/services/superAdmin/superAdminLicenseeDefaultLanguage";
import { getActiveEstimatePricingMethodologyInstruction } from "@/services/estimate/estimatePricingMethodologyInstruction";
import { getActiveTrendSocialPromptInstruction } from "@/services/superAdmin/strategicBlueprintInstructions";
import {
  SuperAdminAuthorityLookupError,
  getSuperAdminByUserId,
} from "@/services/superAdmin/superAdminIdentity";

/**
 * GetOblic Super Admin operational dashboard.
 * Isolated control plane — not linked from Athena or Licensee product UI.
 */
export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/super/login");
  }

  let superAdmin = null;
  try {
    superAdmin = await getSuperAdminByUserId(user.id);
  } catch (error) {
    if (error instanceof SuperAdminAuthorityLookupError) {
      redirect("/api/super/marker?action=clear");
    }
    throw error;
  }
  if (!superAdmin) {
    redirect("/api/super/marker?action=clear");
  }

  const cookieStore = await cookies();
  if (!cookieStore.get(SUPER_ADMIN_MARKER_COOKIE)?.value) {
    redirect("/api/super/marker?action=refresh");
  }

  const accounts = await listManageableAccountsForSuperAdmin(user.id);
  const directoryAllocations =
    await listGetOblicDirectoryAllocationsForSuperAdmin(user.id);
  const licenseeCommercialFees =
    await listLicenseeCommercialFeesForSuperAdmin(user.id);
  const licenseeDefaultLanguages =
    await listLicenseeDefaultLanguagesForSuperAdmin(user.id);
  const trendSocialPromptInstruction =
    await getActiveTrendSocialPromptInstruction();
  const estimatePricingMethodologyInstruction =
    await getActiveEstimatePricingMethodologyInstruction();
  const params = searchParams ? await searchParams : {};

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-5 py-8 text-white sm:px-6 sm:py-10 lg:px-8 xl:px-10">
      <div className="mx-auto max-w-[88rem]">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AthenaBrandLink className="mb-8" />
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              GetOblic Super Admin
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Control plane
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50">
              Isolated Super Admin workspace for Licensee Masters, ordinary
              Athena accounts, and system configuration. Tenant intelligence
              stays isolated inside each account.
            </p>
          </div>

          <form action="/api/super/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>

        <SuperAdminDashboardClient
          initialAccounts={accounts}
          initialDirectoryAllocations={directoryAllocations}
          initialLicenseeCommercialFees={licenseeCommercialFees}
          initialLicenseeDefaultLanguages={licenseeDefaultLanguages}
          initialTrendSocialPromptInstruction={{
            instructionText: trendSocialPromptInstruction.instructionText,
            revisionId: trendSocialPromptInstruction.revisionId,
            updatedAt: trendSocialPromptInstruction.updatedAt,
            configured: trendSocialPromptInstruction.configured,
          }}
          initialEstimatePricingMethodologyInstruction={{
            instructionText:
              estimatePricingMethodologyInstruction.instructionText,
            revisionId: estimatePricingMethodologyInstruction.revisionId,
            updatedAt: estimatePricingMethodologyInstruction.updatedAt,
            configured: estimatePricingMethodologyInstruction.configured,
          }}
          notice={params.message || null}
        />
      </div>
    </main>
  );
}
