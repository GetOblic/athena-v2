import { NextResponse } from "next/server";
import { toPublicSeoReportStatus } from "@/services/seo/seoReportPublic";
import { getSeoReportById } from "@/services/seo/seoReportService";
import { getActiveSeoGenerationJobForReport } from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
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

    const activeJob = await getActiveSeoGenerationJobForReport({
      reportId: id,
      organizationId,
    });

    return json({
      ok: true,
      success: true,
      ...toPublicSeoReportStatus(report),
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
