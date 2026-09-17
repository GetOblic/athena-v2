/**
 * Server-owned Free Traction presentation state for /ads family.
 * Reads only. Never reserves, binds, consumes, or releases.
 */

import {
  deriveFreeTractionPresentation,
  type FreeTractionPresentation,
} from "@/lib/ads/freeTractionPresentation";
import {
  loadFreeProgressionState,
  type FreeProgressionState,
} from "@/services/organization/freeProgressionState";
import {
  loadFreeTractionAuthority,
  type FreeTractionAuthority,
} from "@/services/organization/freeTractionAuthority";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import {
  getAdCampaignById,
  organizationHasAdCampaignWithStatus,
} from "@/services/ads/adCampaignService";
import type { AdCampaignStatus } from "@/services/ads/adCampaignTypes";

export type FreeTractionPageState = FreeProgressionState & {
  traction: FreeTractionAuthority;
  presentation: FreeTractionPresentation;
  boundCampaignStatus: AdCampaignStatus | null;
};

const EMPTY_TRACTION_AUTHORITY: FreeTractionAuthority = {
  status: "available",
  campaignId: null,
  reservedAt: null,
  reservationToken: null,
};

export async function loadFreeTractionPageState(): Promise<FreeTractionPageState> {
  const { organizationId } = await requireCurrentOrganizationContext();
  const freeProgression = await loadFreeProgressionState();
  if (freeProgression.athenaPlan !== "free") {
    return {
      ...freeProgression,
      traction: EMPTY_TRACTION_AUTHORITY,
      presentation: "full",
      boundCampaignStatus: null,
    };
  }

  const traction = await loadFreeTractionAuthority(organizationId);

  const [boundCampaign, hasReadyCampaign, hasInFlightCampaign] = await Promise.all([
    traction.campaignId
      ? getAdCampaignById(traction.campaignId, organizationId)
      : Promise.resolve(null),
    organizationHasAdCampaignWithStatus(organizationId, ["Ready"]),
    organizationHasAdCampaignWithStatus(organizationId, ["Queued", "Processing"]),
  ]);

  const boundCampaignStatus = boundCampaign?.status ?? null;
  const presentation = deriveFreeTractionPresentation({
    athenaPlan: freeProgression.athenaPlan,
    defineKind: freeProgression.defineKind,
    tractionStatus: traction.status,
    boundCampaignId: traction.campaignId,
    boundCampaignStatus,
    hasReadyCampaign,
    hasInFlightCampaign,
  });

  return {
    ...freeProgression,
    traction,
    presentation,
    boundCampaignStatus,
  };
}
