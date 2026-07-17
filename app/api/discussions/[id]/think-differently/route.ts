import { NextResponse } from "next/server";
import { buildThinkDifferentlyJobProgress } from "@/services/brain/generationContracts/executiveGenerationMode";
import { enqueueDiscussionGenerationJob } from "@/services/generationJobs/generationJobRunner";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Think Differently — hard-codes pipeline intent server-side.
 * Browser cannot inject arbitrary generation modes.
 */
export async function POST(_request: Request, context: RouteContext) {
  let discussionId = "unknown";

  try {
    const { id } = await context.params;
    discussionId = id;

    let organizationId: string;
    let userId: string;
    try {
      ({ organizationId, userId } = await requireCurrentOrganizationContext());
    } catch (error) {
      if (error instanceof OrganizationAccessError) {
        return jsonResponse(
          {
            ok: false,
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication required",
            },
          },
          401,
        );
      }
      throw error;
    }

    const enqueueResult = await enqueueDiscussionGenerationJob({
      organizationId,
      discussionId: id,
      triggerType: "manual_refresh",
      requestedBy: userId,
      allowExisting: true,
      progress: buildThinkDifferentlyJobProgress(),
    });

    if (!enqueueResult.accepted) {
      return jsonResponse({
        ok: true,
        success: true,
        accepted: false,
        queued: true,
        jobId: enqueueResult.job.id,
        status: enqueueResult.job.status,
        existingJobId: enqueueResult.job.id,
        followUpRequested: Boolean(enqueueResult.followUpRequested),
        message: enqueueResult.followUpRequested
          ? "Generation already in progress. Think Differently will run after it finishes."
          : "Generation already in progress.",
      });
    }

    return jsonResponse(
      {
        ok: true,
        success: true,
        accepted: true,
        queued: true,
        jobId: enqueueResult.job.id,
        status: enqueueResult.job.status,
        discussionId: id,
        message: "Think Differently queued.",
      },
      202,
    );
  } catch (error) {
    console.error("Failed to queue Think Differently:", {
      discussionId,
      error,
    });
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: {
          code: "PROCESSING_REQUEST_FAILED",
          message: "Could not start Think Differently.",
        },
      },
      500,
    );
  }
}
