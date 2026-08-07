import type { NextResponse } from "next/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";

/**
 * Non-authoritative UX marker for Master sessions.
 * Server licensee_accounts lookup remains the security authority.
 */
export { LICENSEE_MASTER_MARKER_COOKIE };

const MARKER_TTL_SECONDS = 60 * 60 * 24 * 30;

function markerCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function applyLicenseeMasterMarkerCookie(response: NextResponse): void {
  response.cookies.set(
    LICENSEE_MASTER_MARKER_COOKIE,
    "1",
    markerCookieOptions(MARKER_TTL_SECONDS),
  );
}

export function clearLicenseeMasterMarkerCookie(response: NextResponse): void {
  response.cookies.set(
    LICENSEE_MASTER_MARKER_COOKIE,
    "",
    markerCookieOptions(0),
  );
}

export function licenseeMasterMarkerCookieWriteOptions() {
  return {
    name: LICENSEE_MASTER_MARKER_COOKIE,
    value: "1",
    ...markerCookieOptions(MARKER_TTL_SECONDS),
  };
}

export function licenseeMasterMarkerCookieClearOptions() {
  return {
    name: LICENSEE_MASTER_MARKER_COOKIE,
    value: "",
    ...markerCookieOptions(0),
  };
}
