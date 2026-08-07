import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LicenseeAccessError,
  isLicenseeMasterUser,
} from "@/services/licensee/licenseeIdentity";
import {
  applyLicenseeMasterMarkerCookie,
  clearLicenseeMasterMarkerCookie,
} from "@/services/licensee/licenseeMasterMarkerCookie";
import {
  LICENSEE_ORIGIN_COOKIE,
  applyLicenseeOriginCookie,
  clearLicenseeOriginCookie,
  handoffMasterToSubAccount,
  restoreMasterFromOriginCookie,
} from "@/services/licensee/licenseeSessionHandoff";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Production Master ↔ sub-account session handoff.
 * Always available in production; not a development-only spike endpoint.
 */
export async function POST(request: NextRequest) {
  let body: { action?: string; organizationId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  const action = body.action?.trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    if (action === "open_sub_account") {
      if (!(await isLicenseeMasterUser(user.id))) {
        return jsonError(
          403,
          "NOT_MASTER",
          "Authenticated user is not a Business Licensee Master.",
        );
      }

      const organizationId = body.organizationId?.trim();
      if (!organizationId) {
        return jsonError(400, "MISSING_ORG", "organizationId is required.");
      }

      const handoff = await handoffMasterToSubAccount({
        masterUserId: user.id,
        organizationId,
      });

      const context = await requireCurrentOrganizationContext();
      if (context.organizationId !== handoff.organizationId) {
        return jsonError(
          500,
          "ORG_MISMATCH",
          "Tenant context did not resolve to the handed-off organization.",
        );
      }
      if (context.userId !== handoff.ownerUserId) {
        return jsonError(
          500,
          "USER_MISMATCH",
          "Tenant context user did not match sub-account owner.",
        );
      }

      const response = NextResponse.json(
        {
          ok: true,
          action: "open_sub_account",
          organizationId: context.organizationId,
          redirectTo: "/",
          activeOrgOverrideUsed: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
      applyLicenseeOriginCookie(response, handoff.originCookieValue);
      clearLicenseeMasterMarkerCookie(response);
      return response;
    }

    if (action === "return_to_master") {
      const originCookie = request.cookies.get(LICENSEE_ORIGIN_COOKIE)?.value;
      const restored = await restoreMasterFromOriginCookie(originCookie);

      if (!(await isLicenseeMasterUser(restored.masterUserId))) {
        return jsonError(
          500,
          "RESTORE_FAILED",
          "Restored user is not a Business Licensee Master.",
        );
      }

      const response = NextResponse.json(
        {
          ok: true,
          action: "return_to_master",
          redirectTo: "/licensee",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
      clearLicenseeOriginCookie(response);
      applyLicenseeMasterMarkerCookie(response);
      return response;
    }

    return jsonError(
      400,
      "UNKNOWN_ACTION",
      "action must be open_sub_account | return_to_master",
    );
  } catch (error) {
    if (
      error instanceof LicenseeAccessError ||
      (error instanceof Error &&
        (error.name === "LicenseeMasterProvisionBlockedError" ||
          error.name === "AccountAccessDeniedError"))
    ) {
      return jsonError(403, error.name, error.message);
    }

    console.error("[LICENSEE_HANDOFF] route_failed", error);
    return jsonError(
      500,
      "HANDOFF_FAILED",
      error instanceof Error ? error.message : "Handoff failed.",
    );
  }
}
