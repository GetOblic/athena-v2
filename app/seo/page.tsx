export const dynamic = "force-dynamic";

import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SeoAnalysisTypeCard } from "@/components/seo/SeoAnalysisTypeCard";
import { SeoLibraryClient } from "@/components/seo/SeoLibraryClient";
import { VisibilityPageHeader } from "@/components/seo/VisibilityPageHeader";
import { SEO_HEADER_CTA_CLASS } from "@/components/seo/seoPagePresentation";
import {
  computeContentCoverageScoreFromPackage,
  computeTechnicalCompletenessScoreFromPackage,
  contentCoverageInventoryFromPackage,
} from "@/lib/seo/seoScorePresentation";
import { deriveVisibilityTypeCardState } from "@/lib/seo/visibilityTypeCards";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { toPublicSeoReportSummary } from "@/services/seo/seoReportPublic";
import { listSeoReports } from "@/services/seo/seoReportService";
import { isSeoTechnicalPackage } from "@/services/seo/seoReportTypes";

export default async function SeoIntelligencePage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.seo;

  let reports: ReturnType<typeof toPublicSeoReportSummary>[] = [];
  let intelligenceScore: number | null = null;
  let technicalScore: number | null = null;
  let intelligenceInsight: string | null = null;
  let technicalPageCount: number | null = null;
  let loadError: string | null = null;

  try {
    // listSeoReports already returns package_json. Scores are computed from the
    // last Ready report of each type in that in-memory list — no extra query.
    const storedReports = await listSeoReports(organizationId);
    reports = storedReports.map(toPublicSeoReportSummary);

    const intelligenceReadyId = reports.find(
      (report) =>
        report.status === "Ready" && report.generationType === "intelligence",
    )?.id;
    const technicalReadyId = reports.find(
      (report) =>
        report.status === "Ready" && report.generationType === "technical",
    )?.id;

    const intelligencePackage =
      storedReports.find((report) => report.id === intelligenceReadyId)
        ?.package_json ?? null;
    const technicalPackage =
      storedReports.find((report) => report.id === technicalReadyId)
        ?.package_json ?? null;

    intelligenceScore =
      computeContentCoverageScoreFromPackage(intelligencePackage);
    technicalScore =
      computeTechnicalCompletenessScoreFromPackage(technicalPackage);

    const inventory = contentCoverageInventoryFromPackage(intelligencePackage);
    const wellCount = Array.isArray(inventory?.wellCovered)
      ? inventory.wellCovered.length
      : 0;
    const weakCount = Array.isArray(inventory?.weakCoverage)
      ? inventory.weakCoverage.length
      : 0;
    const missingCount = Array.isArray(inventory?.missingCoverage)
      ? inventory.missingCoverage.length
      : 0;
    if (wellCount + weakCount + missingCount > 0) {
      intelligenceInsight = interpolateTenantMessage(
        copy.visibility.coverageInventorySummary.includes("{well}")
          ? copy.visibility.coverageInventorySummary
          : "{well} / {weak} / {missing}",
        {
          well: wellCount,
          weak: weakCount,
          missing: missingCount,
        },
      );
    }

    if (isSeoTechnicalPackage(technicalPackage)) {
      technicalPageCount =
        technicalPackage.technicalCoverage.analyzedPageCount ??
        technicalPackage.websitePagesAnalyzed.pagesAnalyzedCount ??
        null;
    }
  } catch (error) {
    console.error("[SEO_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  const intelligenceState = deriveVisibilityTypeCardState(
    reports,
    "intelligence",
  );
  const technicalState = deriveVisibilityTypeCardState(reports, "technical");

  return (
    <TenantAppShell currentPath="/seo" messages={messages}>
      <VisibilityPageHeader
        eyebrow={copy.visibility.eyebrow}
        title={copy.visibility.title}
        subtitle={copy.visibility.subtitle}
        action={
          <Link
            href="/seo/new"
            className={`${SEO_HEADER_CTA_CLASS} bg-[var(--athena-orange)]`}
          >
            {copy.visibility.newAnalysisCta}
          </Link>
        }
      />

      {loadError ? (
        <div className="rounded-[28px] border border-rose-400/30 bg-rose-500/10 p-10 text-center">
          <h2 className="text-2xl font-semibold text-rose-100">
            {copy.unableToLoad}
          </h2>
          <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-7 text-rose-100/70">
            {loadError}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="grid gap-6 lg:grid-cols-2">
            <SeoAnalysisTypeCard
              generationType="intelligence"
              state={intelligenceState}
              score={intelligenceScore}
              insight={intelligenceInsight}
              messages={messages}
              language={language}
            />
            <SeoAnalysisTypeCard
              generationType="technical"
              state={technicalState}
              score={technicalScore}
              analyzedPageCount={technicalPageCount}
              messages={messages}
              language={language}
            />
          </div>

          {reports.length > 0 ? (
            <SeoLibraryClient
              reports={reports}
              messages={messages}
              language={language}
            />
          ) : null}
        </div>
      )}
    </TenantAppShell>
  );
}
