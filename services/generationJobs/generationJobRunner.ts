import { createRegenerationRunId } from "@/lib/regenerationDiagnostics";
import {
  ActiveGenerationJobConflictError,
  createGenerationJob,
  getActiveGenerationJobForDiscussion,
  isActiveGenerationJobStatus,
  markDiscussionPendingGenerationFollowUp,
} from "@/services/generationJobs/generationJobService";
import { shouldRequestFollowUpWhenActiveJobExists } from "@/services/generationJobs/generationJobWorkerConfig";
import type {
  AthenaGenerationJob,
  AthenaGenerationTriggerType,
} from "@/services/generationJobs/generationJobTypes";

export type EnqueueGenerationJobResult =
  | {
      accepted: true;
      job: AthenaGenerationJob;
      alreadyActive?: false;
      followUpRequested?: false;
    }
  | {
      accepted: false;
      job: AthenaGenerationJob;
      alreadyActive: true;
      followUpRequested?: boolean;
    };

async function coalesceIntoActiveJob(
  existing: AthenaGenerationJob,
  organizationId: string,
  discussionId: string,
  triggerType: AthenaGenerationTriggerType,
): Promise<EnqueueGenerationJobResult> {
  // Keep retryable/queued/processing as the single active intent.
  // Any new executive action (Refresh / Append / Import) must set the
  // durable follow-up marker so it is not silently lost.
  let followUpRequested = false;
  if (shouldRequestFollowUpWhenActiveJobExists()) {
    await markDiscussionPendingGenerationFollowUp(discussionId, organizationId, {
      triggerType,
    });
    followUpRequested = true;
  }

  console.log("[ATHENA_JOB] refresh_coalesced", {
    discussionId,
    parentJobId: existing.id,
    parentTriggerType: existing.trigger_type,
    requestedTriggerType: triggerType,
    followUpRequested,
  });

  return {
    accepted: false,
    job: existing,
    alreadyActive: true,
    followUpRequested,
  };
}

/**
 * Persist a durable generation job for the athena-worker to claim.
 * Does NOT execute the pipeline and does NOT use Next.js after().
 */
export async function enqueueDiscussionGenerationJob(input: {
  organizationId: string;
  discussionId: string;
  discussionUpdateId?: string | null;
  triggerType: AthenaGenerationTriggerType;
  requestedBy?: string | null;
  /** When true, reuse an existing active job instead of throwing. */
  allowExisting?: boolean;
  /**
   * @deprecated Follow-up is always requested when an active job exists.
   * Kept for call-site compatibility.
   */
  requestFollowUpIfActive?: boolean;
}): Promise<EnqueueGenerationJobResult> {
  const existing = await getActiveGenerationJobForDiscussion(
    input.discussionId,
    input.organizationId,
  );

  if (existing && isActiveGenerationJobStatus(existing.status)) {
    if (input.allowExisting === false) {
      throw new ActiveGenerationJobConflictError(existing);
    }

    return coalesceIntoActiveJob(
      existing,
      input.organizationId,
      input.discussionId,
      input.triggerType,
    );
  }

  const regenerationRunId = createRegenerationRunId();

  try {
    const job = await createGenerationJob({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      discussionUpdateId: input.discussionUpdateId,
      triggerType: input.triggerType,
      requestedBy: input.requestedBy,
      regenerationRunId,
    });

    console.log("[ATHENA_JOB] refresh_accepted_new_job", {
      discussionId: input.discussionId,
      jobId: job.id,
      triggerType: input.triggerType,
    });

    return {
      accepted: true,
      job,
    };
  } catch (error) {
    if (error instanceof ActiveGenerationJobConflictError) {
      if (input.allowExisting === false) {
        throw error;
      }

      return coalesceIntoActiveJob(
        error.existingJob,
        input.organizationId,
        input.discussionId,
        input.triggerType,
      );
    }
    throw error;
  }
}

/** @deprecated Recovery must be performed by athena-worker, not the web app. */
export async function ensureDiscussionGenerationJobRunning(): Promise<null> {
  return null;
}

/** @deprecated after() scheduling removed — athena-worker claims jobs. */
export function scheduleGenerationJobExecution(): void {
  // no-op retained for compile safety during migration
}
