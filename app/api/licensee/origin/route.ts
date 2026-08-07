import { NextResponse, type NextRequest } from "next/server";
import {
  LICENSEE_ORIGIN_COOKIE,
  parseLicenseeOriginCookieValue,
} from "@/services/licensee/licenseeOriginCookie";

/**
 * Non-sensitive UI probe: whether Back to Master should be shown.
 * Does not expose cookie payload, tokens, or Master identifiers.
 */
export async function GET(request: NextRequest) {
  const origin = parseLicenseeOriginCookieValue(
    request.cookies.get(LICENSEE_ORIGIN_COOKIE)?.value,
  );

  return NextResponse.json(
    { ok: true, canReturnToMaster: Boolean(origin) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
