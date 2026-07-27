import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  ATHENA_REQUEST_ID_HEADER,
  AthenaConversationError,
  type AthenaConversationFailureResult,
  type AthenaConversationResult,
} from "@/services/athenaConversation/athenaConversationTypes";
import { runIdentityConversation } from "@/services/identityConversation/identityConversationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous AI route — align with interactive conversation timeout. */
export const maxDuration = 60;

function json(
  data: AthenaConversationResult | AthenaConversationFailureResult,
  status = 200,
  requestId: string,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    [ATHENA_REQUEST_ID_HEADER]: requestId,
  };
  return NextResponse.json(data, {
    status,
    headers,
  });
}

function failureJson(
  error: AthenaConversationError,
  fallbackRequestId: string,
) {
  const body: AthenaConversationFailureResult = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.retryable ? { retryable: true as const } : {}),
    },
  };
  return json(body, error.httpStatus, error.requestId ?? fallbackRequestId);
}

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body.",
          },
        },
        400,
        requestId,
      );
    }

    const { result, requestId: serviceRequestId } =
      await runIdentityConversation({
        organizationId,
        userId,
        body,
        requestId,
      });

    return json(result, 200, serviceRequestId || requestId);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
        requestId,
      );
    }

    if (error instanceof AthenaConversationError) {
      return failureJson(error, requestId);
    }

    console.error(
      JSON.stringify({
        event: "identity_conversation_unhandled_error",
        requestId,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );

    return json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Conversation request failed.",
        },
      },
      500,
      requestId,
    );
  }
}
