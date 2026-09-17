import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FreeAudienceGenerationError } from "@/lib/organization/freeAudienceGeneration";
import { FreeConvertGenerationError } from "@/lib/organization/freeConvertGeneration";
import { assertCurrentFreeAudienceGeneration } from "@/services/organization/freeAudienceGenerationGuard";
import { assertCurrentFreeConvertGeneration } from "@/services/organization/freeConvertGenerationGuard";
import {
  createAudienceFromProspect,
  CreateAudienceFromProspectError,
} from "@/services/personas/createAudienceFromProspect";
import { PersonaGenerationError } from "@/services/personas/personaGeneration";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/personaConversation/personaConversationTypes";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous Persona candidate generation + persist. */
export const maxDuration = 90;

function json(data: unknown, status = 200, requestId: string) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      [ATHENA_REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();

  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const { id: prospectId } = await context.params;
    await assertCurrentFreeConvertGeneration({
      action: "sync_ai",
      prospectId,
    });
    await assertCurrentFreeAudienceGeneration({ action: "prospect" });

    let clientOrganizationId: unknown;
    try {
      const body = await request.json();
      const record =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
      clientOrganizationId = record.organizationId ?? record.organization_id;
    } catch {
      clientOrganizationId = undefined;
    }

    const result = await createAudienceFromProspect({
      prospectId,
      organizationId,
      userId,
      clientOrganizationId,
    });

    return json(
      {
        ok: true,
        personaId: result.personaId,
      },
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof FreeAudienceGenerationError) {
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.httpStatus,
        requestId,
      );
    }

    if (error instanceof FreeConvertGenerationError) {
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.httpStatus,
        requestId,
      );
    }

    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401,
        requestId,
      );
    }

    if (error instanceof CreateAudienceFromProspectError) {
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.httpStatus,
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
        },
        error.httpStatus,
        requestId,
      );
    }

    console.error(
      JSON.stringify({
        event: "prospect_create_audience_unhandled_error",
        requestId,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );

    return json(
      {
        ok: false,
        error: {
          code: "CREATE_FAILED",
          message: "Create Audience from Prospect failed.",
        },
      },
      500,
      requestId,
    );
  }
}
