import { NextResponse } from "next/server";
import {
  AdCampaignBriefValidationError,
  normalizeAdCampaignBrief,
} from "@/services/ads/adCampaignBrief";
import { createAdCampaignWithJob } from "@/services/ads/adCampaignOrchestration";
import { toPublicAdCampaignDetail, toPublicAdCampaignSummary } from "@/services/ads/adCampaignPublic";
import { listAdCampaigns } from "@/services/ads/adCampaignService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

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
    const { organizationId } = await requireCurrentOrganizationContext();
    const campaigns = await listAdCampaigns(organizationId);
    return json({
      ok: true,
      success: true,
      campaigns: campaigns.map(toPublicAdCampaignSummary),
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
    console.error("[ATHENA_ADS_API] list_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: { code: "LIST_FAILED", message: "Failed to list ad campaigns." },
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "INVALID_JSON", message: "Request body must be JSON." },
        },
        400,
      );
    }

    // Ignore client-provided organization ownership.
    const {
      organization_id: _organizationId,
      organizationId: _organizationIdCamel,
      user_id: _userId,
      userId: _userIdCamel,
      ...rest
    } = body;

    const briefSource =
      rest.brief && typeof rest.brief === "object" && !Array.isArray(rest.brief)
        ? rest.brief
        : rest;

    const brief = normalizeAdCampaignBrief(briefSource);
    const { campaign, job } = await createAdCampaignWithJob({
      organizationId,
      userId,
      brief,
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
    if (error instanceof AdCampaignBriefValidationError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        400,
      );
    }
    console.error("[ATHENA_ADS_API] create_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create ad campaign.",
        },
      },
      500,
    );
  }
}
