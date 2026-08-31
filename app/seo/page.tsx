export const dynamic = "force-dynamic";

import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { SeoLibraryClient } from "@/components/seo/SeoLibraryClient";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { toPublicSeoReportSummary } from "@/services/seo/seoReportPublic";
import { listSeoReports } from "@/services/seo/seoReportService";

export default async function SeoIntelligencePage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.seo;

  let reports: ReturnType<typeof toPublicSeoReportSummary>[] = [];
  let loadError: string | null = null;

  try {
    reports = (await listSeoReports(organizationId)).map(
      toPublicSeoReportSummary,
    );
  } catch (error) {
    console.error("[SEO_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/" label={copy.backToDashboard} />

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.subtitle}
        </p>
      </div>

      <SeoLibraryClient
        reports={reports}
        loadError={loadError}
        messages={messages}
        language={language}
      />
    </main>
  );
}
