import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  isProspectLifecycleStatus,
  normalizeProspectLifecycleStatus,
} from "@/services/prospects/prospectLifecycle";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
import {
  getProspectById,
  updateProspect,
} from "@/services/prospects/prospectService";
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
 * Update client-managed Prospect lifecycle only.
 * Does not enqueue generation, scrape, or publish Executive Versions.
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

    if (!isProspectLifecycleStatus(raw)) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "lifecycle_status must be one of: New, Reviewing, Outreach Planned, Contacted, Follow-up, Engaged, Qualified, Not a Fit, Completed.",
          },
        },
        400,
      );
    }

    const existing = await getProspectById(id, organizationId);
    if (!existing) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    const prospect = await updateProspect(id, organizationId, {
      lifecycle_status: normalizeProspectLifecycleStatus(raw),
    });

    if (!prospect) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update Prospect status.",
          },
        },
        500,
      );
    }

    revalidatePath("/prospects");
    revalidatePath(`/prospects/${id}`);

    return json({
      ok: true,
      success: true,
      prospect: toPublicProspect(prospect),
      lifecycle_status: prospect.lifecycle_status,
      message: "Prospect status updated.",
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
              : "Failed to update Prospect status.",
        },
      },
      500,
    );
  }
}
