import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  generateClientGetoblicKnowledgeBaseDraft,
  mapGetoblicContentDraftError,
} from "@/services/prospects/getoblicContentDraftGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Synchronous GetOblic knowledge base draft for the converted Client. No persistence. */
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const draft = await generateClientGetoblicKnowledgeBaseDraft({
      clientOrganizationId: organizationId,
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

    const mapped = mapGetoblicContentDraftError(error);
    return json(mapped.body, mapped.status);
  }
}
