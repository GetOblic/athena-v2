import { NextResponse } from "next/server";
import { logRegenerationEvent } from "@/lib/regenerationDiagnostics";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(_request: Request, context: RouteContext) {
  let discussionId = "unknown";

  try {
    const { id } = await context.params;
    discussionId = id;

    logRegenerationEvent("REGENERATE_START", { discussionId });

    let organizationId: string;
    try {
      ({ organizationId } = await requireCurrentOrganizationContext());
    } catch (error) {
      if (error instanceof OrganizationAccessError) {
        logRegenerationEvent("REGENERATE_FAILED", {
          discussionId,
          reason: "organization_access",
        });
        return jsonResponse(
          { success: false, error: error.message },
          401,
        );
      }
      throw error;
    }

    const result = await processDiscussionEndToEnd(id, organizationId);

    if (!result.success) {
      logRegenerationEvent("REGENERATE_FAILED", {
        discussionId,
        error: result.error ?? null,
      });
      return jsonResponse(
        {
          success: false,
          error: result.error ?? "Regeneration failed. Please check logs.",
        },
        422,
      );
    }

    if (result.partial) {
      logRegenerationEvent("REGENERATE_PARTIAL_SUCCESS", {
        discussionId,
        analysisId: result.analysisId ?? null,
        blueprintId: result.blueprintId ?? null,
        blueprintGenerated: result.blueprintGenerated,
      });
      return jsonResponse({
        success: true,
        regenerated: true,
        partial: true,
        warning:
          result.warning ??
          "Strategic Blueprint could not be regenerated, previous valid blueprint was preserved.",
      });
    }

    logRegenerationEvent("REGENERATE_SUCCESS", {
      discussionId,
      analysisId: result.analysisId ?? null,
      blueprintId: result.blueprintId ?? null,
    });

    return jsonResponse({
      success: true,
      regenerated: true,
    });
  } catch (error) {
    console.error("Regenerate intelligence failed", error);
    logRegenerationEvent("REGENERATE_FAILED", {
      discussionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        success: false,
        error: "Regeneration failed. Please check logs.",
      },
      500,
    );
  }
}
