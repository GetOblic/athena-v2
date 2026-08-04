export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SeoLibraryClient } from "@/components/seo/SeoLibraryClient";
import { toPublicSeoReportSummary } from "@/services/seo/seoReportPublic";
import { listSeoReports } from "@/services/seo/seoReportService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function SeoIntelligencePage() {
  const { organizationId } = await requireCurrentOrganizationContext();

  let reports: ReturnType<typeof toPublicSeoReportSummary>[] = [];
  let loadError: string | null = null;

  try {
    reports = (await listSeoReports(organizationId)).map(
      toPublicSeoReportSummary,
    );
  } catch (error) {
    console.error("[SEO_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error
        ? error.message
        : "Failed to load SEO Intelligence reports for this organization.";
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Organization SEO Intelligence
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          SEO Intelligence
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Generate strategic, content-focused SEO guidance from Athena&apos;s
          Website Deep Scrape intelligence, Brain, Personas, Communities, and
          Discussions — not a traditional crawler audit.
        </p>
      </div>

      <SeoLibraryClient reports={reports} loadError={loadError} />
    </main>
  );
}
