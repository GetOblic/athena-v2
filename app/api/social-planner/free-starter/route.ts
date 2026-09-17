import { NextResponse } from "next/server";
import { FreeSocialPlannerGenerationError } from "@/lib/organization/freeSocialPlannerGeneration";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { assertCurrentFreeSocialPlannerGeneration } from "@/services/organization/freeSocialPlannerGenerationGuard";
import { reserveFreeStarter } from "@/services/organization/freeStarterAuthority";
import { toCreateSocialCalendarResponse } from "@/services/socialPlanner/socialCalendarDto";
import { createFreeStarterDailySocialCalendar } from "@/services/socialPlanner/freeStarterOrchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    await assertCurrentFreeSocialPlannerGeneration({
      authorizedStarter: true,
    });

    const reservation = await reserveFreeStarter(organizationId);
    const { calendar } = await createFreeStarterDailySocialCalendar({
      organizationId,
      userId,
      reservationToken: reservation.reservationToken,
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
    if (error instanceof FreeSocialPlannerGenerationError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        error.httpStatus,
      );
    }
    console.error("[ATHENA_FREE_STARTER_API] create_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create starter content.",
        },
      },
      500,
    );
  }
}
