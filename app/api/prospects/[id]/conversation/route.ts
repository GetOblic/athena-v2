import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import {
  ProspectConversationError,
  type ProspectConversationResult,
} from "@/services/prospectConversation/prospectConversationTypes";
import { runProspectConversation } from "@/services/prospectConversation/prospectConversationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous AI route — align with interactive conversation timeout. */
export const maxDuration = 60;

function json(data: ProspectConversationResult | { ok: false; error: { code: string; message: string } }, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
      );
    }

    const result = await runProspectConversation({
      organizationId,
      userId,
      prospect,
      body,
    });

    return json(result, 200);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    if (error instanceof ProspectConversationError) {
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        error.httpStatus,
      );
    }

    console.error(
      JSON.stringify({
        event: "prospect_conversation_unhandled_error",
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
    );
  }
}
