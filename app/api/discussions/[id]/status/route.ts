import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DISCUSSION_STATUS_OPTIONS } from "@/lib/discussionStatus";
import { getDiscussionById, updateDiscussion } from "@/services/discussionService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await request.json();
    const status = typeof body.status === "string" ? body.status.trim() : "";

    if (!DISCUSSION_STATUS_OPTIONS.includes(status as (typeof DISCUSSION_STATUS_OPTIONS)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: "Status must be New, Reviewing, Monitoring, or Completed.",
        },
        { status: 400 },
      );
    }

    const existing = await getDiscussionById(id, organizationId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const discussion = await updateDiscussion(id, organizationId, { status });

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Failed to update discussion status" },
        { status: 500 },
      );
    }

    revalidatePath("/");
    revalidatePath("/discussions");
    revalidatePath(`/discussions/${id}`);

    if (discussion.community_id) {
      revalidatePath(`/communities/${discussion.community_id}`);
    }

    return NextResponse.json({ success: true, discussion });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Discussion status update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update discussion status" },
      { status: 500 },
    );
  }
}
