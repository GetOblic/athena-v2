import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EstimateRequestValidationError,
  normalizeEstimateRequest,
} from "@/services/estimate/athenaEstimateRequest";
import {
  AthenaEstimateProspectResolutionError,
  createAthenaEstimateWithJob,
  listAthenaEstimatesForMaster,
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

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const estimates = await listAthenaEstimatesForMaster({
      masterUserId: user.id,
    });
    return json({ ok: true, estimates });
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }
    console.error("[LICENSEE_ESTIMATE_API] list_failed", error);
    return jsonError(500, "LIST_FAILED", "Failed to list Estimates.");
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as Record<string, unknown>;
    }
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
  }

  // Never trust client ownership / requester identity / Prospect snapshot fields.
  const rest = { ...body };
  delete rest.licensee_account_id;
  delete rest.licenseeAccountId;
  delete rest.requested_by;
  delete rest.requestedBy;
  delete rest.prospectBusinessNameSnapshot;
  delete rest.prospect_business_name_snapshot;
  delete rest.prospectGenerationContext;
  delete rest.prospect_generation_context_json;
  delete rest.prospectGenerationContextJson;
  delete rest.prospect_generation_context;
  delete rest.organization_name_snapshot;
  delete rest.organizationNameSnapshot;

  const organizationIdRaw = rest.organizationId;
  if (typeof organizationIdRaw !== "string" || !organizationIdRaw.trim()) {
    return jsonError(
      400,
      "INVALID_BODY",
      "organizationId is required.",
    );
  }
  const organizationId = organizationIdRaw.trim();
  if (!UUID_RE.test(organizationId)) {
    return jsonError(
      400,
      "INVALID_BODY",
      "organizationId must be a valid UUID.",
    );
  }

  // Optional Prospect target — validated/resolved server-side under owned org.
  let prospectId: string | null = null;
  if (rest.prospectId != null && rest.prospectId !== "") {
    if (typeof rest.prospectId !== "string" || !rest.prospectId.trim()) {
      return jsonError(
        400,
        "INVALID_BODY",
        "prospectId must be a valid UUID when provided.",
      );
    }
    prospectId = rest.prospectId.trim();
    if (!UUID_RE.test(prospectId)) {
      return jsonError(
        400,
        "INVALID_BODY",
        "prospectId must be a valid UUID when provided.",
      );
    }
  }
  delete rest.prospectId;
  delete rest.prospect_id;

  try {
    const requestPayload = normalizeEstimateRequest(rest);
    const { estimate, job, relationshipConnected } =
      await createAthenaEstimateWithJob({
        masterUserId: user.id,
        organizationId,
        request: requestPayload,
        prospectId,
      });

    return json(
      {
        ok: true,
        estimate: toPublicAthenaEstimateDetail(
          estimate,
          relationshipConnected,
        ),
        jobId: job.id,
      },
      202,
    );
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message);
    }
    if (error instanceof AthenaEstimateProspectResolutionError) {
      // Fail closed without leaking cross-org Prospect existence.
      return jsonError(404, error.code, "Prospect target is unavailable.");
    }
    if (error instanceof EstimateRequestValidationError) {
      return jsonError(400, error.code, error.message);
    }
    console.error("[LICENSEE_ESTIMATE_API] create_failed", error);
    return jsonError(500, "CREATE_FAILED", "Failed to create Estimate.");
  }
}
