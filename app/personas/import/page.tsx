import Link from "next/link";
import { UserPlus } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonaImportForms } from "@/components/personas/PersonaImportForms";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  PERSONA_IMPORT_BACK_LINK_CLASS,
  PERSONA_IMPORT_HEADER_ICON_WELL,
} from "@/lib/personas/personaImportPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function PersonaImportPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.personas;

  return (
    <TenantAppShell currentPath="/personas/import" messages={messages}>
      <Link href="/personas" className={PERSONA_IMPORT_BACK_LINK_CLASS}>
        {copy.backToPersonas}
      </Link>
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={PERSONA_IMPORT_HEADER_ICON_WELL} aria-hidden="true">
            <UserPlus className="size-5" />
          </span>
        </div>
        <TractionPageHeader
          eyebrow={copy.eyebrow}
          title={copy.import.createTitle}
          subtitle={copy.import.subtitle}
        />
      </div>
      <PersonaImportForms messages={messages} />
    </TenantAppShell>
  );
}
