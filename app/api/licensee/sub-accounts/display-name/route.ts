import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import {
  LicenseeSubAccountCreateError,
  setLicenseeSubAccountDisplayName,
} from "@/services/licensee/licenseeSubAccounts";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  let body: { relationshipId?: string; displayName?: string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  const relationshipId = body.relationshipId?.trim();
  if (!relationshipId || typeof body.displayName !== "string") {
    return jsonError(
      400,
      "INVALID_BODY",
      "relationshipId and displayName (string) are required.",
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
    const result = await setLicenseeSubAccountDisplayName({
      masterUserId: user.id,
      relationshipId,
      displayName: body.displayName,
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }

    if (
      error instanceof LicenseeSubAccountCreateError &&
      error.code === "DISPLAY_NAME_TOO_LONG"
    ) {
      return jsonError(400, error.code, error.message);
    }

    console.error("[LICENSEE_DISPLAY_NAME] failed", error);
    return jsonError(
      500,
      "DISPLAY_NAME_SAVE_FAILED",
      error instanceof Error ? error.message : "Display name save failed.",
    );
  }
}
