/**
 * Create / regenerate Ads campaigns with failure-safe job enqueue.
 */

import {
  createAdCampaign,
  getAdCampaignById,
  markAdCampaignEnqueueFailed,
  type AdCampaign,
} from "@/services/ads/adCampaignService";
import type { AdCampaignBrief } from "@/services/ads/adCampaignTypes";
import {
  ActiveAdGenerationJobConflictError,
  enqueueAdGenerationJob,
} from "@/services/ads/adsGenerationJobs/adGenerationJobService";
import type { AthenaAdGenerationJob } from "@/services/ads/adsGenerationJobs/adGenerationJobTypes";

export class ReadyAdCampaignImmutableError extends Error {
  readonly code = "READY_IMMUTABLE";
  constructor(message = "Ready ad campaigns cannot be overwritten. Use regenerate.") {
    super(message);
    this.name = "ReadyAdCampaignImmutableError";
  }
}

export class AdCampaignOrchestrationNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Ad campaign not found.") {
    super(message);
    this.name = "AdCampaignOrchestrationNotFoundError";
  }
}

export async function createAdCampaignWithJob(input: {
  organizationId: string;
  userId: string | null;
  brief?: AdCampaignBrief;
}): Promise<{ campaign: AdCampaign; job: AthenaAdGenerationJob }> {
  const campaign = await createAdCampaign({
    organizationId: input.organizationId,
    userId: input.userId,
    brief: input.brief,
  });

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
    throw error;
  }
}

export async function enqueueGenerationForExistingCampaign(input: {
  campaignId: string;
  organizationId: string;
  userId: string | null;
}): Promise<{ campaign: AdCampaign; job: AthenaAdGenerationJob; created: boolean }> {
  const campaign = await getAdCampaignById(
    input.campaignId,
    input.organizationId,
  );
  if (!campaign) {
    throw new AdCampaignOrchestrationNotFoundError();
  }

  if (campaign.status === "Ready") {
    throw new ReadyAdCampaignImmutableError();
  }

  try {
    const { job, created } = await enqueueAdGenerationJob({
      organizationId: input.organizationId,
      campaignId: campaign.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { campaign, job, created };
  } catch (error) {
    if (error instanceof ActiveAdGenerationJobConflictError) {
      throw error;
    }
    throw error;
  }
}

/**
 * Regenerate creates a NEW campaign row from the previous brief.
 * Ready campaigns are never silently overwritten.
 */
export async function regenerateAdCampaign(input: {
  sourceCampaignId: string;
  organizationId: string;
  userId: string | null;
}): Promise<{ campaign: AdCampaign; job: AthenaAdGenerationJob }> {
  const source = await getAdCampaignById(
    input.sourceCampaignId,
    input.organizationId,
  );
  if (!source) {
    throw new AdCampaignOrchestrationNotFoundError();
  }

  return createAdCampaignWithJob({
    organizationId: input.organizationId,
    userId: input.userId,
    brief: source.brief_json,
  });
}
