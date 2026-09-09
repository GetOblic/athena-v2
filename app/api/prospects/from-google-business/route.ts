import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  convertOutcomeErrorCode,
  convertOutcomeErrorMessage,
  convertOutcomeHttpStatus,
  toPublicGetOblicConversion,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import { convertGoogleBusinessSelection } from "@/services/googleBusiness/googleBusinessConvertService";
import { GoogleBusinessMakeError } from "@/services/googleBusiness/googleBusinessMakeTypes";
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

    let body: unknown = {};
    try {
      const raw = await request.text();
      body = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    } catch {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "GOOGLE_BUSINESS_INVALID_PAYLOAD",
            message:
              "Athena couldn’t add this Google business because the selection is incomplete.",
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

    const { make, conversion } = await convertGoogleBusinessSelection({
      organizationId,
      payload: body,
      actorUserId: userId,
      actorLicenseeAccountId,
    });

    const publicConversion = toPublicGetOblicConversion(conversion);
    if (
      conversion.outcome === "created" ||
      conversion.outcome === "reused" ||
      conversion.outcome === "already_owned"
    ) {
      return json({
        ok: true,
        success: true,
        result: make,
        conversion: publicConversion,
      });
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: convertOutcomeErrorCode(conversion.outcome),
          message: convertOutcomeErrorMessage(conversion.outcome),
        },
        result: make,
        conversion: publicConversion,
      },
      convertOutcomeHttpStatus(conversion.outcome),
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

    if (error instanceof GoogleBusinessMakeError) {
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
          code: "GOOGLE_BUSINESS_REMOTE_FAILED",
          message: "Athena couldn’t add this Google business. Try again.",
        },
      },
      502,
    );
  }
}
