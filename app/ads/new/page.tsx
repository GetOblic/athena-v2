export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AdCampaignGenerateForm } from "@/components/ads/AdCampaignGenerateForm";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  AD_CREATE_BACK_LINK_CLASS,
  AD_CREATE_HEADER_ICON_WELL,
} from "@/lib/ads/adCampaignCreatePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewAdCampaignPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.ads;

  return (
    <TenantAppShell currentPath="/ads/new" messages={messages}>
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
        <AdCampaignGenerateForm messages={messages} />
      </div>
    </TenantAppShell>
  );
}
