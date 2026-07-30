import { NextResponse } from "next/server";
import { buildThinkDifferentlyJobProgress } from "@/services/brain/generationContracts/executiveGenerationMode";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import { ensurePersonaGenerationQueued } from "@/services/personas/personaImporter";
import { toPublicPersona } from "@/services/personas/personaPublic";
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
 * Think Differently for Personas — hard-codes pipeline intent server-side.
 * Available only when a Current Persona Executive Version already exists.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

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
    if (!discussionId) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "NO_CURRENT_VERSION",
            message:
              "Think Differently requires a Current Persona Executive Version.",
          },
        },
        409,
      );
    }

    const currentVersion = await getCurrentExecutiveVersion(
      discussionId,
      organizationId,
    );
    if (!currentVersion?.id) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "NO_CURRENT_VERSION",
            message:
              "Think Differently requires a Current Persona Executive Version.",
          },
        },
        409,
      );
    }

    const result = await ensurePersonaGenerationQueued(persona, {
      requestedBy: userId,
      triggerType: "manual_refresh",
      progress: buildThinkDifferentlyJobProgress(),
    });

    return json(
      {
        ok: true,
        success: true,
        accepted: result.queued,
        queued: result.queued,
        persona: toPublicPersona(result.persona),
        personaId: result.persona.id,
        jobId: result.jobId ?? null,
        status: result.persona.status,
        message: result.queued
          ? "Think Differently queued."
          : "Think Differently could not be queued.",
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
          code: "THINK_DIFFERENTLY_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to queue Think Differently.",
        },
      },
      500,
    );
  }
}
