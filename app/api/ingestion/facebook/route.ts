import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";
import {
  OrganizationAccessError,
  OrganizationContextMissingError,
  resolveOrganizationIdForIngestion,
  resolveOrganizationIdForUser,
} from "@/services/organizationService";

function readOrganizationIdFromBody(body: Record<string, unknown>): string | null {
  const raw = body.organizationId ?? body.organization_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ingestionKey = request.headers.get("x-athena-ingestion-key");
    const bodyOrganizationId = readOrganizationIdFromBody(body);

    let userId: string | null = null;
    let organizationId: string;

    if (user?.id) {
      userId = user.id;
      organizationId = await resolveOrganizationIdForUser(user.id, user.email);
    } else if (!ingestionKey?.trim()) {
      throw new OrganizationAccessError("Unauthorized Athena ingestion request.");
    } else {
      organizationId = await resolveOrganizationIdForIngestion({
        organizationId: bodyOrganizationId,
        ingestionKey,
      });
    }

    const result = await importFacebookDiscussion({
      organizationId,
      communityId:
        typeof body.communityId === "string"
          ? body.communityId
          : typeof body.community_id === "string"
            ? body.community_id
            : null,
      userId,
      title: typeof body.title === "string" ? body.title : null,
      author: typeof body.author === "string" ? body.author : null,
      url: typeof body.url === "string" ? body.url : null,
      body: typeof body.body === "string" ? body.body : "",
      capturedAt:
        typeof body.capturedAt === "string"
          ? body.capturedAt
          : typeof body.captured_at === "string"
            ? body.captured_at
            : null,
    });

    return NextResponse.json({
      success: true,
      discussion: result.discussion,
      workflow: result.workflow,
    });
  } catch (error) {
    if (error instanceof OrganizationContextMissingError) {
      return NextResponse.json(
        { success: false, error: "Missing organization context" },
        { status: 403 },
      );
    }

    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Facebook ingestion failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to import Facebook discussion";

    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
