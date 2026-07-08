import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";
import { validateDiscussionIngestionInput } from "@/services/ingestion/facebook/facebookNormalizer";
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

function readStringField(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
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

    const ingestionInput = {
      organizationId,
      platform: readStringField(body, "platform"),
      communityId:
        readStringField(body, "communityId", "community_id") || null,
      userId,
      title: readStringField(body, "title"),
      author: readStringField(body, "author"),
      url: readStringField(body, "url"),
      body: readStringField(body, "body"),
      capturedAt:
        readStringField(body, "capturedAt", "captured_at") || null,
    };

    validateDiscussionIngestionInput(ingestionInput);

    const result = await importFacebookDiscussion(ingestionInput);

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

    console.error("Discussion ingestion failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to import discussion";

    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      );
    }

    if (
      message.includes("required") ||
      message.includes("Required")
    ) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
