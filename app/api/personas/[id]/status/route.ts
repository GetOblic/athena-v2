import { NextResponse } from "next/server";
import {
  getActiveGenerationJobForDiscussion,
  getLatestGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import { toPublicPersona } from "@/services/personas/personaPublic";
import { resolvePersonaDisplayStatus } from "@/services/personas/personaDisplay";
import { getPersonaById } from "@/services/personas/personaService";
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
 * Read-only Persona generation observability.
 * Does not claim, requeue, or execute jobs.
 * Stage 4 Ready requires a Current Executive Version (complete publication).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const persona = await getPersonaById(id, organizationId);

    if (!persona) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Persona not found." },
        },
        404,
      );
    }

    const discussionId = persona.linked_discussion_id;
    const [activeJob, latestJob, latestAnalysis, currentVersion] = discussionId
      ? await Promise.all([
          getActiveGenerationJobForDiscussion(discussionId, organizationId),
          getLatestGenerationJobForDiscussion(discussionId, organizationId),
          getLatestDiscussionAnalysis(discussionId, organizationId),
          getCurrentExecutiveVersion(discussionId, organizationId),
        ])
      : [null, null, null, null];

    const regenerationInFlight = Boolean(
      activeJob &&
        (activeJob.status === "queued" ||
          activeJob.status === "processing" ||
          activeJob.status === "retryable"),
    );

    const hasGeneratedAnalysis = Boolean(latestAnalysis);
    const hasCurrentExecutiveVersion = Boolean(currentVersion?.id);
    const hasTerminalJobFailure = Boolean(
      !activeJob &&
        latestJob?.status === "failed" &&
        !hasCurrentExecutiveVersion,
    );

    const displayStatus = resolvePersonaDisplayStatus({
      personaStatus: persona.status,
      jobStatus: activeJob?.status ?? null,
      jobStage: activeJob?.current_stage ?? null,
      hasGeneratedAnalysis,
      hasCurrentExecutiveVersion,
      hasTerminalJobFailure,
    });

    const observedJob = activeJob ?? latestJob;

    return json({
      ok: true,
      success: true,
      personaId: persona.id,
      status: displayStatus,
      regenerationInFlight,
      jobId: observedJob?.id ?? null,
      jobStatus: observedJob?.status ?? null,
      jobStage: observedJob?.current_stage ?? null,
      generationCompleted: Boolean(
        latestJob?.status === "completed" && hasCurrentExecutiveVersion,
      ),
      hasGeneratedAnalysis,
      hasCurrentExecutiveVersion,
      persona: toPublicPersona(persona),
      latestAnalysisId: latestAnalysis?.id ?? null,
      currentExecutiveVersionId: currentVersion?.id ?? null,
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
          message: "Failed to fetch persona status.",
        },
      },
      500,
    );
  }
}
