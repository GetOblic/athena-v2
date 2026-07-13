import { NextResponse } from "next/server";
import { importProspectManual } from "@/services/prospects/prospectImporter";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
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

function rowFromBody(body: Record<string, unknown>) {
  return {
    business_name: String(body.business_name ?? body.businessName ?? "") || null,
    website: String(body.website ?? "") || null,
    linkedin: String(body.linkedin ?? "") || null,
    facebook: String(body.facebook ?? "") || null,
    instagram: String(body.instagram ?? "") || null,
    industry: String(body.industry ?? "") || null,
    category: String(body.category ?? "") || null,
    country: String(body.country ?? "") || null,
    state: String(body.state ?? "") || null,
    city: String(body.city ?? "") || null,
    address: String(body.address ?? "") || null,
    company_size: String(body.company_size ?? body.companySize ?? "") || null,
    revenue: String(body.revenue ?? "") || null,
    employee_count:
      String(body.employee_count ?? body.employeeCount ?? "") || null,
    technologies: String(body.technologies ?? "") || null,
    pain_points: String(body.pain_points ?? body.painPoints ?? "") || null,
    decision_maker:
      String(body.decision_maker ?? body.decisionMaker ?? "") || null,
    first_name: String(body.first_name ?? body.firstName ?? "") || null,
    last_name: String(body.last_name ?? body.lastName ?? "") || null,
    external_contact_id:
      String(body.external_contact_id ?? body.externalContactId ?? "") || null,
    timezone: String(body.timezone ?? "") || null,
    job_title: String(body.job_title ?? body.jobTitle ?? "") || null,
    email: String(body.email ?? "") || null,
    phone: String(body.phone ?? "") || null,
    whatsapp_number:
      String(body.whatsapp_number ?? body.whatsappNumber ?? "") || null,
    google_business_url:
      String(body.google_business_url ?? body.googleBusinessUrl ?? "") || null,
    notes: String(body.notes ?? "") || null,
    additional_context:
      String(body.additional_context ?? body.additionalContext ?? "") || null,
    ads_content: String(body.ads_content ?? body.adsContent ?? "") || null,
    source: String(body.source ?? "") || null,
  };
}

/** Manual Prospect create + durable enqueue. */
export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;
    const row = rowFromBody(body);

    const result = await importProspectManual({
      organizationId,
      userId,
      row,
    });

    if (result.duplicate) {
      return json({
        ok: true,
        success: true,
        accepted: false,
        duplicate: true,
        prospect: toPublicProspect(result.prospect),
        prospectId: result.prospect.id,
        message: "Prospect already exists.",
      });
    }

    return json(
      {
        ok: true,
        success: true,
        accepted: result.queued,
        duplicate: false,
        invalidWebsite: result.invalidWebsite,
        withoutWebsite: result.withoutWebsite,
        prospect: toPublicProspect(result.prospect),
        prospectId: result.prospect.id,
        jobId: result.jobId ?? null,
        status: result.prospect.status,
        message: result.queued
          ? "Prospect imported. Intelligence generation queued."
          : "Prospect imported.",
      },
      result.queued ? 202 : 200,
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

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "IMPORT_FAILED",
          message:
            error instanceof Error ? error.message : "Prospect import failed.",
        },
      },
      400,
    );
  }
}
