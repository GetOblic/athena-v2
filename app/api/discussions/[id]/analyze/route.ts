import { after, NextResponse } from "next/server";
import {
  createRegenerationRunId,
  logRegenerationEvent,
} from "@/lib/regenerationDiagnostics";
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

const inFlightDiscussionRegenerations = new Set<string>();

function runRegenerationInBackground(
  discussionId: string,
  organizationId: string,
  regenerationRunId: string,
  startedAt: string,
): void {
  inFlightDiscussionRegenerations.add(discussionId);

  after(() => {
    void processDiscussionEndToEnd(discussionId, organizationId, {
      regenerationRunId,
      explicitRegeneration: true,
    })
      .then((result) => {
        if (!result.success) {
          logRegenerationEvent("BACKGROUND_FAILED", {
            discussionId,
            organizationId,
            regenerationRunId,
            startedAt,
            error: result.error ?? "Regeneration failed",
          });
          return;
        }

        logRegenerationEvent("BACKGROUND_SUCCESS", {
          discussionId,
          organizationId,
          regenerationRunId,
          startedAt,
          analysisId: result.analysisId ?? null,
          blueprintId: result.blueprintId ?? null,
          blueprintGenerated: result.blueprintGenerated,
        });
      })
      .catch((error) => {
        console.error("[REGENERATION] BACKGROUND_FAILED", {
          discussionId,
          organizationId,
          regenerationRunId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        logRegenerationEvent("BACKGROUND_FAILED", {
          discussionId,
          organizationId,
          regenerationRunId,
          startedAt,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        inFlightDiscussionRegenerations.delete(discussionId);
      });
  });
}

export async function POST(_request: Request, context: RouteContext) {
  let discussionId = "unknown";

  try {
    const { id } = await context.params;
    discussionId = id;

    let organizationId: string;
    try {
      ({ organizationId } = await requireCurrentOrganizationContext());
    } catch (error) {
      if (error instanceof OrganizationAccessError) {
        return jsonResponse(
          { success: false, error: "Authentication required" },
          401,
        );
      }
      throw error;
    }

    const regenerationRunId = createRegenerationRunId();
    const startedAt = new Date().toISOString();

    try {
      if (inFlightDiscussionRegenerations.has(id)) {
        return jsonResponse({
          success: true,
          queued: true,
          message: "Regeneration already in progress.",
        });
      }

      logRegenerationEvent("REGENERATION_STARTED", {
        discussionId,
        organizationId,
        regenerationRunId,
        startedAt,
      });

      runRegenerationInBackground(
        id,
        organizationId,
        regenerationRunId,
        startedAt,
      );
    } catch (error) {
      console.error("Failed to queue regeneration:", error);
      return jsonResponse(
        { success: false, error: "Could not start regeneration." },
        500,
      );
    }

    return jsonResponse({
      success: true,
      queued: true,
      message: "Regeneration started. Refresh in a few moments.",
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
        error: "Could not start regeneration.",
      },
      500,
    );
  }
}
