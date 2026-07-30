import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  isPersonaLifecycleStatus,
  normalizePersonaLifecycleStatus,
} from "@/services/personas/personaLifecycle";
import { toPublicPersona } from "@/services/personas/personaPublic";
import {
  getPersonaById,
  updatePersona,
} from "@/services/personas/personaService";
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
 * Update client-managed Persona lifecycle only.
 * Does not enqueue generation or create bridge Discussions.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;
    const raw =
      typeof body.lifecycle_status === "string"
        ? body.lifecycle_status.trim()
        : typeof body.status === "string"
          ? body.status.trim()
          : "";

    if (!isPersonaLifecycleStatus(raw)) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "lifecycle_status must be one of: New, Reviewing, Researching, In Use, Validating, Refined, Not a Fit, Archived.",
          },
        },
        400,
      );
    }

    const existing = await getPersonaById(id, organizationId);
    if (!existing) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Persona not found." },
        },
        404,
      );
    }

    const persona = await updatePersona(id, organizationId, {
      lifecycle_status: normalizePersonaLifecycleStatus(raw),
    });

    if (!persona) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update Persona status.",
          },
        },
        500,
      );
    }

    revalidatePath("/personas");
    revalidatePath(`/personas/${id}`);

    return json({
      ok: true,
      success: true,
      persona: toPublicPersona(persona),
      lifecycle_status: persona.lifecycle_status,
      message: "Persona status updated.",
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
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update Persona status.",
        },
      },
      500,
    );
  }
}
