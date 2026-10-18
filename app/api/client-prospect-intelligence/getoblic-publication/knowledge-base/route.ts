import { NextRequest, NextResponse } from "next/server";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  getoblicClientPublicationDeniedHttp,
  publicClientKnowledgeBasePublication,
  publishClientGetOblicKnowledgeBase,
} from "@/services/prospects/getoblicClientPublication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(_request: NextRequest) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const published = await publishClientGetOblicKnowledgeBase({
      clientOrganizationId: organizationId,
    });
    if (!published.ok) {
      const denied = getoblicClientPublicationDeniedHttp(published.reason);
      return json(denied.body, denied.status);
    }

    return json({
      ok: true,
      success: true,
      knowledge_base: publicClientKnowledgeBasePublication(published.result),
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

    if (error instanceof GetOblicDirectoryError) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.status,
      );
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "GETOBLIC_CONCURRENCY_CONFLICT",
          message: "GetOblic Directory could not synchronize this Knowledge Base.",
        },
      },
      500,
    );
  }
}
