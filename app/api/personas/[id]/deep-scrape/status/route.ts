import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { getPersonaDeepScrapeStatus } from "@/services/personas/personaDeepScrape";
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
    const status = await getPersonaDeepScrapeStatus({
      personaId: id,
      organizationId,
    });

    if (!status.persona) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Persona not found." },
        },
        404,
      );
    }

    const latest = status.latest;

    return json({
      ok: true,
      available: status.available,
      isActive: status.isActive,
      job: latest
        ? {
            id: latest.id,
            status: latest.status,
            stage: latest.current_stage,
            label: formatDeepScrapeStatusLabel({
              ...latest,
              source_type: "persona",
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
            resultExecutiveVersionId: latest.result_executive_version_id,
            errorCode: latest.error_code,
            errorMessage: formatDeepScrapeErrorMessage(
              latest.error_code,
              latest.error_message,
            ),
          }
        : null,
      lastDeepScrapeAt:
        status.persona.last_deep_scrape_at ??
        (latest?.status === "completed" ? latest.completed_at : null),
      lastDeepScrapePages:
        status.persona.last_deep_scrape_pages ??
        (latest?.status === "completed" ? latest.pages_analyzed : null),
      researchState: status.isActive
        ? latest?.status === "queued"
          ? "Queued"
          : "Researching"
        : latest?.status === "completed"
          ? "Research Complete"
          : latest?.status === "failed"
            ? "Research Failed"
            : status.persona.reference_website_intelligence
              ? "Research Complete"
              : "Not Researched",
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
