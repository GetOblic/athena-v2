export const dynamic = "force-dynamic";

import Link from "next/link";
import { AdCampaignGenerateForm } from "@/components/ads/AdCampaignGenerateForm";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function NewAdCampaignPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.ads;

  return (
    <TenantAppShell currentPath="/ads/new" messages={messages}>
      <Link
        href="/ads"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToAds}
      </Link>
      <TractionPageHeader
        eyebrow={copy.new.eyebrow}
        title={copy.new.title}
        subtitle={copy.new.subtitle}
      />
      <div className="max-w-3xl">
        <AdCampaignGenerateForm messages={messages} />
      </div>
    </TenantAppShell>
  );
}
