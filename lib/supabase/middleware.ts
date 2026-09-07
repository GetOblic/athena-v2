import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePrivilegedUxMarkerGate } from "@/lib/supabase/privilegedUxMarkerGates";
import {
  LICENSEE_MASTER_MARKER_COOKIE,
  LICENSEE_ORIGIN_COOKIE,
} from "@/services/licensee/licenseeCookieNames";
import { SUPER_ADMIN_MARKER_COOKIE } from "@/services/superAdmin/superAdminCookieNames";

/**
 * Session refresh + route gates that can run on the Edge runtime.
 *
 * Master / Super Admin identity tables are NOT queried here — that requires the
 * service-role client and remains the security authority in Node route/service
 * guards. Marker cookies are UX-only.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const isApiPath = path.startsWith("/api/");

  const isPublicPath =
    path === "/login" ||
    path === "/licensee/login" ||
    path === "/super/login" ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/ingestion") ||
    path.startsWith("/api/licensee/origin") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  const isLicenseePath = path === "/licensee" || path.startsWith("/licensee/");
  const isSuperPath = path === "/super" || path.startsWith("/super/");

  // Programmatic API clients must never receive an HTML login redirect.
  // Browser pages still redirect; API routes return structured JSON 401.
  if (!user && !isPublicPath) {
    if (isApiPath) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Your session has expired.",
          },
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isSuperPath
      ? "/super/login"
      : isLicenseePath
        ? "/licensee/login"
        : "/login";
    redirectUrl.searchParams.set("redirectedFrom", path);
    return NextResponse.redirect(redirectUrl);
  }

  const hasSuperMarker = request.cookies.has(SUPER_ADMIN_MARKER_COOKIE);
  const hasMasterMarker = request.cookies.has(LICENSEE_MASTER_MARKER_COOKIE);
  const hasOriginCookie = request.cookies.has(LICENSEE_ORIGIN_COOKIE);

  if (user && path === "/login") {
    const redirectUrl = request.nextUrl.clone();
    const inHandoff = hasOriginCookie;
    redirectUrl.pathname = hasSuperMarker
      ? "/super"
      : hasMasterMarker && !inHandoff
        ? "/licensee"
        : "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // UX-only product-route gates. Markers are not security authority.
  // Both markers together skip both gates so /licensee ↔ /super cannot cycle.
  if (user) {
    const gate = resolvePrivilegedUxMarkerGate({
      path,
      isPublicPath,
      isApiPath,
      isSuperPath,
      isLicenseePath,
      hasSuperMarker,
      hasMasterMarker,
      hasOriginCookie,
    });

    if (gate.kind === "api_forbidden") {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code:
              gate.code === "SUPER_ADMIN_CONTEXT"
                ? "SUPER_ADMIN_CONTEXT"
                : "LICENSEE_MASTER_CONTEXT",
            message:
              gate.code === "SUPER_ADMIN_CONTEXT"
                ? "GetOblic Super Admin sessions cannot access Athena or Licensee product APIs."
                : "Business Licensee Master sessions cannot access Athena product APIs.",
          },
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (gate.kind === "redirect") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = gate.pathname;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Do not auto-redirect authenticated users away from control-plane login pages.
  // Identity requires a Node service-role lookup, which must not run in Edge middleware.

  return response;
}
