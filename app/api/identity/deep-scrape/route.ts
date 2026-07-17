import { NextResponse } from "next/server";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { enqueueBrainDeepScrapeJob } from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import { formatDeepScrapeStatusLabel } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import { normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const identity = await getAthenaIdentityByUserId(userId, organizationId);

    if (!identity) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Athena Brain not found." },
        },
        404,
      );
    }

    if (identity.brain_status !== "ready") {
      return json(
        {
          ok: false,
          error: {
            code: "BRAIN_NOT_READY",
            message: "Deep scrape is available after initial Brain training.",
          },
        },
        400,
      );
    }

    const root = normalizeRootWebsiteUrl(identity.website);
    if (!root) {
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_WEBSITE",
            message: "A valid website URL is required for deep scrape.",
          },
        },
        400,
      );
    }

    const result = await enqueueBrainDeepScrapeJob({
      organizationId,
      identityId: identity.id,
      websiteUrl: root.url,
      requestedBy: userId,
    });

    return json(
      {
        ok: true,
        accepted: true,
        created: result.created,
        jobId: result.job.id,
        status: result.job.status,
        stage: result.job.current_stage,
        label: formatDeepScrapeStatusLabel(result.job),
        message: result.created
          ? "Deep website scrape queued."
          : "Deep website scrape already in progress.",
      },
      202,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    return json(
      {
        ok: false,
        error: {
          code: "DEEP_SCRAPE_QUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to queue deep scrape.",
        },
      },
      500,
    );
  }
}
