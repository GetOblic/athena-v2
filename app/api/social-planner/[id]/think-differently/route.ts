import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { toCreateSocialCalendarResponse } from "@/services/socialPlanner/socialCalendarDto";
import { createThinkDifferentlyCalendarWithJob } from "@/services/socialPlanner/socialCalendarOrchestration";
import {
  SocialCalendarRequestError,
  normalizeThinkDifferentlyRequest,
} from "@/services/socialPlanner/socialCalendarRequest";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import {
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
} from "@/services/socialPlanner/socialCalendarTypes";
import {
  SocialCalendarVersionAllocationError,
  ThinkDifferentlySourceError,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isValidId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isValidId(id)) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Social Calendar not found." },
        },
        404,
      );
    }

    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "INVALID_JSON", message: "Request body must be JSON." },
        },
        400,
      );
    }

    normalizeThinkDifferentlyRequest(body);

    const source = await getSocialCalendarById(id, organizationId);
    if (!source) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Social Calendar not found." },
        },
        404,
      );
    }

    const { calendar } = await createThinkDifferentlyCalendarWithJob({
      organizationId,
      userId,
      source,
    });

    return json(
      {
        ok: true,
        success: true,
        calendar: toCreateSocialCalendarResponse(calendar),
      },
      202,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }
    if (error instanceof ThinkDifferentlySourceError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        error.httpStatus,
      );
    }
    if (error instanceof SocialCalendarVersionAllocationError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        409,
      );
    }
    if (
      error instanceof SocialCalendarPeriodError ||
      error instanceof SocialCalendarGuidanceError ||
      error instanceof SocialCalendarLineageError ||
      error instanceof SocialCalendarRequestError
    ) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        400,
      );
    }
    console.error("[ATHENA_SOCIAL_PLANNER_API] think_differently_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to start Think Differently.",
        },
      },
      500,
    );
  }
}
