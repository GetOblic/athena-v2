export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { enrichProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";
import { getProspects } from "@/services/prospects/prospectService";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const prospects = await enrichProspectsForLibrary(
    await getProspects(organizationId),
    organizationId,
  );

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Prospect Intelligence
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Prospects</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Businesses and organizations Athena analyzes to produce personalized
          executive intelligence and outreach assets.
        </p>
      </div>

      <ProspectsLibraryClient prospects={prospects} />
    </main>
  );
}
