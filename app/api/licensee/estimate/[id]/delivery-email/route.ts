import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateAthenaEstimateDeliveryEmailForMaster } from "@/services/estimate/athenaEstimateOrchestration";
import {
  estimateDeliveryEmailEditHttpStatus,
  EstimateDeliveryEmailEditError,
  EstimateDeliveryEmailValidationError,
} from "@/services/estimate/estimateDeliveryEmail";
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

function editFailure(error: unknown) {
  if (error instanceof LicenseeAccessError) {
    return jsonError(
      estimateDeliveryEmailEditHttpStatus("LICENSEE_ACCESS_DENIED"),
      "LICENSEE_ACCESS_DENIED",
      error.message,
    );
  }
  if (error instanceof EstimateDeliveryEmailValidationError) {
    return jsonError(
      estimateDeliveryEmailEditHttpStatus("INVALID_DELIVERY_EMAIL"),
      error.code,
      error.details[0] ?? error.message,
    );
  }
  if (error instanceof EstimateDeliveryEmailEditError) {
    const status = estimateDeliveryEmailEditHttpStatus(error.code);
    if (status >= 500) {
      console.error("[LICENSEE_ESTIMATE_API] delivery_email_edit_failed", error);
    }
    return jsonError(status, error.code, error.message);
  }
  console.error("[LICENSEE_ESTIMATE_API] delivery_email_edit_failed", error);
  return jsonError(
    estimateDeliveryEmailEditHttpStatus("PERSISTENCE_FAILED"),
    "PERSISTENCE_FAILED",
    "Failed to save Estimate delivery email.",
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(
      estimateDeliveryEmailEditHttpStatus("NOT_FOUND"),
      "NOT_FOUND",
      "Estimate not found.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(
      estimateDeliveryEmailEditHttpStatus("UNAUTHORIZED"),
      "UNAUTHORIZED",
      "Authentication required.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      estimateDeliveryEmailEditHttpStatus("INVALID_DELIVERY_EMAIL"),
      "INVALID_DELIVERY_EMAIL",
      "Request body must be JSON.",
    );
  }

  try {
    const deliveryEmail = await updateAthenaEstimateDeliveryEmailForMaster({
      masterUserId: user.id,
      estimateId: id.trim(),
      body,
    });
    return json({ ok: true, deliveryEmail });
  } catch (error) {
    return editFailure(error);
  }
}
