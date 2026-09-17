/**
 * Dedicated Free Traction create / retry boundary.
 * Reserves before createAdCampaign / enqueue. Reuses the existing
 * Ads campaign + job architecture. Does not invent a Free pipeline.
 */

import { FreeTractionGenerationError } from "@/lib/organization/freeTractionGeneration";
import {
  bindFreeTractionCampaign,
  releaseFreeTractionIfReserved,
  reserveFreeTraction,
} from "@/services/organization/freeTractionAuthority";
import {
  enqueueGenerationForExistingCampaign,
} from "@/services/ads/adCampaignOrchestration";
import {
  createAdCampaign,
  markAdCampaignEnqueueFailed,
  type AdCampaign,
} from "@/services/ads/adCampaignService";
import { enqueueAdGenerationJob } from "@/services/ads/adsGenerationJobs/adGenerationJobService";
import type { AthenaAdGenerationJob } from "@/services/ads/adsGenerationJobs/adGenerationJobTypes";
import type { AdCampaignBrief } from "@/services/ads/adCampaignTypes";

export async function createFreeTractionAdCampaignWithJob(input: {
  organizationId: string;
  userId: string | null;
  brief?: AdCampaignBrief;
  authorizedTargetPersonaId?: string | null;
}): Promise<{ campaign: AdCampaign; job: AthenaAdGenerationJob }> {
  const reservation = await reserveFreeTraction(input.organizationId);

  if (reservation.campaignId) {
    try {
      return await enqueueGenerationForExistingCampaign({
        campaignId: reservation.campaignId,
        organizationId: input.organizationId,
        userId: input.userId,
      });
    } catch (error) {
      await releaseFreeTractionIfReserved({
        organizationId: input.organizationId,
        campaignId: reservation.campaignId,
        reservationToken: reservation.reservationToken,
      });
      throw error;
    }
  }

  let campaign: AdCampaign;
  try {
    campaign = await createAdCampaign({
      organizationId: input.organizationId,
      userId: input.userId,
      brief: input.brief,
      authorizedTargetPersonaId: input.authorizedTargetPersonaId,
    });
  } catch (error) {
    await releaseFreeTractionIfReserved({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }

  try {
    await bindFreeTractionCampaign({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
      campaignId: campaign.id,
    });
  } catch (error) {
    await markAdCampaignEnqueueFailed({
      campaignId: campaign.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to bind Free Traction reservation.",
    });
    await releaseFreeTractionIfReserved({
      organizationId: input.organizationId,
      campaignId: campaign.id,
      reservationToken: reservation.reservationToken,
    });
    if (error instanceof FreeTractionGenerationError) {
      throw error;
    }
    throw error;
  }

  try {
    const { job } = await enqueueAdGenerationJob({
      organizationId: input.organizationId,
      campaignId: campaign.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { campaign, job };
  } catch (error) {
    await markAdCampaignEnqueueFailed({
      campaignId: campaign.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Ads generation job.",
    });
    await releaseFreeTractionIfReserved({
      organizationId: input.organizationId,
      campaignId: campaign.id,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}

export async function retryFreeTractionAdCampaign(input: {
  organizationId: string;
  userId: string | null;
  campaignId: string;
  alreadyReserved?: boolean;
}): Promise<{ campaign: AdCampaign; job: AthenaAdGenerationJob; created: boolean }> {
  if (input.alreadyReserved) {
    return enqueueGenerationForExistingCampaign({
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  }

  const reservation = await reserveFreeTraction(input.organizationId);
  if (reservation.campaignId && reservation.campaignId !== input.campaignId) {
    throw new FreeTractionGenerationError("FREE_TRACTION_RETRY_ONLY");
  }

  try {
    return await enqueueGenerationForExistingCampaign({
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  } catch (error) {
    await releaseFreeTractionIfReserved({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}
