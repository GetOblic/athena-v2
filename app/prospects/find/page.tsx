export const dynamic = "force-dynamic";

import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { GetOblicOpportunityDiscovery } from "@/components/prospects/GetOblicOpportunityDiscovery";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getGetOblicAllocationUsage,
  getGetOblicDirectorySettings,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function FindOpportunitiesPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const settings = await getGetOblicDirectorySettings(organizationId);
  const usage = settings.configured
    ? await getGetOblicAllocationUsage(organizationId)
    : null;

  return (
    <TenantAppShell currentPath="/prospects/find" messages={messages}>
      <Link
        href="/prospects"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToProspects}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.find.title}
        subtitle={copy.find.subtitle}
      />
      <GetOblicOpportunityDiscovery
        messages={messages}
        notConfigured={!settings.configured}
        allowanceExhausted={Boolean(
          usage?.configured && usage.remaining <= 0,
        )}
      />
    </TenantAppShell>
  );
}
