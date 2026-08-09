import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/athenaConversation/athenaConversationTypes";
import {
  listEstimateConversationForMaster,
  sendEstimateConversationForMaster,
} from "@/services/estimateConversation/estimateConversationService";
import { EstimateConversationError } from "@/services/estimateConversation/estimateConversationTypes";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous AI route — align with interactive conversation timeout. */
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200, requestId?: string) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };
  if (requestId) {
    headers[ATHENA_REQUEST_ID_HEADER] = requestId;
  }
  return NextResponse.json(data, { status, headers });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId?: string,
  retryable?: boolean,
) {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(retryable ? { retryable: true as const } : {}),
      },
    },
    status,
    requestId,
  );
}

async function requireAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Estimate not found.", requestId);
  }

  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.", requestId);
  }

  try {
    const result = await listEstimateConversationForMaster({
      masterUserId: userId,
      estimateId: id.trim(),
    });
    return json(result, 200, requestId);
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message, requestId);
    }
    if (error instanceof EstimateConversationError) {
      return jsonError(
        error.httpStatus,
        error.code,
        error.message,
        error.requestId ?? requestId,
        error.retryable,
      );
    }
    console.error("[LICENSEE_ESTIMATE_CONVERSATION_API] get_failed", error);
    return jsonError(
      500,
      "CONVERSATION_FAILED",
      "Failed to load Estimate conversation.",
      requestId,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Estimate not found.", requestId);
  }

  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Invalid JSON body.",
      requestId,
    );
  }

  try {
    const { result, requestId: serviceRequestId } =
      await sendEstimateConversationForMaster({
        masterUserId: userId,
        estimateId: id.trim(),
        body,
        requestId,
      });
    return json(result, 200, serviceRequestId || requestId);
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.name, error.message, requestId);
    }
    if (error instanceof EstimateConversationError) {
      return jsonError(
        error.httpStatus,
        error.code,
        error.message,
        error.requestId ?? requestId,
        error.retryable,
      );
    }
    console.error("[LICENSEE_ESTIMATE_CONVERSATION_API] post_failed", error);
    return jsonError(
      500,
      "CONVERSATION_FAILED",
      "Failed to send Estimate conversation message.",
      requestId,
    );
  }
}
