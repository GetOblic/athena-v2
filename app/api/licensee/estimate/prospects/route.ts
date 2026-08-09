/**
 * Master-authorized Prospect discovery for Licensee Estimate targeting (V27 L14).
 *
 * GET /api/licensee/estimate/prospects?organizationId=<uuid>
 *
 * Auth sequence (required order):
 * 1. Authenticate current user
 * 2. requireLicenseeMasterAccount (via orchestration helper)
 * 3. Validate organizationId
 * 4. assertLicenseeOwnsSubAccount
 * 5. Only then load Prospects for EXACTLY that organizationId
 *
 * Returns only { id, businessName }. Does not use tenant organization context helpers.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAthenaEstimateProspectsForMaster } from "@/services/estimate/athenaEstimateOrchestration";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonError(status: number, code: string, message: string) {
  return json({ ok: false, error: { code, message } }, status);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  const organizationIdRaw = new URL(request.url).searchParams.get(
    "organizationId",
  );
  if (typeof organizationIdRaw !== "string" || !organizationIdRaw.trim()) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "organizationId is required.",
    );
  }
  const organizationId = organizationIdRaw.trim();
  if (!UUID_RE.test(organizationId)) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "organizationId must be a valid UUID.",
    );
  }

  try {
    const prospects = await listAthenaEstimateProspectsForMaster({
      masterUserId: user.id,
      organizationId,
    });
    return json({ ok: true, prospects });
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }
    console.error("[LICENSEE_ESTIMATE_PROSPECTS_API] list_failed", error);
    return jsonError(500, "LIST_FAILED", "Failed to list Prospects.");
  }
}
