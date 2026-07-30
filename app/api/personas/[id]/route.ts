import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  deletePersona,
  getPersonaById,
  updatePersona,
} from "@/services/personas/personaService";
import { toPublicPersona } from "@/services/personas/personaPublic";
import { PERSONA_DESCRIPTIVE_TEXT_FIELDS } from "@/services/personas/personaUtils";
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

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return value == null ? "" : String(value);
}

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
    return json({
      ok: true,
      success: true,
      persona: toPublicPersona(persona),
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
    throw error;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;

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

    // Ignore protected ownership / operational fields from client input.
    const {
      organization_id: _organizationId,
      user_id: _userId,
      id: _id,
      created_at: _createdAt,
      import_batch_id: _importBatchId,
      linked_discussion_id: _linkedDiscussionId,
      source: _source,
      ...rest
    } = body;

    const update: Record<string, unknown> = {};
    for (const field of PERSONA_DESCRIPTIVE_TEXT_FIELDS) {
      if (rest[field] !== undefined) {
        update[field] = optionalString(rest[field]);
      }
    }

    if (rest.lifecycle_status !== undefined) {
      update.lifecycle_status = optionalString(rest.lifecycle_status);
    }
    if (rest.community_id !== undefined) {
      update.community_id =
        rest.community_id === null ? null : String(rest.community_id);
    }

    const persona = await updatePersona(
      id,
      organizationId,
      update as Parameters<typeof updatePersona>[2],
    );

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

    revalidatePath("/personas");
    revalidatePath(`/personas/${id}`);

    return json({
      ok: true,
      success: true,
      persona: toPublicPersona(persona),
      message: "Persona metadata saved.",
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
          message: error instanceof Error ? error.message : "Update failed.",
        },
      },
      400,
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

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

    const deleted = await deletePersona(id, organizationId);
    if (!deleted) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete persona.",
          },
        },
        500,
      );
    }

    revalidatePath("/personas");

    return json({
      ok: true,
      success: true,
      message: "Persona deleted.",
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
          code: "DELETE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to delete persona.",
        },
      },
      500,
    );
  }
}
