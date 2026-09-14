export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { OpportunityDiscoveryMethods } from "@/components/prospects/OpportunityDiscoveryMethods";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { PROSPECT_BACK_LINK_CLASS } from "@/lib/prospects/prospectDetailPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getGetOblicDirectorySettings,
  getGetOblicListingCapacity,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function FindOpportunitiesPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const settings = await getGetOblicDirectorySettings(organizationId);
  const capacity = settings.configured
    ? await getGetOblicListingCapacity(organizationId)
    : null;
  const authorMappingMissing =
    !settings.configured ||
    settings.settings.wordpress_author_id == null ||
    settings.settings.wordpress_author_id <= 0;

  return (
    <TenantAppShell currentPath="/prospects/find" messages={messages}>
      <Link href="/prospects" className={PROSPECT_BACK_LINK_CLASS}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {messages.nav.prospects}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.find.title}
        subtitle={copy.find.subtitle}
      />
      <OpportunityDiscoveryMethods
        messages={messages}
        notConfigured={!settings.configured}
        listingCapacityReached={Boolean(
          capacity?.configured &&
            capacity.currentlyHeld >= capacity.listingCapacity,
        )}
        authorMappingMissing={authorMappingMissing}
      />
    </TenantAppShell>
  );
}
