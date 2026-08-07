import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLicenseeMasterUser } from "@/services/licensee/licenseeIdentity";
import { applyLicenseeMasterMarkerCookie } from "@/services/licensee/licenseeMasterMarkerCookie";
import { provisionTenantForAuthenticatedUser } from "@/services/organizationService";

async function postAuthDestination(
  userId: string | undefined,
  siteUrl: string,
): Promise<URL> {
  if (userId && (await isLicenseeMasterUser(userId))) {
    return new URL("/licensee", siteUrl);
  }
  return new URL("/", siteUrl);
}

function redirectWithMasterMarker(url: URL, isMaster: boolean): NextResponse {
  const response = NextResponse.redirect(url);
  if (isMaster) {
    applyLicenseeMasterMarkerCookie(response);
  }
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const token = requestUrl.searchParams.get("token");
  const type = requestUrl.searchParams.get("type");

  const siteUrl =
    process.env.OPENROUTER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?message=${encodeURIComponent(error.message)}`, siteUrl),
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      if (await isLicenseeMasterUser(user.id)) {
        return redirectWithMasterMarker(
          await postAuthDestination(user.id, siteUrl),
          true,
        );
      }
      await provisionTenantForAuthenticatedUser(user.id, user.email);
    }

    return NextResponse.redirect(await postAuthDestination(user?.id, siteUrl));
  }

  if (token && type === "magiclink") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "magiclink",
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?message=${encodeURIComponent(error.message)}`, siteUrl),
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      if (await isLicenseeMasterUser(user.id)) {
        return redirectWithMasterMarker(
          await postAuthDestination(user.id, siteUrl),
          true,
        );
      }
      await provisionTenantForAuthenticatedUser(user.id, user.email);
    }

    return NextResponse.redirect(await postAuthDestination(user?.id, siteUrl));
  }

  return NextResponse.redirect(
    new URL("/login?message=Authentication link is invalid or expired", siteUrl),
  );
}
