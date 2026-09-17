export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AdCampaignGenerateForm } from "@/components/ads/AdCampaignGenerateForm";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  AD_CREATE_BACK_LINK_CLASS,
  AD_CREATE_HEADER_ICON_WELL,
} from "@/lib/ads/adCampaignCreatePresentation";
import { shouldShowAdsCreate } from "@/lib/ads/freeTractionPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadFreeTractionPageState } from "@/services/ads/freeTractionPageState";
import { resolveAdsTargetAudienceView } from "@/services/ads/adsTargetPersona";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewAdCampaignPage({
  searchParams,
}: {
  searchParams?: Promise<{ personaId?: string }>;
}) {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ messages }, freeTraction] = await Promise.all([
    getTenantLocalization(),
    loadFreeTractionPageState(),
  ]);
  const params = searchParams ? await searchParams : {};
  const copy = messages.ads;
  const { presentation, traction, boundCampaignStatus: _boundCampaignStatus, ...freeProgression } =
    freeTraction;

  if (!shouldShowAdsCreate(presentation)) {
    redirect(traction.campaignId ? `/ads/${traction.campaignId}` : "/ads");
  }

  const targetAudience = await resolveAdsTargetAudienceView(
    typeof params.personaId === "string" ? params.personaId : null,
    organizationId,
  );

  return (
    <TenantAppShell
      currentPath="/ads/new"
      messages={messages}
      {...freeProgression}
    >
      <Link href="/ads" className={AD_CREATE_BACK_LINK_CLASS}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {copy.detail.backLabel}
      </Link>
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={AD_CREATE_HEADER_ICON_WELL} aria-hidden="true">
            <Megaphone className="size-5" />
          </span>
        </div>
        <TractionPageHeader
          eyebrow={copy.new.eyebrow}
          title={copy.new.title}
          subtitle={copy.new.subtitle}
        />
      </div>
      <div className="max-w-3xl">
        <AdCampaignGenerateForm
          messages={messages}
          targetAudience={targetAudience}
          starterContext={
            presentation === "available" ? copy.free.newContext : null
          }
        />
      </div>
    </TenantAppShell>
  );
}
