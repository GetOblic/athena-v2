import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import { removeLicenseeSubAccountRelationship } from "@/services/licensee/licenseeSubAccounts";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Remove Master ↔ sub-account relationship only.
 * Does not delete the Athena account or any tenant data.
 */
export async function POST(request: NextRequest) {
  let body: { relationshipId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  const relationshipId = body.relationshipId?.trim();
  if (!relationshipId) {
    return jsonError(400, "INVALID_BODY", "relationshipId is required.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const result = await removeLicenseeSubAccountRelationship({
      masterUserId: user.id,
      relationshipId,
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }

    console.error("[LICENSEE_REMOVE] failed", error);
    return jsonError(
      500,
      "REMOVE_FAILED",
      error instanceof Error ? error.message : "Remove failed.",
    );
  }
}
