import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SuperAdminOperationError,
  reactivateAccountAsSuperAdmin,
} from "@/services/superAdmin/superAdminAccounts";
import { SuperAdminAccessError } from "@/services/superAdmin/superAdminIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  let body: { userId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const result = await reactivateAccountAsSuperAdmin({
      actorUserId: user.id,
      targetUserId: String(body.userId || ""),
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return jsonError(403, "NOT_SUPER_ADMIN", error.message);
    }
    if (error instanceof SuperAdminOperationError) {
      return jsonError(400, error.code, error.message);
    }
    console.error("[SUPER_ADMIN] reactivate_failed", error);
    return jsonError(
      500,
      "REACTIVATE_FAILED",
      error instanceof Error ? error.message : "Reactivate failed.",
    );
  }
}
