export const dynamic = "force-dynamic";

import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { PersonasLibraryClient } from "@/components/personas/PersonasLibraryClient";
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

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/" label={copy.backToDashboard} />

      <div className="mb-10 mt-10">
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

      <PersonasLibraryClient
        personas={personas}
        loadError={loadError}
        messages={messages}
        language={language}
      />
    </main>
  );
}
