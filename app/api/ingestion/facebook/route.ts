import { NextResponse } from "next/server";
import { enqueueDiscussionGenerationJob } from "@/services/generationJobs/generationJobRunner";
import { importFacebookDiscussion } from "@/services/ingestion/facebook/facebookImporter";
import { validateDiscussionIngestionInput } from "@/services/ingestion/facebook/facebookNormalizer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  OrganizationAccessError,
  OrganizationContextMissingError,
  resolveOrganizationIdForIngestion,
  resolveOrganizationIdForUser,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    const { discussion } = await importFacebookDiscussion(ingestionInput);

    let enqueueResult;
    try {
      enqueueResult = await enqueueDiscussionGenerationJob({
        organizationId,
        discussionId: discussion.id,
        triggerType: "discussion_import",
        requestedBy: userId,
        allowExisting: true,
      });
    } catch (error) {
      console.error("[ATHENA_JOB] Import persisted but enqueue failed:", {
        discussionId: discussion.id,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          ok: false,
          success: false,
          discussionId: discussion.id,
          discussion,
          error: {
            code: "ENQUEUE_FAILED",
            message:
              "Discussion was saved, but Athena could not queue background processing. Open the discussion and use Refresh Intelligence.",
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        success: true,
        accepted: enqueueResult.accepted,
        discussionId: discussion.id,
        discussion,
        jobId: enqueueResult.job.id,
        status: enqueueResult.job.status,
        message: enqueueResult.accepted
          ? "Discussion imported. Athena is processing intelligence in the background."
          : "Discussion imported. Processing is already in progress.",
      },
      { status: enqueueResult.accepted ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof OrganizationContextMissingError) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Missing organization context",
          },
        },
        { status: 403 },
      );
    }

    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    console.error("Discussion ingestion failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to import discussion";

    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message },
        },
        { status: 401 },
      );
    }

    if (message.includes("required") || message.includes("Required")) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: { code: "VALIDATION_ERROR", message },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: {
          code: "PROCESSING_REQUEST_FAILED",
          message,
        },
      },
      { status: 500 },
    );
  }
}
