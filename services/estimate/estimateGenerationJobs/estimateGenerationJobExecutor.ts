/**
 * Execute a claimed Athena Estimate generation job (V26 L5).
 *
 * Does NOT integrate into the worker claim loop yet.
 * Caller supplies a claimed job + claim token (tests / future worker wiring).
 *
 * Flow:
 * load Estimate → consistency checks → Ready short-circuit →
 * resolve Master → assertLicenseeOwnsSubAccount → load methodology →
 * pipeline (compose → OpenRouter → validate) → complete RPC
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAthenaEstimateByIdForLicensee,
  type AthenaEstimate,
} from "@/services/estimate/athenaEstimateService";
import type { AthenaEstimateGenerationStage } from "@/services/estimate/athenaEstimateTypes";
import {
  EstimateGenerationPipelineError,
  runEstimateGenerationPipeline,
  type EstimateGenerationPipelineDeps,
} from "@/services/estimate/estimateGenerationPipeline";
import {
  claimNextEstimateGenerationJob,
  completeEstimateGenerationJobWithClaim,
  failEstimateGenerationJobWithClaim,
  heartbeatEstimateGenerationJob,
} from "@/services/estimate/estimateGenerationJobs/estimateGenerationJobService";
import type { AthenaEstimateGenerationJob } from "@/services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import {
  ESTIMATE_INSTRUCTION_NOT_CONFIGURED,
  getActiveEstimatePricingMethodologyInstruction,
} from "@/services/estimate/estimatePricingMethodologyInstruction";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import {
  LicenseeAccessError,
  assertLicenseeOwnsSubAccount,
} from "@/services/licensee/licenseeIdentity";

export type ClaimedEstimateJobExecution = {
  job: AthenaEstimateGenerationJob;
  claimToken: string;
};

export type EstimateJobOps = {
  heartbeat: typeof heartbeatEstimateGenerationJob;
  complete: typeof completeEstimateGenerationJobWithClaim;
  fail: typeof failEstimateGenerationJobWithClaim;
};

export type EstimateExecutorDeps = {
  getEstimate?: typeof getAthenaEstimateByIdForLicensee;
  assertOwnsSubAccount?: typeof assertLicenseeOwnsSubAccount;
  getMethodology?: typeof getActiveEstimatePricingMethodologyInstruction;
  resolveMasterUserId?: (input: {
    estimate: AthenaEstimate;
    job: AthenaEstimateGenerationJob;
  }) => Promise<string>;
  pipelineDeps?: EstimateGenerationPipelineDeps;
  runPipeline?: typeof runEstimateGenerationPipeline;
  /** Test seam — defaults to Estimate job RPC wrappers. */
  jobOps?: EstimateJobOps;
};

async function defaultResolveMasterUserId(input: {
  estimate: AthenaEstimate;
  job: AthenaEstimateGenerationJob;
}): Promise<string> {
  const fromRecords =
    input.estimate.requested_by?.trim() || input.job.requested_by?.trim();
  if (fromRecords) return fromRecords;

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("user_id")
    .eq("id", input.estimate.licensee_account_id)
    .maybeSingle();

  if (error || !data?.user_id) {
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_JOB_MISMATCH",
      message: "Master user identity could not be resolved for Estimate job.",
      stage: "asserting_authorization",
      retryable: false,
    });
  }
  return String(data.user_id);
}

function classifyEstimateError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stage: AthenaEstimateGenerationStage | string;
} {
  if (error instanceof EstimateGenerationPipelineError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      stage: error.stage,
    };
  }

  if (error instanceof LicenseeAccessError) {
    // Preserve canonical Master deactivation code; do not invent a second model.
    const code =
      error.code === "ACCOUNT_DEACTIVATED"
        ? "ACCOUNT_DEACTIVATED"
        : "RELATIONSHIP_REMOVED";
    return {
      code,
      message: error.message,
      retryable: false,
      stage: "asserting_authorization",
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
    code: "ESTIMATE_GENERATION_FAILED",
    message: message.slice(0, 1000),
    retryable,
    stage: "failed",
  };
}

export async function executeClaimedEstimateGenerationJob(
  workerId: string,
  claimed: ClaimedEstimateJobExecution,
  options?: {
    shouldStop?: () => boolean;
    deps?: EstimateExecutorDeps;
  },
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  const { job, claimToken } = claimed;
  const workerConfig = getAthenaWorkerConfig();
  const deps = options?.deps ?? {};
  const getEstimate = deps.getEstimate ?? getAthenaEstimateByIdForLicensee;
  const assertOwns =
    deps.assertOwnsSubAccount ?? assertLicenseeOwnsSubAccount;
  const getMethodology =
    deps.getMethodology ?? getActiveEstimatePricingMethodologyInstruction;
  const resolveMasterUserId =
    deps.resolveMasterUserId ?? defaultResolveMasterUserId;
  const runPipeline = deps.runPipeline ?? runEstimateGenerationPipeline;
  const jobOps: EstimateJobOps = deps.jobOps ?? {
    heartbeat: heartbeatEstimateGenerationJob,
    complete: completeEstimateGenerationJobWithClaim,
    fail: failEstimateGenerationJobWithClaim,
  };

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let claimLost = false;
  let currentStage: AthenaEstimateGenerationStage | string =
    job.generation_stage ?? "asserting_authorization";

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const renewLease = async (stage?: string) => {
    const renewed = await jobOps.heartbeat({
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

  console.log("[ATHENA_ESTIMATE_JOBS] execute_started", {
    workerId,
    jobId: job.id,
    estimateId: job.estimate_id,
    organizationId: job.organization_id,
    attempt: job.attempt_count,
  });

  try {
    if (options?.shouldStop?.()) {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: "WORKER_STOPPING",
        errorMessage: "Worker shutting down before Estimate generation completed.",
        retryable: true,
        failedStage: currentStage,
      });
      return "retryable";
    }

    const estimate = await getEstimate(
      job.estimate_id,
      job.licensee_account_id,
    );
    if (!estimate) {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: "ESTIMATE_NOT_FOUND",
        errorMessage: "Estimate missing or licensee ownership mismatch.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    if (estimate.organization_id !== job.organization_id) {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: "ESTIMATE_JOB_MISMATCH",
        errorMessage: "Estimate organization_id does not match generation job.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    if (estimate.licensee_account_id !== job.licensee_account_id) {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: "ESTIMATE_JOB_MISMATCH",
        errorMessage:
          "Estimate licensee_account_id does not match generation job.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    // Ready Estimates are immutable — complete with existing package; never overwrite.
    if (estimate.status === "Ready" && estimate.package_json) {
      stopHeartbeat();
      await jobOps.complete({
        jobId: job.id,
        claimToken,
        packageJson: estimate.package_json as unknown as Record<
          string,
          unknown
        >,
      });
      return "completed";
    }

    if (estimate.status === "Ready") {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: "ESTIMATE_ALREADY_READY",
        errorMessage:
          "Ready Estimates cannot be regenerated in place. Create a new Estimate row.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    currentStage = "asserting_authorization";
    await renewLease(currentStage);
    const masterUserId = await resolveMasterUserId({ estimate, job });

    try {
      await assertOwns({
        masterUserId,
        organizationId: estimate.organization_id,
      });
    } catch (error) {
      if (error instanceof LicenseeAccessError) {
        throw error;
      }
      throw new EstimateGenerationPipelineError({
        code: "RELATIONSHIP_REMOVED",
        message:
          error instanceof Error
            ? error.message
            : "Master does not own this sub-account relationship.",
        stage: "asserting_authorization",
        retryable: false,
      });
    }

    currentStage = "loading_instruction";
    await renewLease(currentStage);
    const methodology = await getMethodology();
    if (!methodology.configured || !methodology.instructionText.trim()) {
      throw new EstimateGenerationPipelineError({
        code: ESTIMATE_INSTRUCTION_NOT_CONFIGURED,
        message:
          "Estimate pricing methodology is not configured by GetOblic Super Admin.",
        stage: "loading_instruction",
        retryable: false,
      });
    }

    const result = await runPipeline({
      organizationId: estimate.organization_id,
      request: estimate.request_json,
      methodology,
      onStage: async (stage) => {
        currentStage = stage;
        const renewed = await renewLease(stage);
        if (!renewed) {
          throw new EstimateGenerationPipelineError({
            code: "CLAIM_LOST",
            message: "Estimate generation claim was lost during processing.",
            stage,
            retryable: true,
          });
        }
      },
      deps: deps.pipelineDeps,
    });

    if (claimLost || options?.shouldStop?.()) {
      stopHeartbeat();
      await jobOps.fail({
        jobId: job.id,
        claimToken,
        errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
        errorMessage: claimLost
          ? "Estimate generation claim was lost."
          : "Worker shutting down before Estimate completion.",
        retryable: true,
        failedStage: currentStage,
      });
      return claimLost ? "claim_lost" : "retryable";
    }

    stopHeartbeat();
    const completed = await jobOps.complete({
      jobId: job.id,
      claimToken,
      packageJson: result.package as unknown as Record<string, unknown>,
    });

    if (!completed) {
      console.error("[ATHENA_ESTIMATE_JOBS] complete_claim_lost", {
        jobId: job.id,
        estimateId: job.estimate_id,
      });
      return "claim_lost";
    }

    console.log("[ATHENA_ESTIMATE_JOBS] execute_completed", {
      workerId,
      jobId: job.id,
      estimateId: job.estimate_id,
    });
    return "completed";
  } catch (error) {
    stopHeartbeat();
    const classified = classifyEstimateError(error);

    if (classified.code === "CLAIM_LOST" || claimLost) {
      return "claim_lost";
    }

    const failed = await jobOps.fail({
      jobId: job.id,
      claimToken,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.retryable,
      failedStage: classified.stage,
    });

    console.error("[ATHENA_ESTIMATE_JOBS] execute_failed", {
      workerId,
      jobId: job.id,
      estimateId: job.estimate_id,
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

/**
 * Claim + execute helper for athena-worker (V26 L6) and tests.
 * Worker imports this only — generation logic stays in the L5 executor.
 */
export async function claimAndExecuteNextEstimateGenerationJob(
  workerId: string,
  options?: {
    shouldStop?: () => boolean;
    deps?: EstimateExecutorDeps;
  },
): Promise<boolean> {
  const claimed = await claimNextEstimateGenerationJob({ workerId });
  if (!claimed) return false;

  await executeClaimedEstimateGenerationJob(workerId, claimed, options);
  return true;
}
