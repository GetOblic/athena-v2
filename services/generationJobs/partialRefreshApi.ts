/**
 * Shared API helpers for Discussion / Prospect partial asset refreshes.
 */

import { getDiscussionById } from "@/services/discussionService";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import {
  enqueuePartialAssetRefresh,
  PartialRefreshConflictError,
} from "@/services/generationJobs/partialRefreshEnqueue";
import {
  parsePartialRefreshScope,
  triggerTypeForPartialRefreshScope,
  type PartialRefreshScope,
} from "@/services/generationJobs/partialRefreshScope";

export type { PartialRefreshScope };
export { parsePartialRefreshScope, triggerTypeForPartialRefreshScope };

export async function queuePartialAssetRefreshForDiscussion(input: {
  discussionId: string;
  organizationId: string;
  userId: string | null;
  scope: PartialRefreshScope;
}) {
  const discussion = await getDiscussionById(
    input.discussionId,
    input.organizationId,
  );
  if (!discussion) {
    return {
      ok: false as const,
      status: 404,
      body: {
        ok: false,
        success: false,
        error: { code: "NOT_FOUND", message: "Discussion not found." },
      },
    };
  }

  const currentVersion = await getCurrentExecutiveVersion(
    input.discussionId,
    input.organizationId,
  );
  if (!currentVersion?.intelligence?.analysis) {
    return {
      ok: false as const,
      status: 409,
      body: {
        ok: false,
        success: false,
        error: {
          code: "NO_PUBLISHED_VERSION",
          message:
            "A published Executive Version is required before partial refresh.",
        },
      },
    };
  }

  const triggerType = triggerTypeForPartialRefreshScope(input.scope);

  try {
    const enqueueResult = await enqueuePartialAssetRefresh({
      organizationId: input.organizationId,
      discussionId: input.discussionId,
      triggerType,
      requestedBy: input.userId,
    });

    if (!enqueueResult.accepted) {
      return {
        ok: true as const,
        status: 200,
        body: {
          ok: true,
          success: true,
          accepted: false,
          queued: true,
          scope: input.scope,
          triggerType,
          jobId: enqueueResult.job.id,
          status: enqueueResult.job.status,
          existingJobId: enqueueResult.job.id,
          message:
            input.scope === "deployment_assets"
              ? "Deployment Assets refresh already in progress."
              : "Strategic Assets refresh already in progress.",
        },
      };
    }

    return {
      ok: true as const,
      status: 202,
      body: {
        ok: true,
        success: true,
        accepted: true,
        queued: true,
        scope: input.scope,
        triggerType,
        jobId: enqueueResult.job.id,
        status: enqueueResult.job.status,
        discussionId: input.discussionId,
        message:
          input.scope === "deployment_assets"
            ? "Deployment Assets refresh queued."
            : "Strategic Assets refresh queued.",
      },
    };
  } catch (error) {
    if (error instanceof PartialRefreshConflictError) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false,
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          existingJobId: error.existingJob.id,
          existingTriggerType: error.existingJob.trigger_type,
        },
      };
    }
    throw error;
  }
}
