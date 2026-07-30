import { NextResponse } from "next/server";
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

    const result = await ensurePersonaGenerationQueued(persona, {
      requestedBy: userId,
      triggerType: "manual_refresh",
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
          ? "Persona intelligence generation queued."
          : "Persona generation could not be queued.",
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
          code: "REFRESH_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to queue persona generation.",
        },
      },
      500,
    );
  }
}
