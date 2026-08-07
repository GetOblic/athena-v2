export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { SeoReportGenerateForm } from "@/components/seo/SeoReportGenerateForm";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewSeoReportPage() {
  await requireCurrentOrganizationContext();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/seo" className="text-sm text-[var(--athena-orange)]">
        ← SEO Intelligence
      </Link>

      <div className="mb-10 mt-10 max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          SEO Workspace
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          New report
        </h1>
        <p className="mt-4 text-base leading-7 text-white/50">
          Provide optional guidance, then choose Generate SEO Intelligence for
          strategic opportunities, or Generate Technical SEO for an
          evidence-backed technical package from Website Intelligence.
        </p>
      </div>

      <div className="max-w-3xl">
        <SeoReportGenerateForm />
      </div>
    </main>
  );
}
