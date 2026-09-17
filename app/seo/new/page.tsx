export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SeoReportGenerateForm } from "@/components/seo/SeoReportGenerateForm";
import { VisibilityPageHeader } from "@/components/seo/VisibilityPageHeader";
import {
  shouldShowSeoNewAnalysis,
  shouldShowSeoTechnicalOption,
} from "@/lib/seo/freeVisibilityPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadOrganizationDeepWebsiteIntelligence } from "@/services/seo/seoContextComposer";
import { loadFreeVisibilityPageState } from "@/services/seo/freeVisibilityPageState";
import { assessTechnicalSeoEvidenceSufficiency } from "@/services/seo/seoTechnicalEvidence";

export default async function NewSeoReportPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ messages }, freeVisibility] = await Promise.all([
    getTenantLocalization(),
    loadFreeVisibilityPageState(),
  ]);
  const copy = messages.seo;
  const { presentation, visibility, boundReportStatus: _boundReportStatus, ...freeProgression } =
    freeVisibility;

  if (!shouldShowSeoNewAnalysis(presentation)) {
    redirect(
      visibility.reportId ? `/seo/${visibility.reportId}` : "/seo",
    );
  }

  let technicalSelectable = shouldShowSeoTechnicalOption(presentation);
  if (technicalSelectable) {
    try {
      const intelligence =
        await loadOrganizationDeepWebsiteIntelligence(organizationId);
      const sufficiency = assessTechnicalSeoEvidenceSufficiency(intelligence);
      technicalSelectable = sufficiency.sufficient;
    } catch {
      technicalSelectable = true;
    }
  }

  return (
    <TenantAppShell
      currentPath="/seo/new"
      messages={messages}
      {...freeProgression}
    >
      <Link
        href="/seo"
        className="text-sm text-[var(--athena-orange)] underline-offset-2 hover:underline"
      >
        {copy.visibility.backToLanding}
      </Link>

      <div className="mt-8 max-w-3xl">
        <VisibilityPageHeader
          eyebrow={copy.visibility.eyebrow}
          title={copy.new.visibilityTitle}
          subtitle={copy.new.visibilitySubtitle}
        />
      </div>

      <div className="max-w-3xl">
        <SeoReportGenerateForm
          messages={messages}
          technicalSelectable={technicalSelectable}
          allowTechnical={shouldShowSeoTechnicalOption(presentation)}
          starterContext={
            presentation === "available" ? copy.free.newContext : null
          }
        />
      </div>
    </TenantAppShell>
  );
}
