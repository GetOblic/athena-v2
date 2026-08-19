import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { toSocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";

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

export async function GET(
  _request: Request,
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

    const { organizationId } = await requireCurrentOrganizationContext();
    const calendar = await getSocialCalendarById(id, organizationId);
    if (!calendar) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Social Calendar not found." },
        },
        404,
      );
    }

    return json({
      ok: true,
      success: true,
      calendar: toSocialCalendarDetailDto(calendar),
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
    console.error("[ATHENA_SOCIAL_PLANNER_API] detail_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "DETAIL_FAILED",
          message: "Failed to load Social Calendar.",
        },
      },
      500,
    );
  }
}
