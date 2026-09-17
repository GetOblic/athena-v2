/**
 * Server-owned Free Convert Opportunities presentation state for /prospects.
 * Reads only. Never reserves, binds, consumes, or releases.
 */

import {
  deriveFreeConvertPresentation,
  type FreeConvertPresentation,
} from "@/lib/prospects/freeConvertPresentation";
import {
  loadFreeProgressionState,
  type FreeProgressionState,
} from "@/services/organization/freeProgressionState";
import {
  loadFreeConvertAuthority,
  type FreeConvertAuthority,
} from "@/services/organization/freeConvertAuthority";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import {
  getProspectById,
  organizationHasProspectWithStatus,
} from "@/services/prospects/prospectService";

export type FreeConvertPageState = FreeProgressionState & {
  convert: FreeConvertAuthority;
  presentation: FreeConvertPresentation;
  boundProspectStatus: string | null;
};

const EMPTY_CONVERT_AUTHORITY: FreeConvertAuthority = {
  status: "available",
  prospectId: null,
  reservedAt: null,
  reservationToken: null,
};

const IN_FLIGHT_STATUSES = [
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
] as const;

export async function loadFreeConvertPageState(): Promise<FreeConvertPageState> {
  const { organizationId } = await requireCurrentOrganizationContext();
  const freeProgression = await loadFreeProgressionState();
  if (freeProgression.athenaPlan !== "free") {
    return {
      ...freeProgression,
      convert: EMPTY_CONVERT_AUTHORITY,
      presentation: "full",
      boundProspectStatus: null,
    };
  }

  const convert = await loadFreeConvertAuthority(organizationId);

  const [boundProspect, hasReadyProspect, hasInFlightProspect] =
    await Promise.all([
      convert.prospectId
        ? getProspectById(convert.prospectId, organizationId)
        : Promise.resolve(null),
      organizationHasProspectWithStatus(organizationId, ["Ready"]),
      organizationHasProspectWithStatus(organizationId, IN_FLIGHT_STATUSES),
    ]);

  const boundProspectStatus = boundProspect?.status ?? null;
  const presentation = deriveFreeConvertPresentation({
    athenaPlan: freeProgression.athenaPlan,
    defineKind: freeProgression.defineKind,
    convertStatus: convert.status,
    boundProspectId: convert.prospectId,
    boundProspectStatus,
    hasReadyProspect,
    hasInFlightProspect,
  });

  return {
    ...freeProgression,
    convert,
    presentation,
    boundProspectStatus,
  };
}
