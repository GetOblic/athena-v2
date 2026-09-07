export const dynamic = "force-dynamic";

import { AdsLibraryClient } from "@/components/ads/AdsLibraryClient";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
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
    <TenantAppShell currentPath="/ads" messages={messages}>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: copy.traction.audiences,
            },
            {
              href: "/ads",
              label: copy.title,
              current: true,
            },
            {
              href: "/social-planner",
              label: copy.traction.socialContent,
            },
          ]}
        />
      </TractionPageHeader>

      <AdsLibraryClient
        campaigns={campaigns}
        loadError={loadError}
        messages={messages}
        language={language}
      />
    </TenantAppShell>
  );
}
