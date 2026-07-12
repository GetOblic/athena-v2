import { NextResponse } from "next/server";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
import { mapJobStatusToProspectDisplayStatus } from "@/services/prospects/prospectStatus";
import { getProspectById } from "@/services/prospects/prospectService";
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
 * Read-only Prospect generation observability.
 * Does not claim, requeue, or execute jobs.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const prospect = await getProspectById(id, organizationId);

    if (!prospect) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    const activeJob = prospect.linked_discussion_id
      ? await getActiveGenerationJobForDiscussion(
          prospect.linked_discussion_id,
          organizationId,
        )
      : null;

    const regenerationInFlight = Boolean(
      activeJob &&
        (activeJob.status === "queued" ||
          activeJob.status === "processing" ||
          activeJob.status === "retryable"),
    );

    const displayStatus = mapJobStatusToProspectDisplayStatus({
      prospectStatus: prospect.status,
      jobStatus: activeJob?.status ?? null,
      jobStage: activeJob?.current_stage ?? null,
    });

    return json({
      ok: true,
      success: true,
      prospectId: prospect.id,
      status: displayStatus,
      regenerationInFlight,
      jobId: activeJob?.id ?? null,
      prospect: toPublicProspect(prospect, activeJob),
      publishedVersionId:
        activeJob?.published_version_id ??
        activeJob?.executive_version_id ??
        null,
    });
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
          code: "STATUS_FAILED",
          message: "Failed to fetch prospect status.",
        },
      },
      500,
    );
  }
}
