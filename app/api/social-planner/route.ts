import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  toCreateSocialCalendarResponse,
  toSocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { createSocialCalendarWithJob } from "@/services/socialPlanner/socialCalendarOrchestration";
import {
  SocialCalendarRequestError,
  normalizeSocialCalendarCreateRequest,
} from "@/services/socialPlanner/socialCalendarRequest";
import { listSocialCalendars } from "@/services/socialPlanner/socialCalendarService";
import {
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
} from "@/services/socialPlanner/socialCalendarTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const url = new URL(request.url);
    const result = await listSocialCalendars(organizationId, {
      search: url.searchParams.get("search"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    return json({
      ok: true,
      success: true,
      calendars: result.calendars.map(toSocialCalendarListItemDto),
      pagination: result.pagination,
    });
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
    console.error("[ATHENA_SOCIAL_PLANNER_API] list_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: { code: "LIST_FAILED", message: "Failed to list Social Calendars." },
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
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

    const createRequest = normalizeSocialCalendarCreateRequest(body);
    const { calendar } = await createSocialCalendarWithJob({
      organizationId,
      userId,
      periodStart: createRequest.periodStart,
      periodEnd: createRequest.periodEnd,
      userGuidance: createRequest.userGuidance,
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
    console.error("[ATHENA_SOCIAL_PLANNER_API] create_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create Social Calendar.",
        },
      },
      500,
    );
  }
}
