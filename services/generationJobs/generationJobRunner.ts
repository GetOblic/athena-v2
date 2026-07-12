import { createRegenerationRunId } from "@/lib/regenerationDiagnostics";
import {
  ActiveGenerationJobConflictError,
  createGenerationJob,
  getActiveGenerationJobForDiscussion,
  isActiveGenerationJobStatus,
  markDiscussionPendingGenerationFollowUp,
} from "@/services/generationJobs/generationJobService";
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
   * When enqueueing a discussion_update while another job is active,
   * mark a coalesced durable follow-up instead of creating a second job.
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

    let followUpRequested = false;
    if (
      input.requestFollowUpIfActive ||
      input.triggerType === "discussion_update"
    ) {
      await markDiscussionPendingGenerationFollowUp(
        input.discussionId,
        input.organizationId,
      );
      followUpRequested = true;
    }

    return {
      accepted: false,
      job: existing,
      alreadyActive: true,
      followUpRequested,
    };
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

    return {
      accepted: true,
      job,
    };
  } catch (error) {
    if (error instanceof ActiveGenerationJobConflictError) {
      if (input.allowExisting === false) {
        throw error;
      }

      let followUpRequested = false;
      if (
        input.requestFollowUpIfActive ||
        input.triggerType === "discussion_update"
      ) {
        await markDiscussionPendingGenerationFollowUp(
          input.discussionId,
          input.organizationId,
        );
        followUpRequested = true;
      }

      return {
        accepted: false,
        job: error.existingJob,
        alreadyActive: true,
        followUpRequested,
      };
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
