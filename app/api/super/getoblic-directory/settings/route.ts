import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SuperAdminGetOblicDirectoryError,
  updateGetOblicDirectoryAllowanceForSuperAdmin,
} from "@/services/superAdmin/superAdminGetOblicDirectory";
import { SuperAdminAccessError } from "@/services/superAdmin/superAdminIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  let body: {
    licenseeAccountId?: unknown;
    organizationId?: unknown;
    listingCapacity?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (typeof body.listingCapacity !== "number") {
    return jsonError(
      400,
      "INVALID_CAPACITY",
      "listingCapacity must be a non-negative integer.",
    );
  }

  if (
    typeof body.licenseeAccountId !== "string" ||
    !body.licenseeAccountId.trim() ||
    typeof body.organizationId !== "string" ||
    !body.organizationId.trim()
  ) {
    return jsonError(
      400,
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId and organizationId are required.",
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
    const result = await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: user.id,
      licenseeAccountId: body.licenseeAccountId,
      organizationId: body.organizationId,
      listingCapacity: body.listingCapacity,
    });

    return NextResponse.json(
      { ok: true, allocation: result.allocation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return jsonError(403, "NOT_SUPER_ADMIN", error.message);
    }
    if (error instanceof SuperAdminGetOblicDirectoryError) {
      return jsonError(error.status, error.code, error.message);
    }
    console.error("[SUPER_ADMIN] getoblic_directory_allowance_update_failed", error);
    return jsonError(
      500,
      "SETTINGS_WRITE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to save GetOblic listing capacity.",
    );
  }
}
