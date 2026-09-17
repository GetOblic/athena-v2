import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { ProspectImportForms } from "@/components/prospects/ProspectImportForms";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  shouldShowProspectCreate,
  shouldShowProspectCsvImport,
  shouldShowProspectCsvLocked,
} from "@/lib/prospects/freeConvertPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadFreeConvertPageState } from "@/services/prospects/freeConvertPageState";

export default async function ProspectImportPage() {
  await requireCurrentOrganizationContext();
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

  if (!shouldShowProspectCreate(presentation)) {
    redirect(
      convert.prospectId ? `/prospects/${convert.prospectId}` : "/prospects",
    );
  }

  return (
    <TenantAppShell
      currentPath="/prospects/import"
      messages={messages}
      {...freeProgression}
    >
      <Link
        href="/prospects"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToProspects}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.import.createTitle}
        subtitle={
          presentation === "available"
            ? copy.free.manualContext
            : copy.import.subtitle
        }
      />
      <ProspectImportForms
        messages={messages}
        showCsvImport={shouldShowProspectCsvImport(presentation)}
        showCsvLocked={shouldShowProspectCsvLocked(presentation)}
      />
    </TenantAppShell>
  );
}
