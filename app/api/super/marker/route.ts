import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SuperAdminAuthorityLookupError,
  isGetOblicSuperAdminUser,
} from "@/services/superAdmin/superAdminIdentity";
import { clearLicenseeMasterMarkerCookie } from "@/services/licensee/licenseeMasterMarkerCookie";
import {
  applySuperAdminMarkerCookie,
  clearSuperAdminMarkerCookie,
} from "@/services/superAdmin/superAdminMarkerCookie";

/**
 * Route-handler cookie mutations for the Super Admin UX marker.
 * Server Components cannot call cookies().set() — login/this route can.
 */
export async function GET(request: NextRequest) {
  const siteUrl =
    process.env.OPENROUTER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";
  const action = request.nextUrl.searchParams.get("action")?.trim();

  if (action === "clear") {
    const response = NextResponse.redirect(new URL("/", siteUrl));
    clearSuperAdminMarkerCookie(response);
    return response;
  }

  if (action === "refresh") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let authorized = false;
    try {
      authorized = Boolean(
        user?.id && (await isGetOblicSuperAdminUser(user.id)),
      );
    } catch (error) {
      if (!(error instanceof SuperAdminAuthorityLookupError)) {
        throw error;
      }
      authorized = false;
    }

    if (!user?.id || !authorized) {
      const response = NextResponse.redirect(new URL("/super/login", siteUrl));
      clearSuperAdminMarkerCookie(response);
      return response;
    }

    const response = NextResponse.redirect(new URL("/super", siteUrl));
    applySuperAdminMarkerCookie(response);
    clearLicenseeMasterMarkerCookie(response);
    return response;
  }

  return NextResponse.json(
    { ok: false, error: { code: "INVALID_ACTION", message: "Unknown action." } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
