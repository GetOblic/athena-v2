import { NextResponse } from "next/server";
import {
  deleteProspect,
  getProspectById,
  updateProspect,
} from "@/services/prospects/prospectService";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import { toPublicProspect } from "@/services/prospects/prospectPublic";
import { hasMeaningfulProspectEdit } from "@/services/prospects/prospectUtils";
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

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return value == null ? "" : String(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const prospect = await getProspectById(id, organizationId);
    if (!prospect) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }
    return json({ ok: true, success: true, prospect: toPublicProspect(prospect) });
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;

    const existing = await getProspectById(id, organizationId);
    if (!existing) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    const prospect = await updateProspect(id, organizationId, {
      business_name: optionalString(body.business_name),
      website: optionalString(body.website),
      linkedin: optionalString(body.linkedin),
      facebook: optionalString(body.facebook),
      instagram: optionalString(body.instagram),
      industry: optionalString(body.industry),
      category: optionalString(body.category),
      country: optionalString(body.country),
      state: optionalString(body.state),
      city: optionalString(body.city),
      address: optionalString(body.address),
      company_size: optionalString(body.company_size),
      revenue: optionalString(body.revenue),
      employee_count: optionalString(body.employee_count),
      technologies: optionalString(body.technologies),
      pain_points: optionalString(body.pain_points),
      decision_maker: optionalString(body.decision_maker),
      first_name: optionalString(body.first_name),
      last_name: optionalString(body.last_name),
      external_contact_id: optionalString(body.external_contact_id),
      timezone: optionalString(body.timezone),
      job_title: optionalString(body.job_title),
      email: optionalString(body.email),
      phone: optionalString(body.phone),
      whatsapp_number: optionalString(body.whatsapp_number),
      getoblic_type: optionalString(body.getoblic_type),
      google_business_url: optionalString(body.google_business_url),
      notes: optionalString(body.notes),
      additional_context: optionalString(body.additional_context),
      ads_content: optionalString(body.ads_content),
      community_id:
        body.community_id === null
          ? null
          : body.community_id != null
            ? String(body.community_id)
            : undefined,
    });

    if (!prospect) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    const meaningful = hasMeaningfulProspectEdit(
      existing as unknown as Record<string, unknown>,
      prospect as unknown as Record<string, unknown>,
    );

    let queued = false;
    let jobId: string | null = null;
    if (meaningful) {
      const result = await ensureProspectGenerationQueued(prospect, {
        requestedBy: userId,
      });
      queued = result.queued;
      jobId = result.jobId ?? null;
    }

    return json(
      {
        ok: true,
        success: true,
        prospect: toPublicProspect(prospect),
        regenerationQueued: queued,
        jobId,
        message: meaningful
          ? queued
            ? "Prospect saved. Intelligence regeneration queued."
            : "Prospect saved."
          : "Prospect metadata saved.",
      },
      queued ? 202 : 200,
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
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Update failed.",
        },
      },
      400,
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const existing = await getProspectById(id, organizationId);
    if (!existing) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Prospect not found." },
        },
        404,
      );
    }

    const deleted = await deleteProspect(id, organizationId);
    if (!deleted) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete prospect.",
          },
        },
        500,
      );
    }

    return json({
      ok: true,
      success: true,
      message: "Prospect deleted.",
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

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "DELETE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to delete prospect.",
        },
      },
      500,
    );
  }
}
