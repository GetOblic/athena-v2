import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonaImportForms } from "@/components/personas/PersonaImportForms";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function PersonaImportPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.personas;

  return (
    <TenantAppShell currentPath="/personas/import" messages={messages}>
      <Link
        href="/personas"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToPersonas}
      </Link>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.import.createTitle}
        subtitle={copy.import.subtitle}
      />
      <PersonaImportForms messages={messages} />
    </TenantAppShell>
  );
}
