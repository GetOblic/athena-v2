import { NextResponse } from "next/server";
import {
  getActiveGenerationJobForDiscussion,
  getLatestGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
import { resolveProspectDisplayStatus } from "@/services/prospects/prospectDisplay";
import { getProspectById } from "@/services/prospects/prospectService";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import {
  extractProspectDeploymentAssetKeys,
  isCompleteProspectDeploymentAssetSet,
} from "@/lib/prospectDeploymentAssetContract";
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

    const discussionId = prospect.linked_discussion_id;
    const [activeJob, latestJob, currentVersion] = discussionId
      ? await Promise.all([
          getActiveGenerationJobForDiscussion(discussionId, organizationId),
          getLatestGenerationJobForDiscussion(discussionId, organizationId),
          getCurrentExecutiveVersion(discussionId, organizationId),
        ])
      : [null, null, null];

    const regenerationInFlight = Boolean(
      activeJob &&
        (activeJob.status === "queued" ||
          activeJob.status === "processing" ||
          activeJob.status === "retryable"),
    );

    const hasCurrentVersion = Boolean(currentVersion);
    const hasCompleteCurrentVersion = Boolean(
      currentVersion?.blueprint_id &&
        isCompleteProspectDeploymentAssetSet(
          extractProspectDeploymentAssetKeys(
            currentVersion.intelligence?.analysis?.suggested_cta,
          ),
        ),
    );
    const hasTerminalJobFailure = Boolean(
      !activeJob &&
        latestJob?.status === "failed" &&
        !hasCompleteCurrentVersion,
    );

    const displayStatus = resolveProspectDisplayStatus({
      prospectStatus: prospect.status,
      jobStatus: activeJob?.status ?? null,
      jobStage: activeJob?.current_stage ?? null,
      hasCurrentVersion,
      hasCompleteCurrentVersion,
      hasTerminalJobFailure,
    });

    const observedJob = activeJob ?? latestJob;
    const publishedVersionId =
      observedJob?.published_version_id ??
      observedJob?.executive_version_id ??
      currentVersion?.id ??
      null;

    return json({
      ok: true,
      success: true,
      prospectId: prospect.id,
      status: displayStatus,
      regenerationInFlight,
      jobId: observedJob?.id ?? null,
      jobStatus: observedJob?.status ?? null,
      generationPublished: Boolean(
        latestJob?.status === "completed" && publishedVersionId,
      ),
      hasCompleteCurrentVersion,
      prospect: toPublicProspect(prospect, activeJob),
      publishedVersionId,
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
