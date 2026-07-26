import { NextResponse } from "next/server";
import {
  createGetOblicLink,
  toAthenaApiError,
} from "@/lib/getoblic-links/server";
import {
  assertBodyWithinLimit,
  parseCreateLinkBody,
} from "@/lib/getoblic-links/validation";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";
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

export async function POST(request: Request) {
  try {
    await requireCurrentOrganizationContext();

    const rawBody = await request.text();
    assertBodyWithinLimit(request.headers.get("content-length"), rawBody);

    let parsedJson: unknown = null;
    try {
      parsedJson = rawBody.trim() ? JSON.parse(rawBody) : null;
    } catch {
      throw new GetOblicWorkerError(
        "VALIDATION",
        "Request body must be valid JSON.",
        400,
      );
    }

    const input = parseCreateLinkBody(parsedJson);
    const link = await createGetOblicLink(input);

    return json({ ok: true, link }, 201);
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

    const mapped = toAthenaApiError(error);
    return json(mapped.body, mapped.status);
  }
}
