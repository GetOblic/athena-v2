import { NextResponse } from "next/server";
import {
  SeoReportOrchestrationNotFoundError,
  TechnicalSeoEvidenceInsufficientError,
  enqueueGenerationForExistingReport,
  ReadySeoReportImmutableError,
} from "@/services/seo/seoReportOrchestration";
import { toPublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import { ActiveSeoGenerationJobConflictError } from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
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

    const { report, job } = await enqueueGenerationForExistingReport({
      reportId: id,
      organizationId,
      userId,
    });

    return json(
      {
        ok: true,
        success: true,
        report: toPublicSeoReportDetail(report),
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
    if (error instanceof ReadySeoReportImmutableError) {
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
    if (error instanceof ActiveSeoGenerationJobConflictError) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "ACTIVE_JOB_EXISTS",
            message: "An active SEO generation job already exists for this report.",
            jobId: error.existing.id,
          },
        },
        409,
      );
    }
    if (error instanceof TechnicalSeoEvidenceInsufficientError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        409,
      );
    }
    console.error("[ATHENA_SEO_API] generate_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "GENERATE_FAILED",
          message: "Failed to enqueue SEO generation.",
        },
      },
      500,
    );
  }
}
