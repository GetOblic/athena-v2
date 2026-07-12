import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { ProspectImportForms } from "@/components/prospects/ProspectImportForms";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function ProspectImportPage() {
  await requireCurrentOrganizationContext();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/prospects" className="text-sm text-[var(--athena-orange)]">
        ← Prospects
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Prospect Intelligence
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Import Prospects
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Manual and CSV imports create Prospect records immediately and queue
          asynchronous generation. Incomplete records remain analyzable.
        </p>
      </div>

      <ProspectImportForms />
    </main>
  );
}
