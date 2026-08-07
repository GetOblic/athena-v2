import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLicenseeMasterUser } from "@/services/licensee/licenseeIdentity";
import {
  applyLicenseeMasterMarkerCookie,
  clearLicenseeMasterMarkerCookie,
} from "@/services/licensee/licenseeMasterMarkerCookie";

/**
 * Route-handler cookie mutations for the Master UX marker.
 * Server Components cannot call cookies().set() — login/handoff/this route can.
 */
export async function GET(request: NextRequest) {
  const siteUrl =
    process.env.OPENROUTER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";
  const action = request.nextUrl.searchParams.get("action")?.trim();

  if (action === "clear") {
    const response = NextResponse.redirect(new URL("/", siteUrl));
    clearLicenseeMasterMarkerCookie(response);
    return response;
  }

  if (action === "refresh") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id || !(await isLicenseeMasterUser(user.id))) {
      const response = NextResponse.redirect(new URL("/licensee/login", siteUrl));
      clearLicenseeMasterMarkerCookie(response);
      return response;
    }

    const response = NextResponse.redirect(new URL("/licensee", siteUrl));
    applyLicenseeMasterMarkerCookie(response);
    return response;
  }

  return NextResponse.json(
    { ok: false, error: { code: "INVALID_ACTION", message: "Unknown action." } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
