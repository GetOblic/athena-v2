/**
 * Claim and execute organization-level Ads generation jobs.
 * Independent of Discussion generation and Deep Scrape executors.
 */

import { getAdCampaignById } from "@/services/ads/adCampaignService";
import {
  claimNextAdGenerationJob,
  completeAdGenerationJobWithClaim,
  failAdGenerationJobWithClaim,
  heartbeatAdGenerationJob,
} from "@/services/ads/adsGenerationJobs/adGenerationJobService";
import type { AthenaAdGenerationJob } from "@/services/ads/adsGenerationJobs/adGenerationJobTypes";
import {
  AdsGenerationPipelineError,
  runAdsGenerationPipeline,
} from "@/services/ads/adsGenerationPipeline";
import type { AdCampaignGenerationStage } from "@/services/ads/adCampaignTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export type ClaimedAdJobExecution = {
  job: AthenaAdGenerationJob;
  claimToken: string;
};

function classifyAdsError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stage: AdCampaignGenerationStage;
} {
  if (error instanceof AdsGenerationPipelineError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      stage: error.stage,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const retryable =
    lower.includes("timeout") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed");

  return {
    code: "ADS_GENERATION_FAILED",
    message: message.slice(0, 1000),
    retryable,
    stage: "failed",
  };
}

export async function executeClaimedAdGenerationJob(
  workerId: string,
  claimed: ClaimedAdJobExecution,
  options?: { shouldStop?: () => boolean },
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  const { job, claimToken } = claimed;
  const workerConfig = getAthenaWorkerConfig();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let claimLost = false;
  let currentStage: AdCampaignGenerationStage | string =
    job.generation_stage ?? "assembling_context";

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const renewLease = async (stage?: string) => {
    const renewed = await heartbeatAdGenerationJob({
      jobId: job.id,
      claimToken,
      leaseSeconds: workerConfig.leaseSeconds,
      stage: stage ?? null,
    });
    if (!renewed) {
      claimLost = true;
    }
    return renewed;
  };

  heartbeatTimer = setInterval(() => {
    void renewLease(currentStage);
  }, workerConfig.heartbeatIntervalMs);

  console.log("[ATHENA_ADS_JOBS] execute_started", {
    workerId,
    jobId: job.id,
    campaignId: job.campaign_id,
    organizationId: job.organization_id,
    attempt: job.attempt_count,
  });

  try {
    if (options?.shouldStop?.()) {
      stopHeartbeat();
      await failAdGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "WORKER_STOPPING",
        errorMessage: "Worker shutting down before Ads generation completed.",
        retryable: true,
        failedStage: currentStage,
      });
      return "retryable";
    }

    const campaign = await getAdCampaignById(
      job.campaign_id,
      job.organization_id,
    );
    if (!campaign) {
      stopHeartbeat();
      await failAdGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "CAMPAIGN_NOT_FOUND",
        errorMessage: "Ad campaign missing or organization mismatch.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    // Ready campaigns are immutable — do not overwrite package_json.
    if (campaign.status === "Ready" && campaign.package_json) {
      stopHeartbeat();
      await completeAdGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        packageJson: campaign.package_json as unknown as Record<string, unknown>,
      });
      return "completed";
    }

    const result = await runAdsGenerationPipeline({
      organizationId: job.organization_id,
      brief: campaign.brief_json,
      onStage: async (stage) => {
        currentStage = stage;
        const renewed = await renewLease(stage);
        if (!renewed) {
          throw new AdsGenerationPipelineError({
            code: "CLAIM_LOST",
            message: "Ads generation claim was lost during processing.",
            stage,
            retryable: true,
          });
        }
      },
    });

    if (claimLost || options?.shouldStop?.()) {
      stopHeartbeat();
      await failAdGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
        errorMessage: claimLost
          ? "Ads generation claim was lost."
          : "Worker shutting down before Ads completion.",
        retryable: true,
        failedStage: currentStage,
      });
      return claimLost ? "claim_lost" : "retryable";
    }

    stopHeartbeat();
    const completed = await completeAdGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      packageJson: result.package as unknown as Record<string, unknown>,
    });

    if (!completed) {
      console.error("[ATHENA_ADS_JOBS] complete_claim_lost", {
        jobId: job.id,
        campaignId: job.campaign_id,
      });
      return "claim_lost";
    }

    console.log("[ATHENA_ADS_JOBS] execute_completed", {
      workerId,
      jobId: job.id,
      campaignId: job.campaign_id,
    });
    return "completed";
  } catch (error) {
    stopHeartbeat();
    const classified = classifyAdsError(error);

    if (classified.code === "CLAIM_LOST" || claimLost) {
      return "claim_lost";
    }

    const failed = await failAdGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.retryable,
      failedStage: classified.stage,
    });

    console.error("[ATHENA_ADS_JOBS] execute_failed", {
      workerId,
      jobId: job.id,
      campaignId: job.campaign_id,
      code: classified.code,
      retryable: classified.retryable,
      status: failed?.status ?? null,
    });

    if (failed?.status === "retryable") return "retryable";
    return "failed";
  } finally {
    stopHeartbeat();
  }
}

export async function claimAndExecuteNextAdGenerationJob(
  workerId: string,
  options?: { shouldStop?: () => boolean },
): Promise<boolean> {
  const claimed = await claimNextAdGenerationJob({ workerId });
  if (!claimed) return false;

  await executeClaimedAdGenerationJob(workerId, claimed, options);
  return true;
}
