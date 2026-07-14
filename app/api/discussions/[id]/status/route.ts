import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DISCUSSION_STATUS_OPTIONS } from "@/lib/discussionStatus";
import { getDiscussionById, updateDiscussion } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import {
  getActiveGenerationJobForDiscussion,
  getLatestGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Read-only observability for discussion regeneration state.
 * Does NOT claim, requeue, execute, or recover jobs — athena-worker owns that.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const discussion = await getDiscussionById(id, organizationId);

    if (!discussion) {
      return noStoreJson(
        { success: false, error: "Discussion not found" },
        404,
      );
    }

    const [activeJob, latestJob] = await Promise.all([
      getActiveGenerationJobForDiscussion(id, organizationId),
      getLatestGenerationJobForDiscussion(id, organizationId),
    ]);

    const analysis = await getLatestDiscussionAnalysis(id, organizationId);
    const blueprint = await getDisplayAssetBlueprintByDiscussionId(
      id,
      organizationId,
    );

    const regenerationInFlight = Boolean(
      activeJob &&
        (activeJob.status === "queued" ||
          activeJob.status === "processing" ||
          activeJob.status === "retryable"),
    );

    const observedJob = activeJob ?? latestJob;
    const publishedVersionId =
      observedJob?.published_version_id ??
      observedJob?.executive_version_id ??
      null;
    const generationPublished = Boolean(
      latestJob?.status === "completed" && publishedVersionId,
    );

    return noStoreJson({
      success: true,
      discussionId: id,
      regenerationInFlight,
      latestAnalysisId: analysis?.id ?? null,
      latestAnalysisCreatedAt: analysis?.created_at ?? null,
      latestAnalysisUpdatedAt: analysis?.updated_at ?? null,
      blueprintUpdatedAt: blueprint?.updated_at ?? null,
      status: discussion.status,
      jobId: observedJob?.id ?? null,
      jobStatus: observedJob?.status ?? null,
      jobTriggerType: observedJob?.trigger_type ?? null,
      jobStage: observedJob?.current_stage ?? null,
      jobAttemptCount: observedJob?.attempt_count ?? null,
      jobErrorCode: observedJob?.error_code ?? null,
      jobErrorMessage: observedJob?.error_message ?? null,
      publishedVersionId,
      generationPublished,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return noStoreJson({ success: false, error: error.message }, 401);
    }

    console.error("Discussion status fetch failed:", error);

    return noStoreJson(
      { success: false, error: "Failed to fetch discussion status" },
      500,
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await request.json();
    const status = typeof body.status === "string" ? body.status.trim() : "";

    if (!DISCUSSION_STATUS_OPTIONS.includes(status as (typeof DISCUSSION_STATUS_OPTIONS)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: "Status must be New, Reviewing, Monitoring, or Completed.",
        },
        { status: 400 },
      );
    }

    const existing = await getDiscussionById(id, organizationId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const discussion = await updateDiscussion(id, organizationId, { status });

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Failed to update discussion status" },
        { status: 500 },
      );
    }

    revalidatePath("/");
    revalidatePath("/discussions");
    revalidatePath(`/discussions/${id}`);

    if (discussion.community_id) {
      revalidatePath(`/communities/${discussion.community_id}`);
    }

    return NextResponse.json({ success: true, discussion });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Discussion status update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update discussion status" },
      { status: 500 },
    );
  }
}
