import { NextResponse } from "next/server";
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

    try {
      const enqueueResult = await enqueueDiscussionGenerationJob({
        organizationId,
        discussionId: id,
        triggerType: "manual_refresh",
        requestedBy: userId,
        allowExisting: true,
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
          message: "Regeneration already in progress.",
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
          message: "Regeneration started. Refresh in a few moments.",
        },
        202,
      );
    } catch (error) {
      console.error("Failed to queue regeneration:", error);
      return jsonResponse(
        {
          ok: false,
          success: false,
          error: {
            code: "PROCESSING_REQUEST_FAILED",
            message: "Could not start regeneration.",
          },
        },
        500,
      );
    }
  } catch (error) {
    console.error("Regenerate intelligence failed", error);
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: {
          code: "PROCESSING_REQUEST_FAILED",
          message: "Could not start regeneration.",
        },
      },
      500,
    );
  }
}
