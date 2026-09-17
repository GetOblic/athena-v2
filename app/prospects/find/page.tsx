export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { OpportunityDiscoveryMethods } from "@/components/prospects/OpportunityDiscoveryMethods";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { PROSPECT_BACK_LINK_CLASS } from "@/lib/prospects/prospectDetailPresentation";
import {
  shouldOfferGetOblicDiscovery,
  shouldOfferGoogleDiscovery,
  shouldRequireGoogleAuthorMapping,
  shouldShowProspectFindAdd,
} from "@/lib/prospects/freeConvertPresentation";
import { PROSPECT_LIBRARY_PRIMARY_ACTION } from "@/lib/prospects/prospectLibraryPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getGetOblicDirectorySettings,
  getGetOblicListingCapacity,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getOrganizationProspectCapacity } from "@/services/prospects/prospectCapacity";
import { loadFreeConvertPageState } from "@/services/prospects/freeConvertPageState";

export default async function FindOpportunitiesPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ messages }, freeConvert] = await Promise.all([
    getTenantLocalization(),
    loadFreeConvertPageState(),
  ]);
  const copy = messages.prospects;
  const {
    presentation,
    convert,
    boundProspectStatus: _boundProspectStatus,
    ...freeProgression
  } = freeConvert;
  const canAddProspect = shouldShowProspectFindAdd(presentation);
  const requireGoogleAuthorMapping =
    shouldRequireGoogleAuthorMapping(presentation);
  const boundProspectHref = convert.prospectId
    ? `/prospects/${convert.prospectId}`
    : null;
  const [settings, prospectCapacity] = await Promise.all([
    requireGoogleAuthorMapping
      ? getGetOblicDirectorySettings(organizationId)
      : Promise.resolve(null),
    getOrganizationProspectCapacity(organizationId),
  ]);
  const capacity =
    settings?.configured
      ? await getGetOblicListingCapacity(organizationId)
      : null;
  const authorMappingMissing = requireGoogleAuthorMapping
    ? !settings ||
      !settings.configured ||
      settings.settings.wordpress_author_id == null ||
      settings.settings.wordpress_author_id <= 0
    : false;

  return (
    <TenantAppShell
      currentPath="/prospects/find"
      messages={messages}
      {...freeProgression}
    >
      <Link href="/prospects" className={PROSPECT_BACK_LINK_CLASS}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {messages.nav.prospects}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.find.title}
        subtitle={
          presentation === "available"
            ? copy.free.findContext
            : copy.find.subtitle
        }
      />
      {!canAddProspect && boundProspectHref ? (
        <div className="mb-6">
          <p className="mb-3 text-sm leading-6 text-white/55">
            {presentation === "processing"
              ? copy.free.processingNote
              : presentation === "failed"
                ? copy.free.failedNote
                : presentation === "consumed"
                  ? copy.free.completedNote
                  : copy.free.boundNote}
          </p>
          <Link href={boundProspectHref} className={PROSPECT_LIBRARY_PRIMARY_ACTION}>
            {copy.free.openBoundProspect}
          </Link>
        </div>
      ) : null}
      <OpportunityDiscoveryMethods
        messages={messages}
        prospectCapacityReached={prospectCapacity.reached}
        listingCapacityReached={Boolean(
          capacity?.configured &&
            capacity.currentlyHeld >= capacity.listingCapacity,
        )}
        authorMappingMissing={authorMappingMissing}
        canAddProspect={canAddProspect}
        directoryAvailable={shouldOfferGetOblicDiscovery(presentation)}
        googleAvailable={shouldOfferGoogleDiscovery(presentation)}
      />
    </TenantAppShell>
  );
}
