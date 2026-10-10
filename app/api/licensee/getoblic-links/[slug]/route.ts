import {
  deleteGetOblicLink,
  getGetOblicLink,
  updateGetOblicLink,
} from "@/lib/getoblic-links/server";
import {
  licenseeGetOblicLinksError,
  licenseeGetOblicLinksJson,
} from "@/lib/getoblic-links/licenseeRouteResponse";
import {
  assertBodyWithinLimit,
  normalizeSlug,
  parseUpdateLinkBody,
} from "@/lib/getoblic-links/validation";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";
import {
  assertNoLicenseeGetOblicOrganizationSelection,
  requireLicenseeGetOblicLinksAccess,
} from "@/services/licensee/licenseeGetOblicLinksAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireLicenseeGetOblicLinksAccess();
    assertNoLicenseeGetOblicOrganizationSelection(request);
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    const link = await getGetOblicLink(slug);
    return licenseeGetOblicLinksJson({ ok: true, link });
  } catch (error) {
    return licenseeGetOblicLinksError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireLicenseeGetOblicLinksAccess();
    assertNoLicenseeGetOblicOrganizationSelection(request);
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

    assertNoLicenseeGetOblicOrganizationSelection(request, parsedJson);
    const input = parseUpdateLinkBody(parsedJson);
    const link = await updateGetOblicLink(slug, input);
    return licenseeGetOblicLinksJson({ ok: true, link });
  } catch (error) {
    return licenseeGetOblicLinksError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireLicenseeGetOblicLinksAccess();
    assertNoLicenseeGetOblicOrganizationSelection(request);
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    await deleteGetOblicLink(slug);
    return licenseeGetOblicLinksJson({ ok: true, deleted: true });
  } catch (error) {
    return licenseeGetOblicLinksError(error);
  }
}
