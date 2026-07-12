import { NextResponse } from "next/server";
import { appendDiscussionUpdate } from "@/services/discussionService";
import { enqueueDiscussionGenerationJob } from "@/services/generationJobs/generationJobRunner";
import { getProspectById, updateProspect } from "@/services/prospects/prospectService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Append Information for a Prospect.
 * Reuses discussion-update durable follow-up via the isolated compatibility bridge.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;
    const updateBody =
      typeof body.body === "string" ? body.body.trim() : "";

    if (!updateBody) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Additional information is required.",
          },
        },
        400,
      );
    }

    const prospect = await getProspectById(id, organizationId);
    if (!prospect?.linked_discussion_id) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "NOT_READY",
            message: "Prospect is not ready to accept additional information yet.",
          },
        },
        404,
      );
    }

    const appended = await appendDiscussionUpdate({
      discussionId: prospect.linked_discussion_id,
      organizationId,
      updateBody,
      updateUrl: typeof body.url === "string" ? body.url : null,
      capturedAt: typeof body.capturedAt === "string" ? body.capturedAt : null,
    });

    if (!appended) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to append information.",
          },
        },
        500,
      );
    }

    const notes = [prospect.notes, updateBody].filter(Boolean).join("\n\n");
    await updateProspect(prospect.id, organizationId, {
      notes,
      status: "Queued",
      last_activity: new Date().toISOString(),
    });

    const enqueueResult = await enqueueDiscussionGenerationJob({
      organizationId,
      discussionId: prospect.linked_discussion_id,
      discussionUpdateId: appended.updateId,
      triggerType: "discussion_update",
      requestedBy: userId,
      allowExisting: true,
      requestFollowUpIfActive: true,
    });

    return json(
      {
        ok: true,
        success: true,
        accepted: Boolean(
          enqueueResult.accepted || enqueueResult.alreadyActive,
        ),
        prospectId: prospect.id,
        jobId: enqueueResult.job.id,
        status: "Queued",
        message: enqueueResult.followUpRequested
          ? "Information appended. A follow-up refresh will run after the active job finishes."
          : "Information appended. Intelligence regeneration queued.",
      },
      202,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to append information.",
        },
      },
      500,
    );
  }
}
