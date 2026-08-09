/**
 * Execute a claimed Athena Estimate generation job (V26 L5 / V27 L15).
 *
 * Does NOT integrate into the worker claim loop yet.
 * Caller supplies a claimed job + claim token (tests / future worker wiring).
 *
 * Flow:
 * load Estimate → consistency checks → Ready short-circuit →
 * resolve Master → assertLicenseeOwnsSubAccount → load methodology →
 * (L15) Prospect target re-fetch + bounded composition when targeted →
 * pipeline (compose org context → OpenRouter → validate) →
 * complete RPC (package + optional frozen Prospect generation context)
 *
 * Org-only (prospect_id null AND prospect_business_name_snapshot null):
 * V26 path unchanged; prospect_generation_context_json stays null.
 *
 * Prospect-targeted: re-fetch with estimate.organization_id, compose bounded
 * Prospect Commercial Target Intelligence, inject into the same generation
 * prompt, freeze exact composedText atomically with package_json.
 *
 * Removed Prospect (prospect_id null AND snapshot non-null): fail closed —
 * never silently degrade to org-only generation.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAthenaEstimateByIdForLicenseeIncludingHidden,
  type AthenaEstimate,
} from "@/services/estimate/athenaEstimateService";
import { validateEstimateProspectGenerationContext } from "@/services/estimate/athenaEstimateProspectContext";
import { isRemovedAthenaEstimateProspectTarget } from "@/services/estimate/athenaEstimateProspectTarget";
import type { AthenaEstimateGenerationStage } from "@/services/estimate/athenaEstimateTypes";
import type { EstimateProspectGenerationContextV1 } from "@/services/estimate/athenaEstimateTypes";
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
  composeEstimateProspectGenerationContext,
  EstimateProspectContextCompositionError,
  type ComposeEstimateProspectContextDeps,
} from "@/services/estimate/estimateProspectContextComposer";
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
  /** Defaults to including soft-hidden rows so hide does not abort in-flight jobs. */
  getEstimate?: typeof getAthenaEstimateByIdForLicenseeIncludingHidden;
  assertOwnsSubAccount?: typeof assertLicenseeOwnsSubAccount;
  getMethodology?: typeof getActiveEstimatePricingMethodologyInstruction;
  resolveMasterUserId?: (input: {
    estimate: AthenaEstimate;
    job: AthenaEstimateGenerationJob;
  }) => Promise<string>;
  pipelineDeps?: EstimateGenerationPipelineDeps;
  runPipeline?: typeof runEstimateGenerationPipeline;
  /** L15 Prospect composition seams. */
  composeProspectContext?: typeof composeEstimateProspectGenerationContext;
  prospectContextDeps?: ComposeEstimateProspectContextDeps;
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
  if (error instanceof EstimateProspectContextCompositionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      stage: "assembling_context",
    };
  }

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

/**
 * Resolve Prospect generation freeze for a loaded Estimate.
 * Org-only → null. Removed target → fail closed. Targeted → compose + validate.
 */
async function resolveProspectGenerationFreeze(
  estimate: AthenaEstimate,
  deps: EstimateExecutorDeps,
): Promise<{
  prospectCommercialTargetIntelligence: string | null;
  frozenContext: EstimateProspectGenerationContextV1 | null;
}> {
  const prospectId =
    typeof estimate.prospect_id === "string" && estimate.prospect_id.trim()
      ? estimate.prospect_id.trim()
      : null;
  const snapshot =
    typeof estimate.prospect_business_name_snapshot === "string" &&
    estimate.prospect_business_name_snapshot.trim()
      ? estimate.prospect_business_name_snapshot.trim()
      : null;

  if (
    isRemovedAthenaEstimateProspectTarget({
      prospectId,
      prospectBusinessNameSnapshot: snapshot,
    })
  ) {
    throw new EstimateProspectContextCompositionError(
      "Prospect target was removed before Estimate generation.",
    );
  }

  if (!prospectId) {
    // Org-only: both null. Do not fetch Prospect; do not emit Prospect block.
    return {
      prospectCommercialTargetIntelligence: null,
      frozenContext: null,
    };
  }

  const compose =
    deps.composeProspectContext ?? composeEstimateProspectGenerationContext;
  const composed = await compose({
    prospectId,
    organizationId: estimate.organization_id,
    deps: deps.prospectContextDeps,
  });

  // Validate again before completion RPC (L13 audit: RPC accepts JSONB).
  const frozenContext = validateEstimateProspectGenerationContext(
    composed.frozenContext,
  );

  // Snapshot column is creation-time identity — never rewrite here.
  // frozenContext.businessName is live generation-time Prospect name.
  return {
    prospectCommercialTargetIntelligence: composed.composedText,
    frozenContext,
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
  const getEstimate =
    deps.getEstimate ?? getAthenaEstimateByIdForLicenseeIncludingHidden;
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
        // Preserve existing Ready freeze; RPC Ready immutability also protects it.
        prospectGenerationContextJson:
          (estimate.prospect_generation_context_json as unknown as Record<
            string,
            unknown
          > | null) ?? null,
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

    currentStage = "assembling_context";
    await renewLease(currentStage);
    const prospectFreeze = await resolveProspectGenerationFreeze(estimate, deps);

    const result = await runPipeline({
      organizationId: estimate.organization_id,
      request: estimate.request_json,
      methodology,
      prospectCommercialTargetIntelligence:
        prospectFreeze.prospectCommercialTargetIntelligence,
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

    // Freeze must equal the Prospect block supplied to generation (no recompute).
    let prospectGenerationContextJson: Record<string, unknown> | null = null;
    if (prospectFreeze.frozenContext) {
      const validated = validateEstimateProspectGenerationContext(
        prospectFreeze.frozenContext,
      );
      if (
        validated.composedText !==
        prospectFreeze.prospectCommercialTargetIntelligence
      ) {
        throw new EstimateGenerationPipelineError({
          code: "ESTIMATE_PROSPECT_CONTEXT_MISMATCH",
          message:
            "Frozen Prospect generation context does not match the generation prompt block.",
          stage: "validating",
          retryable: false,
        });
      }
      prospectGenerationContextJson = validated as unknown as Record<
        string,
        unknown
      >;
    }

    stopHeartbeat();
    const completed = await jobOps.complete({
      jobId: job.id,
      claimToken,
      packageJson: result.package as unknown as Record<string, unknown>,
      prospectGenerationContextJson,
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
      prospectTargeted: Boolean(prospectGenerationContextJson),
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
