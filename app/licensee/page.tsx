export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { LicenseeDashboardClient } from "@/components/licensee/LicenseeDashboardClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { listLicenseeSubAccountsForMaster } from "@/services/licensee/licenseeSubAccounts";

/**
 * Business Licensee Master dashboard — relationships only.
 */
export default async function LicenseeMasterPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; linked?: string; message?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/licensee/login");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(user.id);
  if (!licenseeAccount) {
    // Ordinary Athena users: clear forged/stale Master marker via Route Handler
    // (Server Components cannot call cookies().set()).
    redirect("/api/licensee/master-marker?action=clear");
  }

  // Refresh UX marker TTL via Route Handler when missing/stale write is needed.
  // Login / handoff already set the marker; only refresh when absent.
  const cookieStore = await cookies();
  if (!cookieStore.get(LICENSEE_MASTER_MARKER_COOKIE)?.value) {
    redirect("/api/licensee/master-marker?action=refresh");
  }

  const items = await listLicenseeSubAccountsForMaster(user.id);
  const params = searchParams ? await searchParams : {};
  const notice =
    params.message ||
    (params.created === "1"
      ? "Sub-account created and linked to your Master dashboard."
      : params.linked === "1"
        ? "Existing Athena account linked to your Master dashboard."
        : null);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AthenaBrandLink className="mb-8" />
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Athena Business Licensee
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Master dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
              Client operations console for linked Athena sub-accounts.
              Intelligence always stays inside each individual account.
            </p>
          </div>

          <form action="/api/licensee/logout" method="post">
            <button
              type="submit"
              className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>

        <LicenseeDashboardClient initialItems={items} notice={notice} />
      </div>
    </main>
  );
}
