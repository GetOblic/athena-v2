import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AthenaEstimateOrchestrationNotFoundError,
  AthenaEstimateProspectResolutionError,
  regenerateAthenaEstimate,
} from "@/services/estimate/athenaEstimateOrchestration";
import { toPublicAthenaEstimateDetail } from "@/services/estimate/athenaEstimatePublic";
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Estimate not found.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const { estimate, job, relationshipConnected, regeneratedFrom } =
      await regenerateAthenaEstimate({
        masterUserId: user.id,
        sourceEstimateId: id.trim(),
      });

    return json(
      {
        ok: true,
        estimate: toPublicAthenaEstimateDetail(
          estimate,
          relationshipConnected,
        ),
        jobId: job.id,
        regeneratedFrom,
      },
      202,
    );
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }
    if (error instanceof AthenaEstimateOrchestrationNotFoundError) {
      return jsonError(404, "NOT_FOUND", "Estimate not found.");
    }
    if (error instanceof AthenaEstimateProspectResolutionError) {
      // Removed / missing / wrong-org Prospect — fail closed; no new Estimate.
      return jsonError(
        409,
        error.code,
        "Prospect target is unavailable for regenerate.",
      );
    }
    console.error("[LICENSEE_ESTIMATE_API] regenerate_failed", error);
    return jsonError(
      500,
      "REGENERATE_FAILED",
      "Failed to regenerate Estimate.",
    );
  }
}
