import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  syncGetOblicListingDescription,
  toPublicGetOblicDescriptionSync,
} from "@/services/getoblicDirectory/getoblicDirectoryDescriptionService";
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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: prospectId } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const result = await syncGetOblicListingDescription({
      organizationId,
      prospectId,
    });

    return json({
      ok: true,
      success: true,
      description: toPublicGetOblicDescriptionSync(result),
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

    if (error instanceof GetOblicDirectoryError) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.status,
      );
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "GETOBLIC_CONCURRENCY_CONFLICT",
          message: "GetOblic Directory could not send this description.",
        },
      },
      500,
    );
  }
}
