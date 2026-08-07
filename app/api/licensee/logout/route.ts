import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearLicenseeMasterMarkerCookie } from "@/services/licensee/licenseeMasterMarkerCookie";
import { clearLicenseeOriginCookie } from "@/services/licensee/licenseeOriginCookie";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/licensee/login", siteUrl));
  clearLicenseeOriginCookie(response);
  clearLicenseeMasterMarkerCookie(response);
  return response;
}
