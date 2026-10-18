export const dynamic = "force-dynamic";

import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import {
  ClientProspectIntelligenceUnavailable,
  ClientProspectIntelligenceWorkspace,
} from "@/components/clientProspectIntelligence/ClientProspectIntelligenceWorkspace";
import { CLIENT_PROSPECT_INTELLIGENCE_HREF } from "@/lib/clientProspectIntelligence/clientProspectIntelligencePath";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadClientProspectIntelligence } from "@/services/clientProspectIntelligence/clientProspectIntelligenceRead";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function ClientProspectIntelligencePage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, messages }, intelligence, progression] = await Promise.all([
    getTenantLocalization(),
    loadClientProspectIntelligence(organizationId),
    loadFreeProgressionState(),
  ]);

  return (
    <TenantAppShell
      currentPath={CLIENT_PROSPECT_INTELLIGENCE_HREF}
      messages={messages}
      athenaPlan={progression.athenaPlan}
      defineKind={progression.defineKind}
    >
      {intelligence.ok ? (
        <ClientProspectIntelligenceWorkspace
          view={intelligence.view}
          messages={messages}
          language={language}
        />
      ) : (
        <ClientProspectIntelligenceUnavailable
          copy={messages.clientProspectIntelligence}
        />
      )}
    </TenantAppShell>
  );
}
