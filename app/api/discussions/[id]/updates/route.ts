import { NextResponse } from "next/server";
import { appendDiscussionUpdate } from "@/services/discussionService";
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const body = await request.json();

    const updateBody =
      typeof body.body === "string" ? body.body.trim() : "";

    if (!updateBody) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Discussion content is required.",
          },
        },
        { status: 400 },
      );
    }

    const appended = await appendDiscussionUpdate({
      discussionId: id,
      organizationId,
      updateBody,
      updateUrl: body.url ?? null,
      capturedAt: body.capturedAt ?? null,
    });

    if (!appended) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Discussion not found or update failed",
          },
        },
        { status: 404 },
      );
    }

    let enqueueResult;
    try {
      enqueueResult = await enqueueDiscussionGenerationJob({
        organizationId,
        discussionId: appended.discussion.id,
        discussionUpdateId: appended.updateId,
        triggerType: "discussion_update",
        requestedBy: userId,
        allowExisting: true,
      });
    } catch (error) {
      console.error("[ATHENA_JOB] Update persisted but enqueue failed:", {
        discussionId: appended.discussion.id,
        updateId: appended.updateId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          ok: false,
          success: false,
          discussionId: appended.discussion.id,
          discussionUpdateId: appended.updateId,
          discussion: appended.discussion,
          error: {
            code: "ENQUEUE_FAILED",
            message:
              "Update was saved, but Athena could not queue reprocessing. Use Refresh Intelligence to continue.",
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        success: true,
        accepted: enqueueResult.accepted,
        discussionId: appended.discussion.id,
        discussionUpdateId: appended.updateId,
        discussion: appended.discussion,
        jobId: enqueueResult.job.id,
        status: enqueueResult.job.status,
        message: enqueueResult.accepted
          ? "Update saved. Athena is regenerating intelligence in the background."
          : "Update saved. This discussion is already being processed.",
      },
      { status: enqueueResult.accepted ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    console.error("Discussion thread update failed:", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: {
          code: "PROCESSING_REQUEST_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to append discussion update",
        },
      },
      { status: 500 },
    );
  }
}
