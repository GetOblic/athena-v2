import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  generateProspectGetoblicDescription,
  ProspectGetoblicDescriptionError,
} from "@/services/prospects/prospectGetoblicDescription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous directory-copy generation. */
export const maxDuration = 60;

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
    const { organizationId } = await requireCurrentOrganizationContext();

    const generatedListingDescription =
      await generateProspectGetoblicDescription({
        prospectId: id,
        organizationId,
      });

    return json({
      ok: true,
      generatedListingDescription,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    if (error instanceof ProspectGetoblicDescriptionError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.httpStatus;
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        status,
      );
    }

    return json(
      {
        ok: false,
        error: {
          code: "GENERATION_FAILED",
          message: "Athena could not generate this GetOblic description.",
        },
      },
      502,
    );
  }
}
