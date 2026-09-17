import { NextResponse } from "next/server";
import { FreeSocialPlannerGenerationError } from "@/lib/organization/freeSocialPlannerGeneration";
import { assertCurrentFreeSocialPlannerGeneration } from "@/services/organization/freeSocialPlannerGenerationGuard";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { toCreateSocialCalendarResponse } from "@/services/socialPlanner/socialCalendarDto";
import { createEvergreenSocialCalendarWithJob } from "@/services/socialPlanner/socialCalendarOrchestration";
import {
  SocialCalendarRequestError,
  normalizeSocialCalendarCreateRequest,
} from "@/services/socialPlanner/socialCalendarRequest";
import { resolveSocialPlannerTargetPersona } from "@/services/socialPlanner/socialPlannerTargetPersona";
import { SocialCalendarPlannerKindError } from "@/services/socialPlanner/socialCalendarPlannerKind";
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

export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    await assertCurrentFreeSocialPlannerGeneration();

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
    const targetPersona = createRequest.personaId
      ? await resolveSocialPlannerTargetPersona({
          personaId: createRequest.personaId,
          organizationId,
        })
      : null;
    const { calendar } = await createEvergreenSocialCalendarWithJob({
      organizationId,
      userId,
      periodStart: createRequest.periodStart,
      periodEnd: createRequest.periodEnd,
      userGuidance: createRequest.userGuidance,
      targetPersonaId: targetPersona?.id ?? null,
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
    if (
      error instanceof SocialCalendarPeriodError ||
      error instanceof SocialCalendarGuidanceError ||
      error instanceof SocialCalendarLineageError ||
      error instanceof SocialCalendarPlannerKindError ||
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
    console.error("[ATHENA_SOCIAL_PLANNER_API] evergreen_create_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create Evergreen Calendar.",
        },
      },
      500,
    );
  }
}
