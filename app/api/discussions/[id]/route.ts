import { NextResponse } from "next/server";
import {
  deleteDiscussion,
  updateDiscussion,
} from "@/services/discussionService";
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

    const platform = typeof body.platform === "string" ? body.platform.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const author = typeof body.author === "string" ? body.author.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const discussionBody =
      typeof body.body === "string" ? body.body.trim() : "";

    if (!platform || !title || !author || !url || !discussionBody) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Platform, title, author, source URL, and discussion content are required.",
        },
        { status: 400 },
      );
    }

    const discussion = await updateDiscussion(id, organizationId, {
      platform,
      community_id:
        typeof body.communityId === "string"
          ? body.communityId || null
          : typeof body.community_id === "string"
            ? body.community_id || null
            : null,
      title,
      author,
      url,
      body: discussionBody,
    });

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, discussion });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Discussion update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update discussion" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const deleted = await deleteDiscussion(id, organizationId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Discussion delete failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to delete discussion" },
      { status: 500 },
    );
  }
}
