/**
 * Server-owned Free Audience presentation state for /personas family.
 * Reads only. Never reserves, binds, consumes, or releases.
 */

import {
  deriveFreeAudiencePresentation,
  type FreeAudiencePresentation,
} from "@/lib/personas/freeAudiencePresentation";
import {
  loadFreeProgressionState,
  type FreeProgressionState,
} from "@/services/organization/freeProgressionState";
import {
  loadFreeAudienceAuthority,
  type FreeAudienceAuthority,
} from "@/services/organization/freeAudienceAuthority";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { organizationHasPersona } from "@/services/personas/personaService";

export type FreeAudiencePageState = FreeProgressionState & {
  audience: FreeAudienceAuthority;
  presentation: FreeAudiencePresentation;
};

const EMPTY_AUDIENCE_AUTHORITY: FreeAudienceAuthority = {
  status: "available",
  personaId: null,
  reservedAt: null,
  reservationToken: null,
};

export async function loadFreeAudiencePageState(): Promise<FreeAudiencePageState> {
  const { organizationId } = await requireCurrentOrganizationContext();
  const freeProgression = await loadFreeProgressionState();
  if (freeProgression.athenaPlan !== "free") {
    return {
      ...freeProgression,
      audience: EMPTY_AUDIENCE_AUTHORITY,
      presentation: "full",
    };
  }

  const [audience, hasPersona] = await Promise.all([
    loadFreeAudienceAuthority(organizationId),
    organizationHasPersona(organizationId),
  ]);

  const presentation = deriveFreeAudiencePresentation({
    athenaPlan: freeProgression.athenaPlan,
    defineKind: freeProgression.defineKind,
    audienceStatus: audience.status,
    boundPersonaId: audience.personaId,
    hasPersona,
  });

  return {
    ...freeProgression,
    audience,
    presentation,
  };
}
