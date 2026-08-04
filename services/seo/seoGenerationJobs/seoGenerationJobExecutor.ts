/**
 * Claim and execute organization-level SEO generation jobs.
 * Independent of Discussion generation, Ads, and Deep Scrape executors.
 */

import { getSeoReportById } from "@/services/seo/seoReportService";
import {
  claimNextSeoGenerationJob,
  completeSeoGenerationJobWithClaim,
  failSeoGenerationJobWithClaim,
  heartbeatSeoGenerationJob,
} from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
import type { AthenaSeoGenerationJob } from "@/services/seo/seoGenerationJobs/seoGenerationJobTypes";
import {
  SeoGenerationPipelineError,
  runSeoGenerationPipeline,
} from "@/services/seo/seoGenerationPipeline";
import type { SeoReportGenerationStage } from "@/services/seo/seoReportTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export type ClaimedSeoJobExecution = {
  job: AthenaSeoGenerationJob;
  claimToken: string;
};

function classifySeoError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stage: SeoReportGenerationStage;
} {
  if (error instanceof SeoGenerationPipelineError) {
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
    code: "SEO_GENERATION_FAILED",
    message: message.slice(0, 1000),
    retryable,
    stage: "failed",
  };
}

export async function executeClaimedSeoGenerationJob(
  workerId: string,
  claimed: ClaimedSeoJobExecution,
  options?: { shouldStop?: () => boolean },
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  const { job, claimToken } = claimed;
  const workerConfig = getAthenaWorkerConfig();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let claimLost = false;
  let currentStage: SeoReportGenerationStage | string =
    job.generation_stage ?? "assembling_context";

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const renewLease = async (stage?: string) => {
    const renewed = await heartbeatSeoGenerationJob({
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

  console.log("[ATHENA_SEO_JOBS] execute_started", {
    workerId,
    jobId: job.id,
    reportId: job.report_id,
    organizationId: job.organization_id,
    attempt: job.attempt_count,
  });

  try {
    if (options?.shouldStop?.()) {
      stopHeartbeat();
      await failSeoGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "WORKER_STOPPING",
        errorMessage: "Worker shutting down before SEO generation completed.",
        retryable: true,
        failedStage: currentStage,
      });
      return "retryable";
    }

    const report = await getSeoReportById(job.report_id, job.organization_id);
    if (!report) {
      stopHeartbeat();
      await failSeoGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "REPORT_NOT_FOUND",
        errorMessage: "SEO report missing or organization mismatch.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    // Ready reports are immutable — do not overwrite package_json.
    if (report.status === "Ready" && report.package_json) {
      stopHeartbeat();
      await completeSeoGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        packageJson: report.package_json as unknown as Record<string, unknown>,
      });
      return "completed";
    }

    const result = await runSeoGenerationPipeline({
      organizationId: job.organization_id,
      brief: report.brief_json,
      onStage: async (stage) => {
        currentStage = stage;
        const renewed = await renewLease(stage);
        if (!renewed) {
          throw new SeoGenerationPipelineError({
            code: "CLAIM_LOST",
            message: "SEO generation claim was lost during processing.",
            stage,
            retryable: true,
          });
        }
      },
    });

    if (claimLost || options?.shouldStop?.()) {
      stopHeartbeat();
      await failSeoGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
        errorMessage: claimLost
          ? "SEO generation claim was lost."
          : "Worker shutting down before SEO completion.",
        retryable: true,
        failedStage: currentStage,
      });
      return claimLost ? "claim_lost" : "retryable";
    }

    stopHeartbeat();
    const completed = await completeSeoGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      packageJson: result.package as unknown as Record<string, unknown>,
    });

    if (!completed) {
      console.error("[ATHENA_SEO_JOBS] complete_claim_lost", {
        jobId: job.id,
        reportId: job.report_id,
      });
      return "claim_lost";
    }

    console.log("[ATHENA_SEO_JOBS] execute_completed", {
      workerId,
      jobId: job.id,
      reportId: job.report_id,
    });
    return "completed";
  } catch (error) {
    stopHeartbeat();
    const classified = classifySeoError(error);

    if (classified.code === "CLAIM_LOST" || claimLost) {
      return "claim_lost";
    }

    const failed = await failSeoGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.retryable,
      failedStage: classified.stage,
    });

    console.error("[ATHENA_SEO_JOBS] execute_failed", {
      workerId,
      jobId: job.id,
      reportId: job.report_id,
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

export async function claimAndExecuteNextSeoGenerationJob(
  workerId: string,
  options?: { shouldStop?: () => boolean },
): Promise<boolean> {
  const claimed = await claimNextSeoGenerationJob({ workerId });
  if (!claimed) return false;

  await executeClaimedSeoGenerationJob(workerId, claimed, options);
  return true;
}
