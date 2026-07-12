import { NextResponse } from "next/server";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

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

    const result = await ensureProspectGenerationQueued(prospect, {
      requestedBy: userId,
    });

    return json(
      {
        ok: true,
        success: true,
        accepted: result.queued,
        prospect: toPublicProspect(result.prospect),
        prospectId: result.prospect.id,
        jobId: result.jobId ?? null,
        status: result.prospect.status,
        message: "Prospect intelligence refresh queued.",
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
              : "Failed to queue prospect refresh.",
        },
      },
      500,
    );
  }
}
