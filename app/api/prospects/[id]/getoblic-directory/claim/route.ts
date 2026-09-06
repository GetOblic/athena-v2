import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  claimKnownExistingListing,
  toPublicGetOblicClaim,
} from "@/services/getoblicDirectory/getoblicDirectoryClaimService";
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

function outcomeStatus(outcome: string): number {
  switch (outcome) {
    case "linked":
      return 200;
    case "claiming":
      return 502;
    default:
      return 409;
  }
}

function outcomeErrorCode(outcome: string): string {
  switch (outcome) {
    case "remote_missing":
      return "GETOBLIC_REMOTE_LISTING_MISSING";
    case "allowance_exceeded":
      return "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED";
    case "claiming":
      return "GETOBLIC_REMOTE_TRANSIENT";
    default:
      return "GETOBLIC_CONCURRENCY_CONFLICT";
  }
}

function outcomeErrorMessage(outcome: string): string {
  switch (outcome) {
    case "remote_missing":
      return "The WordPress listing was not found.";
    case "allowance_exceeded":
      return "Monthly GetOblic Directory allowance has been used.";
    case "claiming":
      return "GetOblic Directory is temporarily unavailable.";
    default:
      return "This listing could not be claimed.";
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: prospectId } = await context.params;
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

    const wordpressListingId =
      body.wordpressListingId ?? body.wordpress_listing_id;

    const origin = parseLicenseeOriginCookieValue(
      request.cookies.get(LICENSEE_ORIGIN_COOKIE)?.value,
    );
    const actorLicenseeAccountId =
      origin && origin.organizationId === organizationId
        ? origin.licenseeAccountId
        : null;

    const result = await claimKnownExistingListing({
      organizationId,
      prospectId,
      wordpressListingId,
      actorUserId: userId,
      actorLicenseeAccountId,
    });

    const claim = toPublicGetOblicClaim(result);
    if (result.outcome === "linked") {
      return json({
        ok: true,
        success: true,
        claim,
      });
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: outcomeErrorCode(result.outcome),
          message: outcomeErrorMessage(result.outcome),
        },
        claim,
      },
      outcomeStatus(result.outcome),
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
          ...(error.link
            ? {
                claim: toPublicGetOblicClaim({
                  outcome:
                    error.link.relationship_status === "linked"
                      ? "linked"
                      : error.code === "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED"
                        ? "allowance_exceeded"
                        : error.code === "GETOBLIC_REMOTE_LISTING_MISSING"
                          ? "remote_missing"
                          : "claiming",
                  link: error.link,
                  allocated: false,
                }),
              }
            : {}),
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
          message: "GetOblic Directory could not complete this claim.",
        },
      },
      500,
    );
  }
}
