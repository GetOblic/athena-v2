export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { LicenseeEstimateClient } from "@/components/licensee/estimate/LicenseeEstimateClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { listLicenseeSubAccountsForMaster } from "@/services/licensee/licenseeSubAccounts";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

/**
 * Athena Estimate — Business Licensee Master commercial pricing intelligence.
 */
export default async function LicenseeAthenaEstimatePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/licensee/login");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(user.id);
  if (!licenseeAccount) {
    redirect("/api/licensee/master-marker?action=clear");
  }

  if (!(await isAccountAccessActive(user.id))) {
    redirect(
      `/licensee/login?message=${encodeURIComponent(
        "This Master account has been deactivated.",
      )}`,
    );
  }

  const cookieStore = await cookies();
  if (!cookieStore.get(LICENSEE_MASTER_MARKER_COOKIE)?.value) {
    redirect("/api/licensee/master-marker?action=refresh");
  }

  const subAccounts = await listLicenseeSubAccountsForMaster(user.id);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <AthenaBrandLink className="mb-8" />

        <Link href="/licensee" className="text-sm text-[var(--athena-orange)]">
          ← Back to Master dashboard
        </Link>

        <div className="mt-10">
          <LicenseeEstimateClient subAccounts={subAccounts} />
        </div>
      </div>
    </main>
  );
}
