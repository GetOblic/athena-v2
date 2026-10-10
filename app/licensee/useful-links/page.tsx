export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { GetOblicLinksCard } from "@/components/identity/GetOblicLinksCard";
import {
  LicenseeUsefulLinksPanel,
  type LicenseeUsefulLinksPanelState,
} from "@/components/licensee/LicenseeUsefulLinksPanel";
import { getLicenseeLocalization } from "@/lib/licensee/getLicenseeLocalization";
import { getTenantMessages } from "@/lib/tenantI18n/getTenantMessages";
import {
  LICENSEE_DASHBOARD_CANVAS_CLASS,
  LICENSEE_DASHBOARD_SHELL_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import { buildLicenseeUsefulLinks } from "@/lib/licensee/licenseeUsefulLinksPresentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { resolveLicenseeUsefulLinksAuthor } from "@/services/licensee/licenseeUsefulLinksAuthor";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

/**
 * Licensee Master Useful Links — Own Company claim tools, plus the existing
 * GetOblic Links card when My Company is designated.
 *
 * GetOblic Links history is browser-local, keyed by My Company organization id
 * and the authenticated Master user id. It may be cleared on Master/sub-account
 * handoff. WordPress author mapping is required only for the claim links.
 */
export default async function LicenseeUsefulLinksPage() {
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

  const { messages } = getLicenseeLocalization(licenseeAccount.default_language);
  const ownCompanyOrganizationId = licenseeAccount.own_company_organization_id;
  const resolvedOwnCompanyOrganizationId =
    typeof ownCompanyOrganizationId === "string"
      ? ownCompanyOrganizationId.trim()
      : "";
  const hasOwnCompany = resolvedOwnCompanyOrganizationId.length > 0;
  const authorId = await resolveLicenseeUsefulLinksAuthor(ownCompanyOrganizationId);
  const links = buildLicenseeUsefulLinks(
    authorId,
    licenseeAccount.default_language,
  );
  const state: LicenseeUsefulLinksPanelState = !hasOwnCompany
    ? { status: "no_own_company" }
    : links
      ? { status: "ready", links }
      : { status: "unavailable" };

  return (
    <main className={LICENSEE_DASHBOARD_SHELL_CLASS}>
      <div className={LICENSEE_DASHBOARD_CANVAS_CLASS}>
        <AthenaBrandLink className="mb-5" />

        <Link href="/licensee" className="text-sm text-[var(--athena-orange)]">
          {messages.common.backToMasterDashboard}
        </Link>

        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {messages.brand.businessLicensee}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {messages.usefulLinks.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {messages.usefulLinks.intro}
          </p>
        </div>

        <div className="mt-8">
          <LicenseeUsefulLinksPanel messages={messages} state={state} />
        </div>

        {hasOwnCompany ? (
          <div className="mt-8">
            <GetOblicLinksCard
              organizationId={resolvedOwnCompanyOrganizationId}
              userId={user.id}
              apiBase="/api/licensee/getoblic-links"
              language={licenseeAccount.default_language}
              messages={
                getTenantMessages(licenseeAccount.default_language).identity
                  .getoblic
              }
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
