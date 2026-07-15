/**
 * Enqueue policy for partial Deployment / Strategic asset refreshes.
 * Same-scope active job → reuse. Incompatible / full active job → conflict.
 * Never coalesces into discussion_update / manual_refresh follow-up.
 */

import { createRegenerationRunId } from "@/lib/regenerationDiagnostics";
import {
  ActiveGenerationJobConflictError,
  createGenerationJob,
  getActiveGenerationJobForDiscussion,
  isActiveGenerationJobStatus,
} from "@/services/generationJobs/generationJobService";
import type {
  AthenaGenerationJob,
  AthenaPartialRefreshTriggerType,
} from "@/services/generationJobs/generationJobTypes";
import { isPartialRefreshTriggerType } from "@/services/generationJobs/generationJobTypes";

export type EnqueuePartialRefreshResult =
  | {
      accepted: true;
      job: AthenaGenerationJob;
      alreadyActive?: false;
    }
  | {
      accepted: false;
      job: AthenaGenerationJob;
      alreadyActive: true;
      sameScope: true;
    };

export type PartialRefreshConflictCode =
  | "INCOMPATIBLE_ACTIVE_JOB"
  | "FULL_GENERATION_ACTIVE"
  | "INCOMPATIBLE_PARTIAL_SCOPE";

export class PartialRefreshConflictError extends Error {
  readonly existingJob: AthenaGenerationJob;
  readonly code: PartialRefreshConflictCode;

  constructor(
    existingJob: AthenaGenerationJob,
    code: PartialRefreshConflictCode,
    message: string,
  ) {
    super(message);
    this.name = "PartialRefreshConflictError";
    this.existingJob = existingJob;
    this.code = code;
  }
}

export async function enqueuePartialAssetRefresh(input: {
  organizationId: string;
  discussionId: string;
  triggerType: AthenaPartialRefreshTriggerType;
  requestedBy?: string | null;
}): Promise<EnqueuePartialRefreshResult> {
  if (!isPartialRefreshTriggerType(input.triggerType)) {
    throw new Error("Invalid partial refresh trigger type.");
  }

  const existing = await getActiveGenerationJobForDiscussion(
    input.discussionId,
    input.organizationId,
  );

  if (existing && isActiveGenerationJobStatus(existing.status)) {
    if (existing.trigger_type === input.triggerType) {
      return {
        accepted: false,
        job: existing,
        alreadyActive: true,
        sameScope: true,
      };
    }

    if (isPartialRefreshTriggerType(existing.trigger_type)) {
      throw new PartialRefreshConflictError(
        existing,
        "INCOMPATIBLE_PARTIAL_SCOPE",
        "Another partial refresh is already in progress for this entity.",
      );
    }

    throw new PartialRefreshConflictError(
      existing,
      "FULL_GENERATION_ACTIVE",
      "A full generation job is already in progress for this entity.",
    );
  }

  const regenerationRunId = createRegenerationRunId();

  try {
    const job = await createGenerationJob({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      triggerType: input.triggerType,
      requestedBy: input.requestedBy,
      regenerationRunId,
    });

    return { accepted: true, job };
  } catch (error) {
    if (error instanceof ActiveGenerationJobConflictError) {
      const raced = error.existingJob;
      if (raced.trigger_type === input.triggerType) {
        return {
          accepted: false,
          job: raced,
          alreadyActive: true,
          sameScope: true,
        };
      }
      if (isPartialRefreshTriggerType(raced.trigger_type)) {
        throw new PartialRefreshConflictError(
          raced,
          "INCOMPATIBLE_PARTIAL_SCOPE",
          "Another partial refresh is already in progress for this entity.",
        );
      }
      throw new PartialRefreshConflictError(
        raced,
        "FULL_GENERATION_ACTIVE",
        "A full generation job is already in progress for this entity.",
      );
    }
    throw error;
  }
}
