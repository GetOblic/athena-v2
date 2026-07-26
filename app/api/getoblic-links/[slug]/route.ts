import { NextResponse } from "next/server";
import {
  deleteGetOblicLink,
  getGetOblicLink,
  toAthenaApiError,
  updateGetOblicLink,
} from "@/lib/getoblic-links/server";
import {
  assertBodyWithinLimit,
  normalizeSlug,
  parseUpdateLinkBody,
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

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    await requireCurrentOrganizationContext();
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    const link = await getGetOblicLink(slug);
    return json({ ok: true, link });
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

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireCurrentOrganizationContext();
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);

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

    const input = parseUpdateLinkBody(parsedJson);
    const link = await updateGetOblicLink(slug, input);
    return json({ ok: true, link });
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

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  try {
    await requireCurrentOrganizationContext();
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    await deleteGetOblicLink(slug);
    return json({ ok: true, deleted: true });
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
