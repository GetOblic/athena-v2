import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  enqueuePersonaReferenceWebsiteDeepScrape,
  PersonaDeepScrapeEligibilityError,
} from "@/services/personas/personaDeepScrape";
import { formatDeepScrapeStatusLabel } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Queue Deep Scrape for the persisted Persona Reference Website.
 * Does not accept arbitrary client URL input.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const result = await enqueuePersonaReferenceWebsiteDeepScrape({
      personaId: id,
      organizationId,
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
          source_type: "persona",
        }),
        message: result.created
          ? "Reference Website research queued."
          : "Reference Website research already in progress.",
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

    if (error instanceof PersonaDeepScrapeEligibilityError) {
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        error.code === "NOT_FOUND" ? 404 : 400,
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
