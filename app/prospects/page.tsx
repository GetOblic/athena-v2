export const dynamic = "force-dynamic";

import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  deriveProspectLibrarySummary,
  formatProspectLibrarySummary,
} from "@/lib/prospects/prospectLibrarySummary";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const prospects = await loadProspectsForLibrary(organizationId);
  const summary = formatProspectLibrarySummary(
    deriveProspectLibrarySummary(prospects),
    {
      prospectsOne: copy.list.prospectsOne,
      prospectsMany: copy.list.prospectsMany,
      newOne: copy.list.newOne,
      newMany: copy.list.newMany,
      followUpOne: copy.list.followUpOne,
      followUpMany: copy.list.followUpMany,
      readyOne: copy.list.readyOne,
      readyMany: copy.list.readyMany,
      generatingOne: copy.list.generatingOne,
      generatingMany: copy.list.generatingMany,
    },
    interpolateTenantMessage,
  );

  return (
    <TenantAppShell currentPath="/prospects" messages={messages}>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={copy.subtitle}
      >
        {summary ? (
          <p className="mt-4 text-sm text-white/45">{summary}</p>
        ) : null}
      </TractionPageHeader>

      <ProspectsLibraryClient
        prospects={prospects}
        messages={messages}
        language={language}
      />
    </TenantAppShell>
  );
}
