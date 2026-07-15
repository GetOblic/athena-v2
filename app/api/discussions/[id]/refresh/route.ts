import { NextResponse } from "next/server";
import {
  parsePartialRefreshScope,
  queuePartialAssetRefreshForDiscussion,
} from "@/services/generationJobs/partialRefreshApi";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Partial Deployment / Strategic refresh for Discussions. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const scope = parsePartialRefreshScope(body.scope);
    if (!scope) {
      return jsonResponse(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              'scope must be "deployment_assets" or "strategic_assets".',
          },
        },
        400,
      );
    }

    const result = await queuePartialAssetRefreshForDiscussion({
      discussionId: id,
      organizationId,
      userId,
      scope,
    });

    return jsonResponse(result.body, result.status);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return jsonResponse(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    console.error("[DISCUSSION_PARTIAL_REFRESH] failed", error);
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: {
          code: "REFRESH_FAILED",
          message: "Could not queue partial refresh.",
        },
      },
      500,
    );
  }
}
