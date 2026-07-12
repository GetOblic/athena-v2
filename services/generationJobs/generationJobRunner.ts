import { after } from "next/server";
import {
  clearDiscussionRegenerationInFlight,
  isDiscussionRegenerationInFlight,
  markDiscussionRegenerationInFlight,
} from "@/lib/discussionRegenerationInFlight";
import {
  createRegenerationRunId,
  logRegenerationEvent,
} from "@/lib/regenerationDiagnostics";
import {
  completeGenerationJob,
  createGenerationJob,
  failGenerationJob,
  getActiveGenerationJobForDiscussion,
  markGenerationJobProcessing,
  markStaleProcessingJobRetryable,
  requeueRetryableJob,
  updateGenerationJobStage,
} from "@/services/generationJobs/generationJobService";
import type {
  AthenaGenerationJob,
  AthenaGenerationTriggerType,
} from "@/services/generationJobs/generationJobTypes";
import { getDiscussionUpdatesByDiscussionId } from "@/services/discussionUpdateService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";

export class ActiveGenerationJobConflictError extends Error {
  existingJob: AthenaGenerationJob;

  constructor(existingJob: AthenaGenerationJob) {
    super("ACTIVE_JOB_EXISTS");
    this.name = "ActiveGenerationJobConflictError";
    this.existingJob = existingJob;
  }
}

export type EnqueueGenerationJobResult =
  | {
      accepted: true;
      job: AthenaGenerationJob;
      alreadyActive?: false;
    }
  | {
      accepted: false;
      job: AthenaGenerationJob;
      alreadyActive: true;
    };

/**
 * Persist a durable generation job and schedule background execution via
 * Next.js `after()`. The HTTP response should return immediately after this.
 */
export async function enqueueDiscussionGenerationJob(input: {
  organizationId: string;
  discussionId: string;
  discussionUpdateId?: string | null;
  triggerType: AthenaGenerationTriggerType;
  requestedBy?: string | null;
  /** When true, reuse an existing active job instead of throwing. */
  allowExisting?: boolean;
}): Promise<EnqueueGenerationJobResult> {
  const existing = await getActiveGenerationJobForDiscussion(
    input.discussionId,
    input.organizationId,
  );

  if (existing) {
    if (input.allowExisting !== false) {
      // Ensure the existing job is actually running in this process.
      scheduleGenerationJobExecution(existing);
      return {
        accepted: false,
        job: existing,
        alreadyActive: true,
      };
    }
    throw new ActiveGenerationJobConflictError(existing);
  }

  // Also respect process-local in-flight (Refresh Intelligence race).
  if (isDiscussionRegenerationInFlight(input.discussionId)) {
    const raceExisting = await getActiveGenerationJobForDiscussion(
      input.discussionId,
      input.organizationId,
    );
    if (raceExisting) {
      return {
        accepted: false,
        job: raceExisting,
        alreadyActive: true,
      };
    }
  }

  const regenerationRunId = createRegenerationRunId();

  let job: AthenaGenerationJob;
  try {
    job = await createGenerationJob({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      discussionUpdateId: input.discussionUpdateId,
      triggerType: input.triggerType,
      requestedBy: input.requestedBy,
      regenerationRunId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACTIVE_JOB_EXISTS" &&
      "existingJob" in error
    ) {
      const existingJob = (error as Error & { existingJob: AthenaGenerationJob })
        .existingJob;
      scheduleGenerationJobExecution(existingJob);
      return {
        accepted: false,
        job: existingJob,
        alreadyActive: true,
      };
    }
    throw error;
  }

  scheduleGenerationJobExecution(job);

  return {
    accepted: true,
    job,
  };
}

/**
 * Schedule (or re-schedule) execution for a durable job.
 * Safe to call repeatedly — in-memory + DB status prevent duplicate pipelines.
 */
export function scheduleGenerationJobExecution(job: AthenaGenerationJob): void {
  if (isDiscussionRegenerationInFlight(job.discussion_id)) {
    return;
  }

  markDiscussionRegenerationInFlight(job.discussion_id);

  after(() => {
    void executeGenerationJob(job.id, job.organization_id, job.discussion_id);
  });
}

async function executeGenerationJob(
  jobId: string,
  organizationId: string,
  discussionId: string,
): Promise<void> {
  const startedAt = new Date().toISOString();
  let followUpJob: AthenaGenerationJob | null = null;

  try {
    const processing = await markGenerationJobProcessing(jobId);
    if (!processing) {
      console.error("[ATHENA_JOB] Could not claim job for processing:", {
        jobId,
        discussionId,
        organizationId,
      });
      return;
    }

    logRegenerationEvent("REGENERATION_STARTED", {
      discussionId,
      organizationId,
      regenerationRunId: processing.regeneration_run_id,
      startedAt,
      jobId,
      triggerType: processing.trigger_type,
    });

    await updateGenerationJobStage(jobId, "discussion_analysis");

    const result = await processDiscussionEndToEnd(
      discussionId,
      organizationId,
      {
        regenerationRunId:
          processing.regeneration_run_id ?? createRegenerationRunId(),
        explicitRegeneration: processing.trigger_type === "manual_refresh",
      },
    );

    if (!result.success) {
      await failGenerationJob(jobId, {
        errorCode: "PIPELINE_FAILED",
        errorMessage: result.error ?? "Generation pipeline failed.",
        retryable: true,
        errorMetadata: {
          status: result.status ?? null,
          partial: result.partial ?? false,
        },
      });

      logRegenerationEvent("BACKGROUND_FAILED", {
        discussionId,
        organizationId,
        regenerationRunId: processing.regeneration_run_id,
        startedAt,
        jobId,
        error: result.error ?? "Regeneration failed",
      });
      return;
    }

    await updateGenerationJobStage(jobId, "executive_version");

    const currentVersion = await getCurrentExecutiveVersion(
      discussionId,
      organizationId,
    );

    await completeGenerationJob(jobId, {
      analysisId: result.analysisId ?? null,
      opportunityId: result.opportunityId ?? null,
      reviewId: result.reviewId ?? null,
      blueprintId: result.blueprintId ?? null,
      executiveVersionId: currentVersion?.id ?? null,
    });

    logRegenerationEvent("BACKGROUND_SUCCESS", {
      discussionId,
      organizationId,
      regenerationRunId: processing.regeneration_run_id,
      startedAt,
      jobId,
      analysisId: result.analysisId ?? null,
      blueprintId: result.blueprintId ?? null,
      blueprintGenerated: result.blueprintGenerated,
    });

    followUpJob = await createFollowUpJobIfNewerUpdates(processing);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown generation failure";

    await failGenerationJob(jobId, {
      errorCode: "PROCESSING_EXCEPTION",
      errorMessage: message,
      retryable: true,
    });

    console.error("[ATHENA_JOB] BACKGROUND_FAILED", {
      jobId,
      discussionId,
      organizationId,
      error: message,
    });

    logRegenerationEvent("BACKGROUND_FAILED", {
      discussionId,
      organizationId,
      startedAt,
      jobId,
      error: message,
    });
  } finally {
    clearDiscussionRegenerationInFlight(discussionId);
  }

  if (followUpJob) {
    markDiscussionRegenerationInFlight(discussionId);
    void executeGenerationJob(
      followUpJob.id,
      followUpJob.organization_id,
      followUpJob.discussion_id,
    );
  }
}

/**
 * If a Discussion Update was saved while this job was running, create one
 * follow-up job so the new thread content is not lost.
 */
async function createFollowUpJobIfNewerUpdates(
  completedJob: AthenaGenerationJob,
): Promise<AthenaGenerationJob | null> {
  try {
    const updates = await getDiscussionUpdatesByDiscussionId(
      completedJob.discussion_id,
      completedJob.organization_id,
    );
    const startedMs = Date.parse(
      completedJob.started_at ?? completedJob.created_at,
    );
    if (Number.isNaN(startedMs)) {
      return null;
    }

    const hasNewerUpdate = updates.some((update) => {
      const createdMs = Date.parse(update.created_at);
      return !Number.isNaN(createdMs) && createdMs > startedMs;
    });

    if (!hasNewerUpdate) {
      return null;
    }

    const active = await getActiveGenerationJobForDiscussion(
      completedJob.discussion_id,
      completedJob.organization_id,
    );
    if (active) {
      return null;
    }

    const followUp = await createGenerationJob({
      organizationId: completedJob.organization_id,
      discussionId: completedJob.discussion_id,
      triggerType: "discussion_update",
      requestedBy: completedJob.requested_by,
      regenerationRunId: createRegenerationRunId(),
    });

    console.log("[ATHENA_JOB] follow-up queued for newer discussion update", {
      parentJobId: completedJob.id,
      followUpJobId: followUp.id,
      discussionId: completedJob.discussion_id,
    });

    return followUp;
  } catch (error) {
    console.error("[ATHENA_JOB] Failed to create follow-up job:", {
      parentJobId: completedJob.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Recover queued / stale jobs for a discussion (e.g. after server restart).
 * Called from status polling so work continues without a separate worker.
 */
export async function ensureDiscussionGenerationJobRunning(
  discussionId: string,
  organizationId: string,
): Promise<AthenaGenerationJob | null> {
  let active = await getActiveGenerationJobForDiscussion(
    discussionId,
    organizationId,
  );

  if (!active) {
    return null;
  }

  // After a process restart the in-memory lock is gone. Any DB "processing"
  // job without a local lock is orphaned and must be recovered.
  if (
    active.status === "processing" &&
    !isDiscussionRegenerationInFlight(discussionId)
  ) {
    await failGenerationJob(active.id, {
      errorCode: "ORPHANED_PROCESSING",
      errorMessage:
        "Processing job was orphaned after a process restart and was requeued.",
      retryable: true,
    });
    const requeued = await requeueRetryableJob(active.id);
    active = requeued ?? active;
  } else if (active.status === "processing") {
    const recovered = await markStaleProcessingJobRetryable(active);
    active = recovered ?? active;
  }

  if (active.status === "retryable") {
    const requeued = await requeueRetryableJob(active.id);
    active = requeued ?? active;
  }

  if (
    (active.status === "queued" || active.status === "processing") &&
    !isDiscussionRegenerationInFlight(discussionId)
  ) {
    scheduleGenerationJobExecution(active);
  }

  return active;
}
