import {
  createGetOblicLink,
} from "@/lib/getoblic-links/server";
import {
  licenseeGetOblicLinksError,
  licenseeGetOblicLinksJson,
} from "@/lib/getoblic-links/licenseeRouteResponse";
import {
  assertBodyWithinLimit,
  parseCreateLinkBody,
} from "@/lib/getoblic-links/validation";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";
import {
  assertNoLicenseeGetOblicOrganizationSelection,
  requireLicenseeGetOblicLinksAccess,
} from "@/services/licensee/licenseeGetOblicLinksAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireLicenseeGetOblicLinksAccess();
    assertNoLicenseeGetOblicOrganizationSelection(request);

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
    const input = parseCreateLinkBody(parsedJson);
    const link = await createGetOblicLink(input);

    return licenseeGetOblicLinksJson({ ok: true, link }, 201);
  } catch (error) {
    return licenseeGetOblicLinksError(error);
  }
}
