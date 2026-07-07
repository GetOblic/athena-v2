import { NextResponse } from "next/server";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";

function verifyIngestionKey(request: Request) {
  const expectedKey = process.env.ATHENA_INGESTION_KEY;

  if (!expectedKey) {
    throw new Error("Missing ATHENA_INGESTION_KEY environment variable.");
  }

  const receivedKey = request.headers.get("x-athena-ingestion-key");

  if (receivedKey !== expectedKey) {
    throw new Error("Invalid Athena ingestion key.");
  }
}

export async function POST(request: Request) {
  try {
    verifyIngestionKey(request);

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
