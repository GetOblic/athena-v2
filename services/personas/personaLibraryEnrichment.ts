/**
 * Read-time Persona library enrichment (Stage 2).
 * Uses stored fields only — no generation jobs or version lookups.
 */

import {
  formatPersonaOpportunityScore,
  formatPersonaLocation,
  formatPersonaReferenceWebsiteDisplay,
  resolvePersonaDisplayReadiness,
  type PersonaDisplayReadiness,
} from "@/services/personas/personaDisplay";
import {
  normalizePersonaLifecycleStatus,
  type PersonaLifecycleStatus,
} from "@/services/personas/personaLifecycle";
import { toPublicPersona, type PublicPersona } from "@/services/personas/personaPublic";
import type { Persona } from "@/services/personas/personaService";

export type PersonaLibraryRow = PublicPersona & {
  /** Stage 2 display readiness (never implies a live queued generation job). */
  display_status: PersonaDisplayReadiness;
  display_lifecycle_status: PersonaLifecycleStatus;
  display_opportunity_score: number | null;
  display_opportunity_score_label: string;
  display_location: string | null;
  display_reference_website: string | null;
};

export function enrichPersonasForLibrary(
  personas: Persona[],
): PersonaLibraryRow[] {
  return personas.map((persona) => {
    const pub = toPublicPersona(persona);
    const score =
      typeof persona.opportunity_score === "number" &&
      Number.isFinite(persona.opportunity_score)
        ? Math.round(persona.opportunity_score)
        : null;

    return {
      ...pub,
      display_status: resolvePersonaDisplayReadiness(persona.status),
      display_lifecycle_status: normalizePersonaLifecycleStatus(
        persona.lifecycle_status,
      ),
      display_opportunity_score: score,
      display_opportunity_score_label: formatPersonaOpportunityScore(score),
      display_location: formatPersonaLocation(persona),
      display_reference_website: formatPersonaReferenceWebsiteDisplay(
        persona.reference_website,
      ),
    };
  });
}
