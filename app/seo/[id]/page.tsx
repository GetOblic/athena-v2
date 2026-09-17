export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SeoReportDetailView } from "@/components/seo/SeoReportDetailView";
import {
  shouldShowFreeVisibilityContinuation,
  shouldShowSeoRegenerate,
  shouldShowSeoRetrySameReport,
} from "@/lib/seo/freeVisibilityPresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { visibilityUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadFreeVisibilityPageState } from "@/services/seo/freeVisibilityPageState";
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
  const [{ language, messages }, freeVisibility] = await Promise.all([
    getTenantLocalization(),
    loadFreeVisibilityPageState(),
  ]);
  const report = await getSeoReportById(id, organizationId);
  if (!report) {
    notFound();
  }

  const { presentation, visibility, boundReportStatus: _boundReportStatus, ...freeProgression } =
    freeVisibility;
  const allowRegenerate = shouldShowSeoRegenerate(presentation);
  const allowRetrySame = shouldShowSeoRetrySameReport(presentation, {
    currentReportId: report.id,
    boundReportId: visibility.reportId,
  });
  const boundaryNote =
    presentation === "consumed"
      ? messages.seo.free.completedNote
      : presentation === "failed" && allowRetrySame
        ? messages.seo.free.failedNote
        : presentation === "processing"
          ? messages.seo.free.processingNote
          : null;

  return (
    <TenantAppShell
      currentPath={`/seo/${id}`}
      messages={messages}
      {...freeProgression}
    >
      <SeoReportDetailView
        report={toPublicSeoReportDetail(report)}
        messages={messages}
        language={language}
        allowRegenerate={allowRegenerate}
        allowRetrySame={allowRetrySame}
        boundaryNote={boundaryNote}
      />
      {shouldShowFreeVisibilityContinuation(presentation) ? (
        <div className="mt-10">
          <UpgradeCompletionCard
            {...visibilityUpgradeContent({
              continuation: messages.seo.free.continuation,
              upgrade: messages.upgrade,
            })}
          />
        </div>
      ) : null}
    </TenantAppShell>
  );
}
