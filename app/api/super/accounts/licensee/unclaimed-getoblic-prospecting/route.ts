import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SuperAdminLicenseeUnclaimedGetoblicProspectingError,
  updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin,
} from "@/services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspecting";
import { SuperAdminAccessError } from "@/services/superAdmin/superAdminIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  let body: {
    licenseeAccountId?: unknown;
    allowUnclaimedGetoblicProspecting?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (
    typeof body.licenseeAccountId !== "string" ||
    !body.licenseeAccountId.trim()
  ) {
    return jsonError(
      400,
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId is required.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const result = await updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin(
      {
        actorUserId: user.id,
        licenseeAccountId: body.licenseeAccountId,
        allowUnclaimedGetoblicProspecting:
          body.allowUnclaimedGetoblicProspecting,
      },
    );

    return NextResponse.json(
      { ok: true, setting: result.setting },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return jsonError(403, "NOT_SUPER_ADMIN", error.message);
    }
    if (error instanceof SuperAdminLicenseeUnclaimedGetoblicProspectingError) {
      return jsonError(error.status, error.code, error.message);
    }
    console.error(
      "[SUPER_ADMIN] licensee_unclaimed_getoblic_prospecting_update_failed",
      error,
    );
    return jsonError(
      500,
      "PERMISSION_WRITE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to save Licensee unclaimed GetOblic prospecting.",
    );
  }
}
