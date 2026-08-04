export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SeoReportDetailView } from "@/components/seo/SeoReportDetailView";
import { toPublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import { getSeoReportById } from "@/services/seo/seoReportService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

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
  const report = await getSeoReportById(id, organizationId);
  if (!report) {
    notFound();
  }

  return (
    <>
      <div className="px-10 pt-10">
        <AthenaBrandLink />
      </div>
      <SeoReportDetailView report={toPublicSeoReportDetail(report)} />
    </>
  );
}
