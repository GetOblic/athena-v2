export const dynamic = "force-dynamic";

import { AdCampaignGenerateForm } from "@/components/ads/AdCampaignGenerateForm";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewAdCampaignPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.ads;

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/ads" label={copy.backToAds} />

      <div className="mb-10 mt-10 max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.new.eyebrow}
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.new.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-white/50">
          {copy.new.subtitle}
        </p>
      </div>

      <div className="max-w-3xl">
        <AdCampaignGenerateForm messages={messages} />
      </div>
    </main>
  );
}
