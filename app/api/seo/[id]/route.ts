import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { toPublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import {
  deleteSeoReport,
  getSeoReportById,
} from "@/services/seo/seoReportService";
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
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }

    const { organizationId } = await requireCurrentOrganizationContext();
    const report = await getSeoReportById(id, organizationId);
    if (!report) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }

    return json({
      ok: true,
      success: true,
      report: toPublicSeoReportDetail(report),
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
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }

    const { organizationId } = await requireCurrentOrganizationContext();
    const deleted = await deleteSeoReport(id, organizationId);
    if (!deleted) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }

    revalidatePath("/seo");
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
    console.error("[ATHENA_SEO_API] delete_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: "Failed to delete SEO report.",
        },
      },
      500,
    );
  }
}
