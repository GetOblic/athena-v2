import { NextResponse } from "next/server";
import { appendDiscussionUpdate } from "@/services/discussionService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const discussion = await appendDiscussionUpdate({
      discussionId: id,
      updateBody: body.body,
      updateAuthor: body.author ?? null,
      updateUrl: body.url ?? null,
      capturedAt: body.capturedAt ?? null,
    });

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found or update failed" },
        { status: 404 },
      );
    }

    const workflow = await processDiscussionEndToEnd(discussion.id);

    return NextResponse.json({
      success: true,
      discussion,
      workflow,
    });
  } catch (error) {
    console.error("Discussion thread update failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to append discussion update",
      },
      { status: 500 },
    );
  }
}
