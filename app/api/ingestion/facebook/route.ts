import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";

async function getAuthorizedUserId(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    return user.id;
  }

  const expectedKey = process.env.ATHENA_INGESTION_KEY;
  const receivedKey = request.headers.get("x-athena-ingestion-key");

  if (expectedKey && receivedKey === expectedKey) {
    return null;
  }

  throw new Error("Unauthorized Athena ingestion request.");
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthorizedUserId(request);

    const body = await request.json();

    const result = await importFacebookDiscussion({
      communityId: body.communityId ?? body.community_id ?? null,
      userId,
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
