import { NextResponse } from "next/server";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  getActiveDeepScrapeJobForBrain,
  getLatestDeepScrapeJobForBrain,
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

export async function GET() {
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

    const active = await getActiveDeepScrapeJobForBrain({
      identityId: identity.id,
      organizationId,
    });
    const latest = active
      ? active
      : await getLatestDeepScrapeJobForBrain({
          identityId: identity.id,
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
      available:
        identity.brain_status === "ready" && Boolean(identity.website?.trim()),
      isActive,
      job: latest
        ? {
            id: latest.id,
            status: latest.status,
            stage: latest.current_stage,
            label: formatDeepScrapeStatusLabel({
              ...latest,
              source_type: "brain",
            }),
            pagesAnalyzed: latest.pages_analyzed,
            pagesCrawled:
              typeof latest.progress?.pagesCrawled === "number"
                ? latest.progress.pagesCrawled
                : latest.pages_crawled,
            pagesTarget:
              typeof latest.progress?.pagesTarget === "number"
                ? latest.progress.pagesTarget
                : null,
            pagesRendered:
              typeof latest.progress?.pagesRendered === "number"
                ? latest.progress.pagesRendered
                : null,
            phase:
              typeof latest.progress?.phase === "string"
                ? latest.progress.phase
                : null,
            completedAt: latest.completed_at,
            errorCode: latest.error_code,
            errorMessage: formatDeepScrapeErrorMessage(
              latest.error_code,
              latest.error_message,
            ),
          }
        : null,
      lastDeepScrapeAt: identity.last_deep_scrape_at ?? latest?.completed_at ?? null,
      lastDeepScrapePages:
        identity.last_deep_scrape_pages ??
        (latest?.status === "completed" ? latest.pages_analyzed : null),
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
