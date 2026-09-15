import { NextResponse, type NextRequest } from "next/server";
import { getLicenseeAccountById } from "@/services/licensee/licenseeIdentity";
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

  if (!origin) {
    return NextResponse.json(
      { ok: true, canReturnToMaster: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const account = await getLicenseeAccountById(origin.licenseeAccountId);
  const body: {
    ok: true;
    canReturnToMaster: true;
    language?: string;
  } = {
    ok: true,
    canReturnToMaster: true,
  };
  if (account?.default_language) {
    body.language = account.default_language;
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
