import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  appendPersonaInteraction,
  PersonaInteractionError,
} from "@/services/personas/personaInteractions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Append Interaction for a Persona.
 * Accepts only { interaction }. Append is server-side and append-only on Notes.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body.",
          },
        },
        400,
      );
    }

    const interaction =
      body &&
      typeof body === "object" &&
      typeof (body as { interaction?: unknown }).interaction === "string"
        ? (body as { interaction: string }).interaction
        : "";

    const result = await appendPersonaInteraction({
      personaId: id,
      organizationId,
      interaction,
      requestedBy: userId,
    });

    if (result.regenerationError) {
      return json(
        {
          ok: true,
          success: true,
          accepted: false,
          partialSuccess: true,
          personaId: result.persona.id,
          notes: result.notes,
          status: result.persona.status,
          message:
            "Interaction appended, but intelligence regeneration could not be queued. Use Generate Intelligence to recover.",
          regenerationError: result.regenerationError,
        },
        202,
      );
    }

    return json(
      {
        ok: true,
        success: true,
        accepted: result.queued,
        personaId: result.persona.id,
        notes: result.notes,
        jobId: result.jobId,
        status: "Queued",
        message: "Interaction appended. Intelligence regeneration queued.",
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

    if (error instanceof PersonaInteractionError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : error.code === "VALIDATION_ERROR"
              ? 400
              : 500;
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        status,
      );
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to append interaction.",
        },
      },
      500,
    );
  }
}
