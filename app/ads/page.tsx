export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { AdsLibraryClient } from "@/components/ads/AdsLibraryClient";
import { toPublicAdCampaignSummary } from "@/services/ads/adCampaignPublic";
import { listAdCampaigns } from "@/services/ads/adCampaignService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function AdsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();

  let campaigns: ReturnType<typeof toPublicAdCampaignSummary>[] = [];
  let loadError: string | null = null;

  try {
    campaigns = (await listAdCampaigns(organizationId)).map(
      toPublicAdCampaignSummary,
    );
  } catch (error) {
    console.error("[ADS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error
        ? error.message
        : "Failed to load Ads campaigns for this organization.";
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Organization Advertising
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Ads</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Generate organization-level advertising campaigns from Athena&apos;s
          accumulated intelligence across Brain, Prospects, and Personas.
        </p>
      </div>

      <AdsLibraryClient campaigns={campaigns} loadError={loadError} />
    </main>
  );
}
