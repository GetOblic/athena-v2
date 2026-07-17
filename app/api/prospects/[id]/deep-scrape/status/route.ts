import { NextResponse } from "next/server";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import {
  getActiveDeepScrapeJobForProspect,
  getLatestDeepScrapeJobForProspect,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import {
  formatDeepScrapeErrorMessage,
  formatDeepScrapeStatusLabel,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
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

    const currentVersion = prospect.linked_discussion_id
      ? await getCurrentExecutiveVersion(
          prospect.linked_discussion_id,
          organizationId,
        )
      : null;

    const active = await getActiveDeepScrapeJobForProspect({
      prospectId: prospect.id,
      organizationId,
    });
    const latest = active
      ? active
      : await getLatestDeepScrapeJobForProspect({
          prospectId: prospect.id,
          organizationId,
        });

    const activeStatuses = new Set([
      "queued",
      "processing",
      "awaiting_follow_on",
      "retryable",
    ]);
    const isActive = Boolean(active && activeStatuses.has(active.status));

    return json({
      ok: true,
      available: Boolean(currentVersion) && Boolean(prospect.website?.trim()),
      isActive,
      job: latest
        ? {
            id: latest.id,
            status: latest.status,
            stage: latest.current_stage,
            label: formatDeepScrapeStatusLabel({
              ...latest,
              source_type: "prospect",
            }),
            pagesAnalyzed: latest.pages_analyzed,
            pagesCrawled: latest.pages_crawled,
            completedAt: latest.completed_at,
            resultExecutiveVersionId: latest.result_executive_version_id,
            errorCode: latest.error_code,
            errorMessage: formatDeepScrapeErrorMessage(
              latest.error_code,
              latest.error_message,
            ),
          }
        : null,
      lastDeepScrapeAt:
        latest?.status === "completed" ? latest.completed_at : null,
      lastDeepScrapePages:
        latest?.status === "completed" ? latest.pages_analyzed : null,
    });
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
          code: "STATUS_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load deep scrape status.",
        },
      },
      500,
    );
  }
}
