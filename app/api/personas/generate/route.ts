import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  generatePersonaCandidate,
  PersonaGenerationError,
} from "@/services/personas/personaGeneration";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/personaConversation/personaConversationTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous Athena AI route — aligned with Persona conversation / Getting Started. */
export const maxDuration = 60;

function json(
  data: unknown,
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

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    const { organizationId } = await requireCurrentOrganizationContext();

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
          requestId,
        },
        400,
        requestId,
      );
    }

    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    // organizationId from the browser is ignored; active org context wins.
    const instruction =
      typeof record.instruction === "string" ? record.instruction : null;

    const result = await generatePersonaCandidate({
      organizationId,
      instruction,
      clientOrganizationId: record.organizationId ?? record.organization_id,
      deps: { requestId },
    });

    return json(
      {
        ok: true,
        candidate: result.candidate,
        requestId: result.requestId,
        promptVersion: result.promptVersion,
        attempts: result.attempts,
      },
      200,
      result.requestId || requestId,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
          requestId,
        },
        401,
        requestId,
      );
    }

    if (error instanceof PersonaGenerationError) {
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.retryable ? { retryable: true as const } : {}),
          },
          requestId: error.requestId || requestId,
        },
        error.httpStatus,
        error.requestId || requestId,
      );
    }

    console.error(
      JSON.stringify({
        event: "persona_generation_unhandled_error",
        requestId,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );

    return json(
      {
        ok: false,
        error: {
          code: "GENERATION_FAILED",
          message: "Persona generation failed. Please try again.",
        },
        requestId,
      },
      500,
      requestId,
    );
  }
}
