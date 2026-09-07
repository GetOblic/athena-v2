import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLicenseeMasterUser } from "@/services/licensee/licenseeIdentity";
import {
  applyLicenseeMasterMarkerCookie,
  clearLicenseeMasterMarkerCookie,
} from "@/services/licensee/licenseeMasterMarkerCookie";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";
import {
  SuperAdminAuthorityLookupError,
  isGetOblicSuperAdminUser,
} from "@/services/superAdmin/superAdminIdentity";
import {
  applySuperAdminMarkerCookie,
  clearSuperAdminMarkerCookie,
} from "@/services/superAdmin/superAdminMarkerCookie";
import { provisionTenantForAuthenticatedUser } from "@/services/organizationService";

async function postAuthDestination(
  userId: string | undefined,
  siteUrl: string,
): Promise<URL> {
  if (userId && (await isGetOblicSuperAdminUser(userId))) {
    return new URL("/super", siteUrl);
  }
  if (userId && (await isLicenseeMasterUser(userId))) {
    return new URL("/licensee", siteUrl);
  }
  return new URL("/", siteUrl);
}

function redirectWithControlPlaneMarker(
  url: URL,
  options: { isMaster: boolean; isSuperAdmin: boolean },
): NextResponse {
  const response = NextResponse.redirect(url);
  if (options.isSuperAdmin) {
    applySuperAdminMarkerCookie(response);
    clearLicenseeMasterMarkerCookie(response);
  } else if (options.isMaster) {
    applyLicenseeMasterMarkerCookie(response);
    clearSuperAdminMarkerCookie(response);
  }
  return response;
}

async function finalizeAuthenticatedUser(
  userId: string,
  email: string | undefined,
  siteUrl: string,
): Promise<NextResponse> {
  try {
    await assertAccountAccessActive(userId);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?message=${encodeURIComponent("This account has been deactivated.")}`,
          siteUrl,
        ),
      );
    }
    throw error;
  }

  try {
    if (await isGetOblicSuperAdminUser(userId)) {
      return redirectWithControlPlaneMarker(
        await postAuthDestination(userId, siteUrl),
        { isMaster: false, isSuperAdmin: true },
      );
    }
  } catch (error) {
    // Fail closed: authority lookup failure must not provision as ordinary Athena.
    if (error instanceof SuperAdminAuthorityLookupError) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?message=${encodeURIComponent(
            "Account authority could not be verified. Please try again.",
          )}`,
          siteUrl,
        ),
      );
    }
    throw error;
  }

  if (await isLicenseeMasterUser(userId)) {
    return redirectWithControlPlaneMarker(
      await postAuthDestination(userId, siteUrl),
      { isMaster: true, isSuperAdmin: false },
    );
  }

  try {
    await provisionTenantForAuthenticatedUser(userId, email);
  } catch (error) {
    if (error instanceof SuperAdminAuthorityLookupError) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?message=${encodeURIComponent(
            "Account authority could not be verified. Please try again.",
          )}`,
          siteUrl,
        ),
      );
    }
    throw error;
  }
  return NextResponse.redirect(await postAuthDestination(userId, siteUrl));
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
      return finalizeAuthenticatedUser(user.id, user.email, siteUrl);
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
      return finalizeAuthenticatedUser(user.id, user.email, siteUrl);
    }

    return NextResponse.redirect(await postAuthDestination(user?.id, siteUrl));
  }

  return NextResponse.redirect(
    new URL("/login?message=Authentication link is invalid or expired", siteUrl),
  );
}
