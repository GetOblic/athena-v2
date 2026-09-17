/**
 * Dedicated Free Audience suggest / persist boundary.
 * Reserves before provider or persist. Reuses existing Persona generate
 * + import architecture. Does not invent a Free pipeline.
 */

import { FreeAudienceGenerationError } from "@/lib/organization/freeAudienceGeneration";
import {
  bindFreeAudiencePersona,
  consumeFreeAudienceIfReserved,
  ensureFreeAudiencePersistReservation,
  releaseFreeAudienceIfReserved,
  reserveFreeAudience,
  type ReserveFreeAudienceSuccess,
} from "@/services/organization/freeAudienceAuthority";
import { resolveAthenaPlan } from "@/services/organizationService";
import {
  generatePersonaCandidate,
  type GeneratePersonaCandidateDeps,
  type PersonaGenerationSuccess,
} from "@/services/personas/personaGeneration";
import {
  importPersonaManualUnchecked,
  type PersonaImportRow,
} from "@/services/personas/personaImporter";
import { deletePersona } from "@/services/personas/personaService";

async function reserveForFreeOrganization(
  organizationId: string,
): Promise<ReserveFreeAudienceSuccess | null> {
  const plan = await resolveAthenaPlan(organizationId);
  if (plan !== "free") return null;
  return reserveFreeAudience(organizationId);
}

export async function generateFreeAudienceCandidate(input: {
  organizationId: string;
  instruction?: string | null;
  prospectContextBlock?: string | null;
  clientOrganizationId?: unknown;
  deps?: GeneratePersonaCandidateDeps;
}): Promise<PersonaGenerationSuccess> {
  const reservation = await reserveForFreeOrganization(input.organizationId);

  try {
    return await generatePersonaCandidate({
      organizationId: input.organizationId,
      instruction: input.instruction,
      prospectContextBlock: input.prospectContextBlock,
      clientOrganizationId: input.clientOrganizationId,
      deps: input.deps,
    });
  } catch (error) {
    if (reservation) {
      await releaseFreeAudienceIfReserved({
        organizationId: input.organizationId,
        reservationToken: reservation.reservationToken,
      });
    }
    throw error;
  }
}

export async function persistFreeAudiencePersona(input: {
  organizationId: string;
  userId: string | null;
  row: PersonaImportRow;
  rawJson?: Record<string, unknown> | null;
}): Promise<Awaited<ReturnType<typeof importPersonaManualUnchecked>>> {
  const plan = await resolveAthenaPlan(input.organizationId);
  const reservation =
    plan === "free"
      ? await ensureFreeAudiencePersistReservation(input.organizationId)
      : null;

  let createdId: string | null = null;
  try {
    const result = await importPersonaManualUnchecked(input);
    createdId = result.duplicate ? null : result.persona.id;

    if (!reservation) {
      return result;
    }

    try {
      await bindFreeAudiencePersona({
        organizationId: input.organizationId,
        reservationToken: reservation.reservationToken,
        personaId: result.persona.id,
      });
    } catch (error) {
      if (createdId) {
        await deletePersona(createdId, input.organizationId);
      }
      throw error;
    }

    await consumeFreeAudienceIfReserved({
      organizationId: input.organizationId,
      personaId: result.persona.id,
    });
    return result;
  } catch (error) {
    if (reservation && !createdId && !reservation.reused) {
      await releaseFreeAudienceIfReserved({
        organizationId: input.organizationId,
        reservationToken: reservation.reservationToken,
      });
    }
    if (error instanceof FreeAudienceGenerationError) {
      throw error;
    }
    throw error;
  }
}
