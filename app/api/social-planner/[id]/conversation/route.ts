import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/athenaConversation/athenaConversationTypes";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  listSocialPlannerConversation,
  sendSocialPlannerConversation,
} from "@/services/socialPlanner/conversation/socialPlannerConversationService";
import { SocialPlannerConversationError } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200, requestId?: string) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };
  if (requestId) {
    headers[ATHENA_REQUEST_ID_HEADER] = requestId;
  }
  return NextResponse.json(data, { status, headers });
}

function isValidId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    if (!isValidId(id)) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Social Calendar not found." },
        },
        404,
        requestId,
      );
    }

    const { organizationId } = await requireCurrentOrganizationContext();
    const result = await listSocialPlannerConversation({
      organizationId,
      calendarId: id.trim(),
    });
    return json(result, 200, requestId);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
        requestId,
      );
    }
    if (error instanceof SocialPlannerConversationError) {
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        error.httpStatus,
        error.requestId ?? requestId,
      );
    }
    console.error("[ATHENA_SOCIAL_PLANNER_API] conversation_get_failed", error);
    return json(
      {
        ok: false,
        error: {
          code: "CONVERSATION_FAILED",
          message: "Failed to load Social Planner conversation.",
        },
      },
      500,
      requestId,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    if (!isValidId(id)) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Social Calendar not found." },
        },
        404,
        requestId,
      );
    }

    const { organizationId } = await requireCurrentOrganizationContext();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body." },
        },
        400,
        requestId,
      );
    }

    const { result, requestId: serviceRequestId } =
      await sendSocialPlannerConversation({
        organizationId,
        calendarId: id.trim(),
        body,
        requestId,
      });
    return json(result, 200, serviceRequestId || requestId);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
        requestId,
      );
    }
    if (error instanceof SocialPlannerConversationError) {
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
        error.requestId ?? requestId,
      );
    }
    console.error("[ATHENA_SOCIAL_PLANNER_API] conversation_post_failed", error);
    return json(
      {
        ok: false,
        error: {
          code: "CONVERSATION_FAILED",
          message: "Failed to send Social Planner conversation message.",
        },
      },
      500,
      requestId,
    );
  }
}
