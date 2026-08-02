export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { AdCampaignDetailView } from "@/components/ads/AdCampaignDetailView";
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
  const campaign = await getAdCampaignById(id, organizationId);
  if (!campaign) {
    notFound();
  }

  return (
    <>
      <div className="px-10 pt-10">
        <AthenaBrandLink />
      </div>
      <AdCampaignDetailView campaign={toPublicAdCampaignDetail(campaign)} />
    </>
  );
}
