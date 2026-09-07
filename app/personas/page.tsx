export const dynamic = "force-dynamic";

import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonasLibraryClient } from "@/components/personas/PersonasLibraryClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import {
  deriveAudienceLibrarySummary,
  formatAudienceLibrarySummary,
} from "@/lib/personas/audienceLibrarySummary";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { enrichPersonasForLibrary } from "@/services/personas/personaLibraryEnrichment";
import { getPersonas } from "@/services/personas/personaService";

export default async function PersonasPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.personas;

  let personas: ReturnType<typeof enrichPersonasForLibrary> = [];
  let loadError: string | null = null;

  try {
    personas = enrichPersonasForLibrary(await getPersonas(organizationId));
  } catch (error) {
    console.error("[PERSONAS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  const summary = formatAudienceLibrarySummary(
    deriveAudienceLibrarySummary(personas),
    {
      audiencesOne: copy.traction.audiencesOne,
      audiencesMany: copy.traction.audiencesMany,
      readyOne: copy.traction.readyOne,
      readyMany: copy.traction.readyMany,
      generatingOne: copy.traction.generatingOne,
      generatingMany: copy.traction.generatingMany,
    },
    interpolateTenantMessage,
  );

  return (
    <TenantAppShell currentPath="/personas" messages={messages}>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={copy.subtitle}
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: copy.traction.audiences,
              current: true,
            },
            {
              href: "/ads",
              label: copy.traction.advertising,
              help: copy.traction.advertisingHelp,
            },
            {
              href: "/social-planner",
              label: copy.traction.socialContent,
              help: copy.traction.socialHelp,
            },
          ]}
        />
        {summary ? (
          <p className="mt-4 text-sm text-white/45">{summary}</p>
        ) : null}
      </TractionPageHeader>

      <PersonasLibraryClient
        personas={personas}
        loadError={loadError}
        messages={messages}
        language={language}
      />
    </TenantAppShell>
  );
}
