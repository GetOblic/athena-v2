export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SeoReportDetailView } from "@/components/seo/SeoReportDetailView";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { toPublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import { getSeoReportById } from "@/services/seo/seoReportService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SeoReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const { organizationId } = await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const report = await getSeoReportById(id, organizationId);
  if (!report) {
    notFound();
  }

  return (
    <>
      <div className="px-10 pt-10">
        <AthenaBrandLink
          tagline={messages.chrome.tagline}
          logoutLabel={messages.chrome.logOut}
          sessionActionsLabel={messages.chrome.sessionActions}
        />
      </div>
      <SeoReportDetailView
        report={toPublicSeoReportDetail(report)}
        messages={messages}
      />
    </>
  );
}
