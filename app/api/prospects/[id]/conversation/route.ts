import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import {
  ATHENA_REQUEST_ID_HEADER,
  ProspectConversationError,
  type ProspectConversationFailureResult,
  type ProspectConversationResult,
} from "@/services/prospectConversation/prospectConversationTypes";
import { runProspectConversation } from "@/services/prospectConversation/prospectConversationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous AI route — align with interactive conversation timeout. */
export const maxDuration = 60;

function json(
  data: ProspectConversationResult | ProspectConversationFailureResult,
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
  error: ProspectConversationError,
  fallbackRequestId: string,
) {
  const body: ProspectConversationFailureResult = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.retryable ? { retryable: true as const } : {}),
    },
  };
  return json(body, error.httpStatus, error.requestId ?? fallbackRequestId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();

  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const prospect = await getProspectById(id, organizationId);
    if (!prospect) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
        requestId,
      );
    }

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
      await runProspectConversation({
        organizationId,
        userId,
        prospect,
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

    if (error instanceof ProspectConversationError) {
      return failureJson(error, requestId);
    }

    console.error(
      JSON.stringify({
        event: "prospect_conversation_unhandled_error",
        requestId,
        // No request/body content logged.
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
