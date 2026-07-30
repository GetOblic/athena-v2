import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  ATHENA_REQUEST_ID_HEADER,
  PersonaConversationError,
  type PersonaConversationFailureResult,
  type PersonaConversationResult,
} from "@/services/personaConversation/personaConversationTypes";
import { runPersonaConversation } from "@/services/personaConversation/personaConversationService";
import { getPersonaById } from "@/services/personas/personaService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(
  data: PersonaConversationResult | PersonaConversationFailureResult,
  status = 200,
  requestId: string,
) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      [ATHENA_REQUEST_ID_HEADER]: requestId,
    },
  });
}

function failureJson(
  error: PersonaConversationError,
  fallbackRequestId: string,
) {
  const body: PersonaConversationFailureResult = {
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

    const persona = await getPersonaById(id, organizationId);
    if (!persona) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Persona not found." },
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
      await runPersonaConversation({
        organizationId,
        userId,
        persona,
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

    if (error instanceof PersonaConversationError) {
      return failureJson(error, requestId);
    }

    console.error(
      JSON.stringify({
        event: "persona_conversation_unhandled_error",
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
