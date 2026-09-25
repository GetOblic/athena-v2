export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { LicenseeDashboardClient } from "@/components/licensee/LicenseeDashboardClient";
import { LicenseePlanSection } from "@/components/licensee/LicenseePlanSection";
import { LicenseeUsefulLinksCard } from "@/components/licensee/LicenseeUsefulLinksCard";
import { getLicenseeLocalization } from "@/lib/licensee/getLicenseeLocalization";
import {
  buildLicenseePlanView,
  LICENSEE_DASHBOARD_CANVAS_CLASS,
  LICENSEE_DASHBOARD_SHELL_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { listActiveConvertedClientOrganizationIds } from "@/services/licensee/licenseeProspectClientConversionReads";
import { listLicenseeSubAccountsForMaster } from "@/services/licensee/licenseeSubAccounts";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

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

  if (!(await isAccountAccessActive(user.id))) {
    redirect(
      `/licensee/login?message=${encodeURIComponent(
        "This Master account has been deactivated.",
      )}`,
    );
  }

  // Refresh UX marker TTL via Route Handler when missing/stale write is needed.
  // Login / handoff already set the marker; only refresh when absent.
  const cookieStore = await cookies();
  if (!cookieStore.get(LICENSEE_MASTER_MARKER_COOKIE)?.value) {
    redirect("/api/licensee/master-marker?action=refresh");
  }

  const items = await listLicenseeSubAccountsForMaster(user.id);
  const convertedClientOrganizationIds =
    await listActiveConvertedClientOrganizationIds(
      items
        .filter((item) => !item.isOwnCompany)
        .map((item) => item.organizationId),
    );
  const dashboardItems = items.map((item) => ({
    ...item,
    conversionManaged:
      !item.isOwnCompany &&
      convertedClientOrganizationIds.has(item.organizationId),
  }));
  const params = searchParams ? await searchParams : {};
  const { locale, messages } = getLicenseeLocalization(
    licenseeAccount.default_language,
  );
  const notice =
    params.message ||
    (params.created === "1"
      ? messages.notices.subAccountCreated
      : params.linked === "1"
        ? messages.notices.existingLinked
        : null);
  const plan = buildLicenseePlanView(
    {
      defaultLanguage: licenseeAccount.default_language,
      licenseeMonthlyFeeUsd: licenseeAccount.licenseeMonthlyFeeUsd,
      subAccountMonthlyFeeUsd: licenseeAccount.subAccountMonthlyFeeUsd,
    },
    {
      languageSupport: messages.plan.languageSupport,
      perMonth: messages.plan.perMonth,
      perMonthPerActiveSubAccount: messages.plan.perMonthPerActiveSubAccount,
    },
  );

  return (
    <main className={LICENSEE_DASHBOARD_SHELL_CLASS}>
      <div className={LICENSEE_DASHBOARD_CANVAS_CLASS}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AthenaBrandLink className="mb-5" />
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {messages.brand.athenaBusinessLicensee}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {messages.brand.masterDashboard}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              {messages.brand.intro}
            </p>
          </div>

          <form action="/api/licensee/logout" method="post">
            <button
              type="submit"
              className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              {messages.common.logout}
            </button>
          </form>
        </div>

        <LicenseePlanSection
          plan={plan}
          labels={{
            title: messages.plan.title,
            languageLabel: messages.plan.defaultLanguage,
            licenseeFeeLabel: messages.plan.licenseeFee,
            subAccountFeeLabel: messages.plan.subAccountFee,
          }}
        />

        <LicenseeUsefulLinksCard messages={messages} />

        <LicenseeDashboardClient
          initialItems={dashboardItems}
          notice={notice}
          messages={messages}
          locale={locale}
        />
      </div>
    </main>
  );
}
