export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { AdCampaignGenerateForm } from "@/components/ads/AdCampaignGenerateForm";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewAdCampaignPage() {
  await requireCurrentOrganizationContext();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/ads" className="text-sm text-[var(--athena-orange)]">
        ← Ads
      </Link>

      <div className="mb-10 mt-10 max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Generate Ads
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          New campaign
        </h1>
        <p className="mt-4 text-base leading-7 text-white/50">
          Provide optional guidance, or leave everything blank and let Athena
          infer the strongest campaign opportunity.
        </p>
      </div>

      <div className="max-w-3xl">
        <AdCampaignGenerateForm />
      </div>
    </main>
  );
}
