export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Search,
} from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { GetOblicListingCapacitySummary } from "@/components/prospects/GetOblicListingCapacitySummary";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { deriveProspectLibrarySummary } from "@/lib/prospects/prospectLibrarySummary";
import {
  PROSPECT_LIBRARY_PRIMARY_ACTION,
  PROSPECT_LIBRARY_SECONDARY_ACTION,
  PROSPECT_SUMMARY_ITEM_CLASS,
  PROSPECT_SUMMARY_STRIP_CLASS,
} from "@/lib/prospects/prospectLibraryPresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getGetOblicListingCapacity } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const [prospects, capacity] = await Promise.all([
    loadProspectsForLibrary(organizationId),
    getGetOblicListingCapacity(organizationId),
  ]);
  const counts = deriveProspectLibrarySummary(prospects);

  return (
    <TenantAppShell currentPath="/prospects" messages={messages}>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={copy.subtitle}
        action={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/prospects/find" className={PROSPECT_LIBRARY_PRIMARY_ACTION}>
              <Search className="size-4" aria-hidden="true" />
              {copy.list.findOpportunitiesCta}
            </Link>
            <Link
              href="/prospects/import"
              className={PROSPECT_LIBRARY_SECONDARY_ACTION}
            >
              <Plus className="size-4" aria-hidden="true" />
              {copy.list.importCta}
            </Link>
          </div>
        }
      >
        {counts.total > 0 ? (
          <div className={PROSPECT_SUMMARY_STRIP_CLASS}>
            <span className={PROSPECT_SUMMARY_ITEM_CLASS}>
              <Building2 className="size-3.5 text-sky-300" aria-hidden="true" />
              {interpolateTenantMessage(
                counts.total === 1
                  ? copy.list.prospectsOne
                  : copy.list.prospectsMany,
                { count: counts.total },
              )}
            </span>
            {counts.newCount > 0 ? (
              <span className={PROSPECT_SUMMARY_ITEM_CLASS}>
                {interpolateTenantMessage(
                  counts.newCount === 1 ? copy.list.newOne : copy.list.newMany,
                  { count: counts.newCount },
                )}
              </span>
            ) : null}
            {counts.followUpCount > 0 ? (
              <span className={PROSPECT_SUMMARY_ITEM_CLASS}>
                {interpolateTenantMessage(
                  counts.followUpCount === 1
                    ? copy.list.followUpOne
                    : copy.list.followUpMany,
                  { count: counts.followUpCount },
                )}
              </span>
            ) : null}
            {counts.ready > 0 ? (
              <span className={PROSPECT_SUMMARY_ITEM_CLASS}>
                <CheckCircle2
                  className="size-3.5 text-[var(--athena-success)]"
                  aria-hidden="true"
                />
                {interpolateTenantMessage(
                  counts.ready === 1 ? copy.list.readyOne : copy.list.readyMany,
                  { count: counts.ready },
                )}
              </span>
            ) : null}
            {counts.generating > 0 ? (
              <span className={PROSPECT_SUMMARY_ITEM_CLASS}>
                <LoaderCircle
                  className="size-3.5 text-amber-200"
                  aria-hidden="true"
                />
                {interpolateTenantMessage(
                  counts.generating === 1
                    ? copy.list.generatingOne
                    : copy.list.generatingMany,
                  { count: counts.generating },
                )}
              </span>
            ) : null}
          </div>
        ) : null}
        <GetOblicListingCapacitySummary
          capacity={capacity}
          messages={copy.list}
        />
      </TractionPageHeader>

      <ProspectsLibraryClient
        prospects={prospects}
        messages={messages}
        language={language}
      />
    </TenantAppShell>
  );
}
