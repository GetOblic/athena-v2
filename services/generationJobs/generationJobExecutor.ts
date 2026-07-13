import {
  describeClaimRpcDataShape,
  isExecutableClaimedJob,
} from "@/services/generationJobs/generationJobClaimResult";
import {
  claimNextGenerationJob,
  completeGenerationJobWithClaim,
  consumeDiscussionPendingGenerationFollowUp,
  createGenerationJob,
  failGenerationJobWithClaim,
  getGenerationJobById,
  heartbeatGenerationJob,
  isActiveGenerationJobStatus,
  markDiscussionPendingGenerationFollowUp,
} from "@/services/generationJobs/generationJobService";
import { classifyGenerationError } from "@/services/generationJobs/generationJobErrors";
import { resolvePublishedVersionForJob } from "@/services/generationJobs/generationJobVersionIdempotency";
import {
  type AthenaGenerationJob,
} from "@/services/generationJobs/generationJobTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import { createWorkerIdentity } from "@/services/generationJobs/generationJobWorkerIdentity";
import { createRegenerationRunId } from "@/lib/regenerationDiagnostics";
import { getDiscussionById } from "@/services/discussionService";
import {
  markProspectGenerationFailed,
  markProspectGenerationReady,
  prepareProspectBridgeBeforeGeneration,
} from "@/services/prospects/prospectImporter";
import { getProspectByLinkedDiscussionId, PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";
import { resolveProspectWebsiteLearningDecision } from "@/services/prospects/prospectWebsiteLearningPolicy";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

export { createWorkerIdentity };

export type ClaimedJobExecution = {
  job: AthenaGenerationJob;
  claimToken: string;
};

/**
 * Validate tenant relationships before running the pipeline.
 */
export async function validateJobTenantIntegrity(
  job: AthenaGenerationJob,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const discussion = await getDiscussionById(
    job.discussion_id,
    job.organization_id,
  );

  if (!discussion) {
    return {
      ok: false,
      code: "DISCUSSION_NOT_FOUND",
      message: "Discussion missing or organization mismatch.",
    };
  }

  if (
    discussion.organization_id &&
    discussion.organization_id !== job.organization_id
  ) {
    return {
      ok: false,
      code: "ORGANIZATION_MISMATCH",
      message: "Discussion organization does not match job organization.",
    };
  }

  return { ok: true };
}

export async function executeClaimedGenerationJob(
  workerId: string,
  claimed: ClaimedJobExecution,
  options?: { shouldStop?: () => boolean },
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  const { job, claimToken } = claimed;
  const startedMs = Date.now();
  const workerConfig = getAthenaWorkerConfig();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let claimLost = false;

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const renewLease = async (stage?: string) => {
    const renewed = await heartbeatGenerationJob({
      jobId: job.id,
      claimToken,
      leaseSeconds: workerConfig.leaseSeconds,
      stage: stage ?? job.current_stage,
    });

    if (!renewed) {
      claimLost = true;
      console.error("[ATHENA_WORKER] job_claim_lost", {
        workerId,
        jobId: job.id,
        discussionId: job.discussion_id,
        organizationId: job.organization_id,
      });
      stopHeartbeat();
    }

    return renewed;
  };

  heartbeatTimer = setInterval(() => {
    void renewLease();
  }, workerConfig.heartbeatIntervalMs);

  try {
    console.log("[ATHENA_WORKER] job_started", {
      workerId,
      jobId: job.id,
      discussionId: job.discussion_id,
      organizationId: job.organization_id,
      triggerType: job.trigger_type,
      attemptCount: job.attempt_count,
    });

    const integrity = await validateJobTenantIntegrity(job);
    if (!integrity.ok) {
      await failGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: integrity.code,
        errorMessage: integrity.message,
        retryable: false,
        attemptCount: job.attempt_count,
        failedStage: "preparing",
      });
      // Preserve coalesced Refresh/Append intent after terminal failure.
      await maybeEnqueueFollowUp(job);
      return "failed";
    }

    // Idempotent completion if this job already published its version.
    const alreadyPublished = await resolvePublishedVersionForJob({
      discussionId: job.discussion_id,
      organizationId: job.organization_id,
      regenerationRunId: job.regeneration_run_id,
      publishedVersionId: job.published_version_id,
      executiveVersionId: job.executive_version_id,
    });

    if (
      alreadyPublished &&
      (job.published_version_id ||
        job.executive_version_id ||
        (job.regeneration_run_id &&
          alreadyPublished.regeneration_run_id === job.regeneration_run_id))
    ) {
      const completed = await completeGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        analysisId: job.analysis_id,
        opportunityId: job.opportunity_id,
        reviewId: job.review_id,
        blueprintId: job.blueprint_id,
        executiveVersionId: alreadyPublished.id,
        publishedVersionId: alreadyPublished.id,
      });

      if (!completed) {
        return "claim_lost";
      }

      await maybeEnqueueFollowUp(job);
      console.log("[ATHENA_WORKER] job_completed", {
        workerId,
        jobId: job.id,
        durationMs: Date.now() - startedMs,
        publishedVersionId: alreadyPublished.id,
        idempotent: true,
      });
      return "completed";
    }

    if (options?.shouldStop?.()) {
      // Leave lease to expire — do not falsely fail/complete.
      return "claim_lost";
    }

    await renewLease("discussion_analysis");
    if (claimLost) {
      return "claim_lost";
    }

    const discussion = await getDiscussionById(
      job.discussion_id,
      job.organization_id,
    );
    if (discussion?.platform === PROSPECT_INTELLIGENCE_PLATFORM) {
      const prospect = await getProspectByLinkedDiscussionId(
        job.discussion_id,
        job.organization_id,
      );
      const websiteDecision = resolveProspectWebsiteLearningDecision({
        triggerType: job.trigger_type,
        hasWebsite: Boolean(prospect?.website),
        websiteIntelligence:
          (prospect?.website_intelligence as Record<string, unknown> | null) ??
          null,
      });
      await renewLease(
        websiteDecision.shouldCrawl ? "website_intelligence" : "preparing",
      );
      if (claimLost) {
        return "claim_lost";
      }
      await prepareProspectBridgeBeforeGeneration(
        job.discussion_id,
        job.organization_id,
        { triggerType: job.trigger_type },
      );
      await renewLease("discussion_analysis");
      if (claimLost) {
        return "claim_lost";
      }
    }

    const result = await processDiscussionEndToEnd(
      job.discussion_id,
      job.organization_id,
      {
        regenerationRunId:
          job.regeneration_run_id ?? createRegenerationRunId(),
        explicitRegeneration: job.trigger_type === "manual_refresh",
      },
    );

    if (claimLost || options?.shouldStop?.()) {
      return "claim_lost";
    }

    const treatPartialAsFailure =
      discussion?.platform === PROSPECT_INTELLIGENCE_PLATFORM;

    if (!result.success || (treatPartialAsFailure && result.partial)) {
      const classified = classifyGenerationError(
        result.error ??
          result.warning ??
          "Prospect generation completed only partially.",
      );
      const failed = await failGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: classified.code,
        errorMessage: classified.message,
        retryable:
          !(treatPartialAsFailure && result.partial) &&
          classified.classification === "retryable",
        attemptCount: job.attempt_count,
        failedStage: job.current_stage,
        errorMetadata: {
          status: result.status ?? null,
          partial: result.partial ?? false,
        },
      });

      console.log("[ATHENA_WORKER] job_retry_scheduled_or_failed", {
        workerId,
        jobId: job.id,
        status: failed?.status ?? null,
        errorCode: classified.code,
        partial: result.partial ?? false,
      });

      // On terminal failure, promote coalesced follow-up so newer intent is not lost.
      if (failed?.status === "failed") {
        await markProspectGenerationFailed(
          job.discussion_id,
          job.organization_id,
        );
        await maybeEnqueueFollowUp(job);
      }

      return failed?.status === "retryable" ? "retryable" : "failed";
    }

    await renewLease("executive_version");
    if (claimLost) {
      return "claim_lost";
    }

    // After a successful pipeline run, prefer the version tied to this regeneration run.
    let published = await resolvePublishedVersionForJob({
      discussionId: job.discussion_id,
      organizationId: job.organization_id,
      regenerationRunId: job.regeneration_run_id,
      publishedVersionId: null,
      executiveVersionId: null,
    });

    if (!published) {
      const { getCurrentExecutiveVersion } = await import(
        "@/services/executiveVersions/executiveVersionService"
      );
      published = await getCurrentExecutiveVersion(
        job.discussion_id,
        job.organization_id,
      );
    }

    const completed = await completeGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      analysisId: result.analysisId ?? null,
      opportunityId: result.opportunityId ?? null,
      reviewId: result.reviewId ?? null,
      blueprintId: result.blueprintId ?? null,
      executiveVersionId: published?.id ?? null,
      publishedVersionId: published?.id ?? null,
    });

    if (!completed) {
      return "claim_lost";
    }

    let opportunityScore: number | null = null;
    if (result.opportunityId) {
      const { getOpportunityById } = await import(
        "@/services/opportunityService"
      );
      const opportunity = await getOpportunityById(
        result.opportunityId,
        job.organization_id,
      );
      if (typeof opportunity?.score === "number") {
        opportunityScore = opportunity.score;
      }
    }

    await markProspectGenerationReady(
      job.discussion_id,
      job.organization_id,
      opportunityScore,
    );

    await maybeEnqueueFollowUp(job);

    console.log("[ATHENA_WORKER] job_completed", {
      workerId,
      jobId: job.id,
      discussionId: job.discussion_id,
      organizationId: job.organization_id,
      triggerType: job.trigger_type,
      attemptCount: job.attempt_count,
      durationMs: Date.now() - startedMs,
      publishedVersionId: published?.id ?? null,
    });

    return "completed";
  } catch (error) {
    if (claimLost) {
      return "claim_lost";
    }

    const classified = classifyGenerationError(error);
    const failed = await failGenerationJobWithClaim({
      jobId: job.id,
      claimToken,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.classification === "retryable",
      attemptCount: job.attempt_count,
      failedStage: job.current_stage,
    });

    console.log("[ATHENA_WORKER] job_failed", {
      workerId,
      jobId: job.id,
      errorCode: classified.code,
      status: failed?.status ?? null,
    });

    if (failed?.status === "failed") {
      await markProspectGenerationFailed(
        job.discussion_id,
        job.organization_id,
      );
      await maybeEnqueueFollowUp(job);
    }

    return failed?.status === "retryable" ? "retryable" : "failed";
  } finally {
    stopHeartbeat();
  }
}

async function maybeEnqueueFollowUp(job: AthenaGenerationJob): Promise<void> {
  const pending = await consumeDiscussionPendingGenerationFollowUp(
    job.discussion_id,
    job.organization_id,
  );

  if (!pending) {
    return;
  }

  // Parent should be terminal. If it is somehow still active, restore the
  // durable marker so Refresh/Append intent is not lost.
  const fresh = await getGenerationJobById(job.id, job.organization_id);
  if (fresh && isActiveGenerationJobStatus(fresh.status)) {
    await markDiscussionPendingGenerationFollowUp(
      job.discussion_id,
      job.organization_id,
    );
    return;
  }

  try {
    const followUp = await createGenerationJob({
      organizationId: job.organization_id,
      discussionId: job.discussion_id,
      triggerType: "discussion_update",
      requestedBy: job.requested_by,
      regenerationRunId: createRegenerationRunId(),
    });

    console.log("[ATHENA_WORKER] follow_up_queued", {
      parentJobId: job.id,
      followUpJobId: followUp.id,
      discussionId: job.discussion_id,
    });
  } catch (error) {
    // If unique active constraint races, restore the follow-up marker.
    console.error("[ATHENA_WORKER] follow_up_enqueue_failed", {
      parentJobId: job.id,
      discussionId: job.discussion_id,
      error: error instanceof Error ? error.message : String(error),
    });
    await markDiscussionPendingGenerationFollowUp(
      job.discussion_id,
      job.organization_id,
    );
  }
}

export async function claimAndExecuteNextJob(
  workerId: string,
  options?: {
    shouldStop?: () => boolean;
    /** Test seam — defaults to claimNextGenerationJob. */
    claimFn?: typeof claimNextGenerationJob;
    /** Test seam — defaults to executeClaimedGenerationJob. */
    executeFn?: typeof executeClaimedGenerationJob;
  },
): Promise<boolean> {
  const workerConfig = getAthenaWorkerConfig();
  const claimFn = options?.claimFn ?? claimNextGenerationJob;
  const executeFn = options?.executeFn ?? executeClaimedGenerationJob;
  const claimed = await claimFn({
    workerId,
    leaseSeconds: workerConfig.leaseSeconds,
  });

  // Empty queue (including PostgREST null-composite) → quiet poll.
  if (!claimed) {
    return false;
  }

  // Capture diagnostics before the type guard narrows the failure branch to never.
  const claimShape = describeClaimRpcDataShape(claimed.job);
  const claimHasId = Boolean(claimed.job?.id);

  // Defence in depth: never log or execute malformed claims.
  if (!isExecutableClaimedJob(claimed)) {
    console.error("[ATHENA_WORKER] invalid_claim_result", {
      workerId,
      shape: claimShape,
      hasId: claimHasId,
      reason: "failed_claim_validation",
    });
    return false;
  }

  console.log("[ATHENA_WORKER] job_claimed", {
    workerId,
    jobId: claimed.job.id,
    discussionId: claimed.job.discussion_id,
    organizationId: claimed.job.organization_id,
    triggerType: claimed.job.trigger_type,
    attemptCount: claimed.job.attempt_count,
  });

  await executeFn(workerId, claimed, options);
  return true;
}
