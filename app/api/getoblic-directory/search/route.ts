import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  searchGetOblicDirectory,
  toPublicGetOblicDirectorySearch,
} from "@/services/getoblicDirectory/getoblicDirectorySearchService";
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

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const params = request.nextUrl.searchParams;

    const search = await searchGetOblicDirectory({
      organizationId,
      keywords: params.get("keywords"),
      listing_type: params.get("listing_type") ?? undefined,
      page: params.get("page") ?? undefined,
      per_page: params.get("per_page") ?? undefined,
    });

    return json({
      ok: true,
      search: toPublicGetOblicDirectorySearch(search),
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
          code: "GETOBLIC_REMOTE_TRANSIENT",
          message: "GetOblic Directory search is unavailable.",
        },
      },
      502,
    );
  }
}
