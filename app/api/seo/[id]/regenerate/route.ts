import { NextResponse } from "next/server";
import {
  SeoReportOrchestrationNotFoundError,
  regenerateSeoReport,
} from "@/services/seo/seoReportOrchestration";
import { toPublicSeoReportDetail } from "@/services/seo/seoReportPublic";
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
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }

    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const { report, job } = await regenerateSeoReport({
      sourceReportId: id,
      organizationId,
      userId,
    });

    return json(
      {
        ok: true,
        success: true,
        report: toPublicSeoReportDetail(report),
        jobId: job.id,
        regeneratedFrom: id,
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
    if (error instanceof SeoReportOrchestrationNotFoundError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "SEO report not found." },
        },
        404,
      );
    }
    console.error("[ATHENA_SEO_API] regenerate_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "REGENERATE_FAILED",
          message: "Failed to regenerate SEO report.",
        },
      },
      500,
    );
  }
}
