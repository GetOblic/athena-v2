import { NextResponse } from "next/server";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { loadSeoProspectPdfBrandAssets } from "@/services/seo/seoProspectPdf/loadSeoProspectPdfBrandAssets";
import { renderSeoProspectPdf } from "@/services/seo/seoProspectPdf/renderSeoProspectPdf";
import { resolveSeoProspectPdfParties } from "@/services/seo/seoProspectPdf/resolveSeoProspectPdfParties";
import { buildSeoProspectPdfFilename } from "@/services/seo/seoProspectPdf/seoProspectPdfFilename";
import { getSeoReportById } from "@/services/seo/seoReportService";
import {
  isSeoTechnicalPackage,
  isSeoIntelligencePackage,
} from "@/services/seo/seoReportTypes";
import { isCompleteSeoIntelligencePackage } from "@/services/seo/seoReportValidation";
import { isCompleteSeoTechnicalPackage } from "@/services/seo/seoTechnicalValidation";
import { resolveSeoGenerationType } from "@/services/seo/seoGenerationType";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function notFound() {
  return json(
    {
      ok: false,
      success: false,
      error: { code: "NOT_FOUND", message: "SEO report not found." },
    },
    404,
  );
}

function notReady() {
  return json(
    {
      ok: false,
      success: false,
      error: {
        code: "SEO_REPORT_NOT_READY",
        message: "Prospect PDF is available only for a Ready SEO report.",
      },
    },
    409,
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id.trim())) {
      return notFound();
    }

    const { organizationId } = await requireCurrentOrganizationContext();
    const report = await getSeoReportById(id, organizationId);
    if (!report) {
      return notFound();
    }

    const pkg = report.status === "Ready" ? report.package_json : null;
    const generationType = resolveSeoGenerationType({
      brief: report.brief_json,
      package: pkg,
    });
    const readyPackage =
      generationType === "technical"
        ? isSeoTechnicalPackage(pkg) && isCompleteSeoTechnicalPackage(pkg)
          ? pkg
          : null
        : isSeoIntelligencePackage(pkg) && isCompleteSeoIntelligencePackage(pkg)
          ? pkg
          : null;

    if (!readyPackage) {
      return notReady();
    }

    const { language } = await getTenantLocalization();
    const parties = await resolveSeoProspectPdfParties(organizationId);
    const brand = await loadSeoProspectPdfBrandAssets(
      parties.sender.organizationId,
    );
    const pdf = await renderSeoProspectPdf({
      pkg: readyPackage,
      parties,
      brand,
      language,
      reportDateIso: report.created_at,
    });
    const filename = buildSeoProspectPdfFilename({
      subjectName: parties.subject.name,
      generationType,
      reportDateIso: report.created_at,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
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
    console.error("[ATHENA_SEO_API] prospect_pdf_failed");
    void error;
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "PROSPECT_PDF_FAILED",
          message: "Failed to generate the prospect PDF.",
        },
      },
      500,
    );
  }
}
