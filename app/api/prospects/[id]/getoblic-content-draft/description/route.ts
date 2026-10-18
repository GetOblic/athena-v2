import { NextResponse } from "next/server";
import { FreeConvertGenerationError } from "@/lib/organization/freeConvertGeneration";
import { assertCurrentFreeConvertGeneration } from "@/services/organization/freeConvertGenerationGuard";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  generateProspectGetoblicDescriptionDraft,
  mapGetoblicContentDraftError,
} from "@/services/prospects/getoblicContentDraftGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous GetOblic description draft. No persistence. */
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    await assertCurrentFreeConvertGeneration({
      action: "sync_ai",
      prospectId: id,
    });

    const draft = await generateProspectGetoblicDescriptionDraft({
      prospectId: id,
      sourceOrganizationId: organizationId,
      signal: request.signal,
    });
    return json(draft);
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

    if (error instanceof FreeConvertGenerationError) {
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        error.httpStatus,
      );
    }

    const mapped = mapGetoblicContentDraftError(error);
    return json(mapped.body, mapped.status);
  }
}
