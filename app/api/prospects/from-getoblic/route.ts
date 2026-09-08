import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  convertGetOblicDirectoryListing,
  convertOutcomeErrorCode,
  convertOutcomeErrorMessage,
  convertOutcomeHttpStatus,
  toPublicGetOblicConversion,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import { LICENSEE_ORIGIN_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { parseLicenseeOriginCookieValue } from "@/services/licensee/licenseeOriginCookie";
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

export async function POST(request: NextRequest) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      body = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
            message: "Request body must be valid JSON.",
          },
        },
        400,
      );
    }

    const origin = parseLicenseeOriginCookieValue(
      request.cookies.get(LICENSEE_ORIGIN_COOKIE)?.value,
    );
    const actorLicenseeAccountId =
      origin && origin.organizationId === organizationId
        ? origin.licenseeAccountId
        : null;

    const result = await convertGetOblicDirectoryListing({
      organizationId,
      wordpressListingId:
        body.wordpressListingId ?? body.wordpress_listing_id,
      observed: body.observed,
      actorUserId: userId,
      actorLicenseeAccountId,
    });

    const conversion = toPublicGetOblicConversion(result);
    if (
      result.outcome === "created" ||
      result.outcome === "reused" ||
      result.outcome === "already_owned"
    ) {
      return json({
        ok: true,
        success: true,
        conversion,
      });
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: convertOutcomeErrorCode(result.outcome),
          message: convertOutcomeErrorMessage(result.outcome),
        },
        conversion,
      },
      convertOutcomeHttpStatus(result.outcome),
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
          message: "Athena couldn’t add this business. Try again.",
        },
      },
      500,
    );
  }
}
