export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  LoaderCircle,
  Search,
} from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { GetOblicListingCapacitySummary } from "@/components/prospects/GetOblicListingCapacitySummary";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  freeConvertBoundaryCopyKey,
  shouldShowFreeConvertContinuation,
  shouldShowGetOblicListingCapacityCard,
  shouldShowProspectFindAdd,
} from "@/lib/prospects/freeConvertPresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { convertUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import { deriveProspectLibrarySummary } from "@/lib/prospects/prospectLibrarySummary";
import {
  PROSPECT_LIBRARY_PRIMARY_ACTION,
  PROSPECT_SUMMARY_ITEM_CLASS,
  PROSPECT_SUMMARY_STRIP_CLASS,
} from "@/lib/prospects/prospectLibraryPresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getGetOblicListingCapacity } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadFreeConvertPageState } from "@/services/prospects/freeConvertPageState";
import { loadProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, messages }, freeConvert] = await Promise.all([
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
  const showFind = shouldShowProspectFindAdd(presentation);
  const showListingCapacity = shouldShowGetOblicListingCapacityCard(presentation);
  const [prospects, capacity] = await Promise.all([
    loadProspectsForLibrary(organizationId),
    showListingCapacity
      ? getGetOblicListingCapacity(organizationId)
      : Promise.resolve(null),
  ]);
  const counts = deriveProspectLibrarySummary(prospects);
  const boundProspectHref = convert.prospectId
    ? `/prospects/${convert.prospectId}`
    : null;
  const noteKey = freeConvertBoundaryCopyKey(presentation);
  const freeNote = noteKey ? copy.free[noteKey] : null;

  return (
    <TenantAppShell
      currentPath="/prospects"
      messages={messages}
      {...freeProgression}
    >
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={
          presentation === "available"
            ? copy.free.availableSubtitle
            : copy.subtitle
        }
        action={
          showFind ? (
            <Link href="/prospects/find" className={PROSPECT_LIBRARY_PRIMARY_ACTION}>
              <Search className="size-4" aria-hidden="true" />
              {copy.list.findOpportunitiesCta}
            </Link>
          ) : boundProspectHref ? (
            <Link href={boundProspectHref} className={PROSPECT_LIBRARY_PRIMARY_ACTION}>
              {copy.free.openBoundProspect}
            </Link>
          ) : null
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
        {freeNote ? (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/55">
            {freeNote}
          </p>
        ) : null}
        {showListingCapacity && capacity ? (
          <GetOblicListingCapacitySummary
            capacity={capacity}
            messages={copy.list}
          />
        ) : null}
      </TractionPageHeader>

      <ProspectsLibraryClient
        prospects={prospects}
        messages={messages}
        language={language}
        showFindCreate={showFind}
        boundProspectHref={boundProspectHref}
      />

      {shouldShowFreeConvertContinuation(presentation) ? (
        <div className="mt-10">
          <UpgradeCompletionCard
            {...convertUpgradeContent({
              continuation: copy.free.continuation,
              upgrade: messages.upgrade,
            })}
          />
        </div>
      ) : null}
    </TenantAppShell>
  );
}
