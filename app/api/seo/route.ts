import { NextResponse } from "next/server";
import {
  SeoReportBriefValidationError,
  normalizeSeoReportBrief,
} from "@/services/seo/seoReportBrief";
import {
  createSeoReportWithJob,
  TechnicalSeoEvidenceInsufficientError,
} from "@/services/seo/seoReportOrchestration";
import { toPublicSeoReportDetail, toPublicSeoReportSummary } from "@/services/seo/seoReportPublic";
import { listSeoReports } from "@/services/seo/seoReportService";
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
    const reports = await listSeoReports(organizationId);
    return json({
      ok: true,
      success: true,
      reports: reports.map(toPublicSeoReportSummary),
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
    console.error("[ATHENA_SEO_API] list_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: { code: "LIST_FAILED", message: "Failed to list SEO reports." },
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

    const brief = normalizeSeoReportBrief(briefSource);
    const { report, job } = await createSeoReportWithJob({
      organizationId,
      userId,
      brief,
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
    if (error instanceof SeoReportBriefValidationError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: error.code, message: error.message },
        },
        400,
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
    console.error("[ATHENA_SEO_API] create_failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create SEO report.",
        },
      },
      500,
    );
  }
}
