import { NextResponse } from "next/server";
import { toPublicAdCampaignStatus } from "@/services/ads/adCampaignPublic";
import { getAdCampaignById } from "@/services/ads/adCampaignService";
import { getActiveAdGenerationJobForCampaign } from "@/services/ads/adsGenerationJobs/adGenerationJobService";
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

export async function GET(
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

    const { organizationId } = await requireCurrentOrganizationContext();
    const campaign = await getAdCampaignById(id, organizationId);
    if (!campaign) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Ad campaign not found." },
        },
        404,
      );
    }

    const activeJob = await getActiveAdGenerationJobForCampaign({
      campaignId: id,
      organizationId,
    });

    return json({
      ok: true,
      success: true,
      ...toPublicAdCampaignStatus(campaign),
      jobId: activeJob?.id ?? null,
      jobStatus: activeJob?.status ?? null,
    });
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
    throw error;
  }
}
