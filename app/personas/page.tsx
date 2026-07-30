export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { PersonasLibraryClient } from "@/components/personas/PersonasLibraryClient";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { enrichPersonasForLibrary } from "@/services/personas/personaLibraryEnrichment";
import { getPersonas } from "@/services/personas/personaService";

export default async function PersonasPage() {
  const { organizationId } = await requireCurrentOrganizationContext();

  let personas: ReturnType<typeof enrichPersonasForLibrary> = [];
  let loadError: string | null = null;

  try {
    personas = enrichPersonasForLibrary(await getPersonas(organizationId));
  } catch (error) {
    console.error("[PERSONAS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error
        ? error.message
        : "Failed to load Personas for this organization.";
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Persona Intelligence
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Personas</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Clientele types and customer archetypes Athena can understand and
          reason about as first-class intelligence sources.
        </p>
      </div>

      <PersonasLibraryClient personas={personas} loadError={loadError} />
    </main>
  );
}
