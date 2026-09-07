import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { ProspectImportForms } from "@/components/prospects/ProspectImportForms";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function ProspectImportPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.prospects;

  return (
    <TenantAppShell currentPath="/prospects/import" messages={messages}>
      <Link
        href="/prospects"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToProspects}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.import.createTitle}
        subtitle={copy.import.subtitle}
      />
      <ProspectImportForms messages={messages} />
    </TenantAppShell>
  );
}
