export const dynamic = "force-dynamic";

import { AdsLibraryClient } from "@/components/ads/AdsLibraryClient";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { toPublicAdCampaignSummary } from "@/services/ads/adCampaignPublic";
import { listAdCampaigns } from "@/services/ads/adCampaignService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function AdsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.ads;

  let campaigns: ReturnType<typeof toPublicAdCampaignSummary>[] = [];
  let loadError: string | null = null;

  try {
    campaigns = (await listAdCampaigns(organizationId)).map(
      toPublicAdCampaignSummary,
    );
  } catch (error) {
    console.error("[ADS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/" label={copy.backToDashboard} />

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.subtitle}
        </p>
      </div>

      <AdsLibraryClient
        campaigns={campaigns}
        loadError={loadError}
        messages={messages}
        language={language}
      />
    </main>
  );
}
