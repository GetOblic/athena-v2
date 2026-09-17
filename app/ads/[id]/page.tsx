export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AdCampaignDetailView } from "@/components/ads/AdCampaignDetailView";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import {
  shouldShowAdsRegenerate,
  shouldShowAdsRetrySameCampaign,
  shouldShowFreeTractionContinuation,
} from "@/lib/ads/freeTractionPresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { advertisingUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadFreeTractionPageState } from "@/services/ads/freeTractionPageState";
import { toPublicAdCampaignDetail } from "@/services/ads/adCampaignPublic";
import { getAdCampaignById } from "@/services/ads/adCampaignService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ messages }, freeTraction] = await Promise.all([
    getTenantLocalization(),
    loadFreeTractionPageState(),
  ]);
  const campaign = await getAdCampaignById(id, organizationId);
  if (!campaign) {
    notFound();
  }

  const { presentation, traction, boundCampaignStatus: _boundCampaignStatus, ...freeProgression } =
    freeTraction;
  const allowRegenerate = shouldShowAdsRegenerate(presentation);
  const allowRetrySame = shouldShowAdsRetrySameCampaign(presentation, {
    currentCampaignId: campaign.id,
    boundCampaignId: traction.campaignId,
  });
  const boundaryNote =
    presentation === "consumed"
      ? messages.ads.free.completedNote
      : presentation === "failed" && allowRetrySame
        ? messages.ads.free.failedNote
        : presentation === "processing"
          ? messages.ads.free.processingNote
          : null;

  return (
    <TenantAppShell
      currentPath={`/ads/${id}`}
      messages={messages}
      {...freeProgression}
    >
      <AdCampaignDetailView
        campaign={toPublicAdCampaignDetail(campaign)}
        messages={messages}
        allowRegenerate={allowRegenerate}
        allowRetrySame={allowRetrySame}
        boundaryNote={boundaryNote}
      />
      {shouldShowFreeTractionContinuation(presentation) ? (
        <div className="mt-10">
          <UpgradeCompletionCard
            {...advertisingUpgradeContent({
              continuation: messages.ads.free.continuation,
              upgrade: messages.upgrade,
            })}
          />
        </div>
      ) : null}
    </TenantAppShell>
  );
}
