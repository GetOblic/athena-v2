import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import {
  LicenseeOwnCompanyError,
  designateLicenseeOwnCompany,
} from "@/services/licensee/licenseeSubAccounts";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Designate an owned sub-account as the Licensee's My Company.
 * No tenant, organization, or pin mutation.
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
    const result = await designateLicenseeOwnCompany({
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

    if (error instanceof LicenseeOwnCompanyError) {
      const status =
        error.code === "OWN_COMPANY_ALREADY_DESIGNATED" ? 409 : 400;
      return jsonError(status, error.code, error.message);
    }

    console.error("[LICENSEE_OWN_COMPANY] failed", error);
    return jsonError(
      500,
      "OWN_COMPANY_DESIGNATE_FAILED",
      error instanceof Error ? error.message : "Designation failed.",
    );
  }
}
