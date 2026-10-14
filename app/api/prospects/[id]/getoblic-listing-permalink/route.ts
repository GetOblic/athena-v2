import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { resolveProspectGetOblicListingPermalink } from "@/services/prospects/prospectGetOblicListingPermalink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: prospectId } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const result = await resolveProspectGetOblicListingPermalink({
      organizationId,
      prospectId,
    });

    return json({ ok: true, permalink: result.permalink });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    if (error instanceof GetOblicDirectoryError) {
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.status,
      );
    }

    console.error("[GETOBLIC_LISTING_PERMALINK] request_failed", {
      code: "REQUEST",
    });
    return json(
      {
        ok: false,
        error: {
          code: "GETOBLIC_LISTING_PERMALINK_UNAVAILABLE",
          message: "This GetOblic listing permalink is unavailable.",
        },
      },
      503,
    );
  }
}
