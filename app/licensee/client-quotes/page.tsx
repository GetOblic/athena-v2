export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { LicenseeClientQuoteLibrary } from "@/components/licensee/clientQuotes/LicenseeClientQuoteLibrary";
import { getLicenseeLocalization } from "@/lib/licensee/getLicenseeLocalization";
import {
  LICENSEE_DASHBOARD_CANVAS_CLASS,
  LICENSEE_DASHBOARD_SHELL_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

/**
 * Licensee Master client quotation library.
 * Master account only. Does not open a tenant workspace.
 */
export default async function LicenseeClientQuotesPage() {
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

  const { messages, locale } = getLicenseeLocalization(
    licenseeAccount.default_language,
  );

  return (
    <main className={LICENSEE_DASHBOARD_SHELL_CLASS}>
      <div className={LICENSEE_DASHBOARD_CANVAS_CLASS}>
        <AthenaBrandLink className="mb-5" />
        <Link href="/licensee" className="text-sm text-[var(--athena-orange)]">
          {messages.common.backToMasterDashboard}
        </Link>
        <div className="mt-8">
          <LicenseeClientQuoteLibrary messages={messages} locale={locale} />
        </div>
      </div>
    </main>
  );
}
