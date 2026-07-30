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
import {
  markPersonaGenerationAnalysisComplete,
  markPersonaGenerationFailed,
  preparePersonaBridgeBeforeGeneration,
} from "@/services/personas/personaImporter";
import { isThinkDifferentlyJobProgress } from "@/services/brain/generationContracts/executiveGenerationMode";
import { PERSONA_INTELLIGENCE_PLATFORM } from "@/services/personas/personaBridgeMarker";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";
import { processThinkDifferentlyWorkflow } from "@/services/workflows/thinkDifferentlyWorkflow";

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
      await renewLease("website_intelligence");
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
    } else if (discussion?.platform === PERSONA_INTELLIGENCE_PLATFORM) {
      await renewLease("persona_bridge");
      if (claimLost) {
        return "claim_lost";
      }
      await preparePersonaBridgeBeforeGeneration(
        job.discussion_id,
        job.organization_id,
      );
      await renewLease("discussion_analysis");
      if (claimLost) {
        return "claim_lost";
      }
    }

    const thinkDifferently = isThinkDifferentlyJobProgress(job.progress);

    const result = thinkDifferently
      ? await processThinkDifferentlyWorkflow({
          discussionId: job.discussion_id,
          organizationId: job.organization_id,
          regenerationRunId:
            job.regeneration_run_id ?? createRegenerationRunId(),
          generationJobId: job.id,
        })
      : await processDiscussionEndToEnd(
          job.discussion_id,
          job.organization_id,
          {
            regenerationRunId:
              job.regeneration_run_id ?? createRegenerationRunId(),
            explicitRegeneration:
              job.trigger_type === "manual_refresh" ||
              job.trigger_type === "prospect_deep_scrape",
          },
        );

    if (claimLost || options?.shouldStop?.()) {
      return "claim_lost";
    }

    if (!result.success) {
      const divergenceTerminal =
        result.status === "deployment_assets_insufficient_divergence";
      const classified = classifyGenerationError(
        divergenceTerminal
          ? "deployment_assets_insufficient_divergence: Think Differently Deployment Assets were not materially distinct from the prior package."
          : result.error,
      );
      const failed = await failGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: divergenceTerminal
          ? "DEPLOYMENT_ASSETS_INSUFFICIENT_DIVERGENCE"
          : classified.code,
        errorMessage: classified.message,
        // Divergence already exhausted in-workflow retries — never publish via job retry.
        retryable: divergenceTerminal
          ? false
          : classified.classification === "retryable",
        attemptCount: job.attempt_count,
        failedStage: thinkDifferently
          ? divergenceTerminal
            ? "deployment_assets"
            : "strategic_blueprint"
          : job.current_stage,
        errorMetadata: {
          status: result.status ?? null,
          partial: "partial" in result ? Boolean(result.partial) : false,
          pipeline: thinkDifferently
            ? "strategic_blueprint_and_deployment_assets"
            : "full",
          published: false,
        },
      });

      console.log("[ATHENA_WORKER] job_retry_scheduled_or_failed", {
        workerId,
        jobId: job.id,
        status: failed?.status ?? null,
        errorCode: classified.code,
      });

      // On terminal failure, promote coalesced follow-up so newer intent is not lost.
      if (failed?.status === "failed") {
        await markProspectGenerationFailed(
          job.discussion_id,
          job.organization_id,
        );
        await markPersonaGenerationFailed(
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

    const discussionForPlatform = discussion;
    const isProspect =
      discussionForPlatform?.platform === PROSPECT_INTELLIGENCE_PLATFORM;
    const isPersona =
      discussionForPlatform?.platform === PERSONA_INTELLIGENCE_PLATFORM;

    // After a successful pipeline run, prefer the version tied to this regeneration run.
    let published = null as Awaited<
      ReturnType<typeof resolvePublishedVersionForJob>
    >;

    if (result.publishedVersionId) {
      const { getExecutiveVersionById } = await import(
        "@/services/executiveVersions/executiveVersionService"
      );
      published = await getExecutiveVersionById(
        result.publishedVersionId,
        job.discussion_id,
        job.organization_id,
      );
    }

    if (!published) {
      published = await resolvePublishedVersionForJob({
        discussionId: job.discussion_id,
        organizationId: job.organization_id,
        regenerationRunId: job.regeneration_run_id,
        publishedVersionId: null,
        executiveVersionId: null,
      });
    }

    if (!published) {
      const { getCurrentExecutiveVersion } = await import(
        "@/services/executiveVersions/executiveVersionService"
      );
      published = await getCurrentExecutiveVersion(
        job.discussion_id,
        job.organization_id,
      );
    }

    // Prospect publication completeness only — never applied to Persona bridges.
    if (isProspect && !published?.id) {
      const failed = await failGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "PUBLICATION_INCOMPLETE",
        errorMessage:
          "Prospect generation did not publish a complete Current Version.",
        retryable: true,
        attemptCount: job.attempt_count,
        failedStage: "executive_version",
      });
      if (failed?.status === "failed") {
        await markProspectGenerationFailed(
          job.discussion_id,
          job.organization_id,
        );
        await maybeEnqueueFollowUp(job);
      }
      return failed?.status === "retryable" ? "retryable" : "failed";
    }

    // Stage 3 Persona: shared analysis completion is sufficient (no Prospect Ready gate).
    if (isPersona && !result.analysisId) {
      const failed = await failGenerationJobWithClaim({
        jobId: job.id,
        claimToken,
        errorCode: "ANALYSIS_INCOMPLETE",
        errorMessage: "Persona generation did not produce shared analysis.",
        retryable: true,
        attemptCount: job.attempt_count,
        failedStage: "discussion_analysis",
      });
      if (failed?.status === "failed") {
        await markPersonaGenerationFailed(
          job.discussion_id,
          job.organization_id,
        );
        await maybeEnqueueFollowUp(job);
      }
      return failed?.status === "retryable" ? "retryable" : "failed";
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

    if (isPersona) {
      await markPersonaGenerationAnalysisComplete(
        job.discussion_id,
        job.organization_id,
        opportunityScore,
      );
    } else {
      await markProspectGenerationReady(
        job.discussion_id,
        job.organization_id,
        opportunityScore,
      );
    }

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
      await markPersonaGenerationFailed(
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

  if (!pending.pending) {
    return;
  }

  // Parent should be terminal. If it is somehow still active, restore the
  // durable marker so Refresh/Append/Think Differently intent is not lost.
  const fresh = await getGenerationJobById(job.id, job.organization_id);
  if (fresh && isActiveGenerationJobStatus(fresh.status)) {
    await markDiscussionPendingGenerationFollowUp(
      job.discussion_id,
      job.organization_id,
      pending.progress,
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
      progress: pending.progress ?? {},
    });

    console.log("[ATHENA_WORKER] follow_up_queued", {
      parentJobId: job.id,
      followUpJobId: followUp.id,
      discussionId: job.discussion_id,
      thinkDifferently: isThinkDifferentlyJobProgress(pending.progress),
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
      pending.progress,
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
