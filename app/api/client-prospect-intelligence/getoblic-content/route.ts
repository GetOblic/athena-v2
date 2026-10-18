import { NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import {
  getoblicContentHttpResult,
  readClientGetoblicContent,
  saveClientGetoblicContent,
} from "@/services/prospects/getoblicContentSave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function artifactQuery(request: Request): string | null {
  return new URL(request.url).searchParams.get("artifact");
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const result = await readClientGetoblicContent({
      clientOrganizationId: organizationId,
      artifactType: artifactQuery(request),
    });
    const http = getoblicContentHttpResult(result);
    return json(http.body, http.status);
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
    return json(
      {
        ok: false,
        error: { code: "UNAVAILABLE", message: "Saved content is temporarily unavailable." },
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const result = await saveClientGetoblicContent({
      clientOrganizationId: organizationId,
      body: await readBody(request),
    });
    const http = getoblicContentHttpResult(result);
    return json(http.body, http.status);
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
    return json(
      {
        ok: false,
        error: { code: "UNAVAILABLE", message: "Saved content is temporarily unavailable." },
      },
      503,
    );
  }
}
