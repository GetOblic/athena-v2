import { NextResponse } from "next/server";
import { toAthenaApiError } from "@/lib/getoblic-links/server";
import { LicenseeGetOblicLinksAccessError } from "@/services/licensee/licenseeGetOblicLinksAccess";

export function licenseeGetOblicLinksJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function licenseeGetOblicLinksError(error: unknown) {
  if (error instanceof LicenseeGetOblicLinksAccessError) {
    return licenseeGetOblicLinksJson(
      {
        ok: false,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  }

  const mapped = toAthenaApiError(error);
  return licenseeGetOblicLinksJson(mapped.body, mapped.status);
}
