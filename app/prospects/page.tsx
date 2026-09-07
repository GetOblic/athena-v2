export const dynamic = "force-dynamic";

import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { enrichProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";
import { getProspects } from "@/services/prospects/prospectService";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const prospects = await enrichProspectsForLibrary(
    await getProspects(organizationId),
    organizationId,
  );

  return (
    <TenantAppShell currentPath="/prospects" messages={messages}>
      <div className="mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.subtitle}
        </p>
      </div>

      <ProspectsLibraryClient
        prospects={prospects}
        messages={messages}
        language={language}
      />
    </TenantAppShell>
  );
}
