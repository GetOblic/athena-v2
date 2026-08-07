import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LICENSEE_MASTER_MARKER_COOKIE,
  LICENSEE_ORIGIN_COOKIE,
} from "@/services/licensee/licenseeCookieNames";

/**
 * Session refresh + route gates that can run on the Edge runtime.
 *
 * Master identity tables are NOT queried here — that requires the service-role
 * client and remains the security authority in Node route/service guards.
 * The Master marker cookie is UX-only.
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
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/ingestion") ||
    path.startsWith("/api/licensee/origin") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  const isLicenseePath = path === "/licensee" || path.startsWith("/licensee/");

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
    redirectUrl.pathname = isLicenseePath ? "/licensee/login" : "/login";
    redirectUrl.searchParams.set("redirectedFrom", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    const redirectUrl = request.nextUrl.clone();
    const hasMasterMarker = request.cookies.has(LICENSEE_MASTER_MARKER_COOKIE);
    const inHandoff = request.cookies.has(LICENSEE_ORIGIN_COOKIE);
    redirectUrl.pathname = hasMasterMarker && !inHandoff ? "/licensee" : "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // UX-only Master product-route gate. Marker is not security authority.
  // Skip when a handoff origin cookie is present (sub-account Athena session).
  if (
    user &&
    request.cookies.has(LICENSEE_MASTER_MARKER_COOKIE) &&
    !request.cookies.has(LICENSEE_ORIGIN_COOKIE) &&
    !isLicenseePath &&
    !isPublicPath &&
    !path.startsWith("/api/licensee/")
  ) {
    if (isApiPath) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: {
            code: "LICENSEE_MASTER_CONTEXT",
            message:
              "Business Licensee Master sessions cannot access Athena product APIs.",
          },
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/licensee";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Do not auto-redirect authenticated users away from /licensee/login here.
  // Master identity requires a Node service-role lookup, which must not run in
  // Edge middleware. The login page enforces Master authorization.

  return response;
}
