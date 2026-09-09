import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  convertOutcomeErrorCode,
  convertOutcomeErrorMessage,
  convertOutcomeHttpStatus,
  toPublicGetOblicConversion,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import {
  createCo5GoogleTrace,
  logCo5GoogleTraceCaughtError,
} from "@/services/googleBusiness/googleBusinessConversionTrace";
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
  const diagnosticTrace = createCo5GoogleTrace();
  try {
    diagnosticTrace.log({ stage: "route_received" });
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: unknown = {};
    try {
      const raw = await request.text();
      body = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    } catch {
      diagnosticTrace.log({
        stage: "route_response_ready",
        error_code: "GOOGLE_BUSINESS_INVALID_PAYLOAD",
        http_status: 400,
      });
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
      diagnosticTrace,
    });

    const publicConversion = toPublicGetOblicConversion(conversion);
    if (
      conversion.outcome === "created" ||
      conversion.outcome === "reused" ||
      conversion.outcome === "already_owned"
    ) {
      diagnosticTrace.log({
        stage: "route_response_ready",
        organization_id: organizationId,
        wordpress_listing_id: make.wordpress_listing_id,
        prospect_id: conversion.prospect_id,
        outcome: conversion.outcome,
        http_status: 200,
      });
      return json({
        ok: true,
        success: true,
        result: make,
        conversion: publicConversion,
      });
    }

    diagnosticTrace.log({
      stage: "route_response_ready",
      organization_id: organizationId,
      wordpress_listing_id: make.wordpress_listing_id,
      prospect_id: conversion.prospect_id,
      outcome: conversion.outcome,
      error_code: convertOutcomeErrorCode(conversion.outcome),
      http_status: convertOutcomeHttpStatus(conversion.outcome),
    });
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
      logCo5GoogleTraceCaughtError(diagnosticTrace, error, 401, "UNAUTHORIZED");
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
      logCo5GoogleTraceCaughtError(
        diagnosticTrace,
        error,
        error.status,
        error.code,
      );
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
      logCo5GoogleTraceCaughtError(
        diagnosticTrace,
        error,
        error.status,
        error.code,
      );
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

    logCo5GoogleTraceCaughtError(
      diagnosticTrace,
      error,
      502,
      "GOOGLE_BUSINESS_REMOTE_FAILED",
    );
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
