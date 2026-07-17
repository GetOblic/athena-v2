import { NextResponse } from "next/server";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import { enqueueProspectDeepScrapeJob } from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const prospect = await getProspectById(id, organizationId);
    if (!prospect) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    if (!prospect.linked_discussion_id) {
      return json(
        {
          ok: false,
          error: {
            code: "NO_EXECUTIVE_VERSION",
            message:
              "Deep scrape is available after the first Executive Version exists.",
          },
        },
        400,
      );
    }

    const currentVersion = await getCurrentExecutiveVersion(
      prospect.linked_discussion_id,
      organizationId,
    );
    if (!currentVersion) {
      return json(
        {
          ok: false,
          error: {
            code: "NO_EXECUTIVE_VERSION",
            message:
              "Deep scrape is available after the first Executive Version exists.",
          },
        },
        400,
      );
    }

    const root = normalizeRootWebsiteUrl(prospect.website);
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

    const result = await enqueueProspectDeepScrapeJob({
      organizationId,
      prospectId: prospect.id,
      discussionId: prospect.linked_discussion_id,
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
        label: formatDeepScrapeStatusLabel({
          ...result.job,
          source_type: "prospect",
        }),
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
