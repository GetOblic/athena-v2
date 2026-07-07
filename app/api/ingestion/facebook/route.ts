import { NextResponse } from "next/server";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = await importFacebookDiscussion({
      communityId: body.communityId ?? body.community_id ?? null,
      title: body.title ?? null,
      author: body.author ?? null,
      url: body.url ?? null,
      body: body.body,
      capturedAt: body.capturedAt ?? body.captured_at ?? null,
    });

    return NextResponse.json({
      success: true,
      discussion: result.discussion,
      workflow: result.workflow,
    });
  } catch (error) {
    console.error("Facebook ingestion failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to import Facebook discussion",
      },
      { status: 500 },
    );
  }
}
