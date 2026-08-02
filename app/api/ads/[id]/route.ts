import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { toPublicAdCampaignDetail } from "@/services/ads/adCampaignPublic";
import {
  deleteAdCampaign,
  getAdCampaignById,
} from "@/services/ads/adCampaignService";
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

function isValidId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isValidId(id)) {
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

    return json({
      ok: true,
      success: true,
      campaign: toPublicAdCampaignDetail(campaign),
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isValidId(id)) {
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
    const deleted = await deleteAdCampaign(id, organizationId);
    if (!deleted) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Ad campaign not found." },
        },
        404,
      );
    }

    revalidatePath("/ads");
    return json({ ok: true, success: true });
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
    console.error("[ATHENA_ADS_API] delete_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: "Failed to delete ad campaign.",
        },
      },
      500,
    );
  }
}
