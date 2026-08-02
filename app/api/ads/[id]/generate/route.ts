import { NextResponse } from "next/server";
import {
  AdCampaignOrchestrationNotFoundError,
  enqueueGenerationForExistingCampaign,
  ReadyAdCampaignImmutableError,
} from "@/services/ads/adCampaignOrchestration";
import { toPublicAdCampaignDetail } from "@/services/ads/adCampaignPublic";
import { ActiveAdGenerationJobConflictError } from "@/services/ads/adsGenerationJobs/adGenerationJobService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_RE.test(id.trim())) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Ad campaign not found." },
        },
        404,
      );
    }

    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const { campaign, job } = await enqueueGenerationForExistingCampaign({
      campaignId: id,
      organizationId,
      userId,
    });

    return json(
      {
        ok: true,
        success: true,
        campaign: toPublicAdCampaignDetail(campaign),
        jobId: job.id,
      },
      202,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }
    if (error instanceof AdCampaignOrchestrationNotFoundError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Ad campaign not found." },
        },
        404,
      );
    }
    if (error instanceof ReadyAdCampaignImmutableError) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        409,
      );
    }
    if (error instanceof ActiveAdGenerationJobConflictError) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "ACTIVE_JOB_EXISTS",
            message: "An active Ads generation job already exists for this campaign.",
            jobId: error.existing.id,
          },
        },
        409,
      );
    }
    console.error("[ATHENA_ADS_API] generate_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "GENERATE_FAILED",
          message: "Failed to enqueue Ads generation.",
        },
      },
      500,
    );
  }
}
