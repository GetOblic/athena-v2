import type { NextResponse } from "next/server";
import { SUPER_ADMIN_MARKER_COOKIE } from "@/services/superAdmin/superAdminCookieNames";

/**
 * Non-authoritative UX marker for Super Admin sessions.
 * Server getoblic_super_admins lookup remains the security authority.
 */
export { SUPER_ADMIN_MARKER_COOKIE };

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

export function applySuperAdminMarkerCookie(response: NextResponse): void {
  response.cookies.set(
    SUPER_ADMIN_MARKER_COOKIE,
    "1",
    markerCookieOptions(MARKER_TTL_SECONDS),
  );
}

export function clearSuperAdminMarkerCookie(response: NextResponse): void {
  response.cookies.set(
    SUPER_ADMIN_MARKER_COOKIE,
    "",
    markerCookieOptions(0),
  );
}

export function superAdminMarkerCookieWriteOptions() {
  return {
    name: SUPER_ADMIN_MARKER_COOKIE,
    value: "1",
    ...markerCookieOptions(MARKER_TTL_SECONDS),
  };
}

export function superAdminMarkerCookieClearOptions() {
  return {
    name: SUPER_ADMIN_MARKER_COOKIE,
    value: "",
    ...markerCookieOptions(0),
  };
}
