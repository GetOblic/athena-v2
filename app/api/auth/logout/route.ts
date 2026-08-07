import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearLicenseeMasterMarkerCookie } from "@/services/licensee/licenseeMasterMarkerCookie";
import { clearLicenseeOriginCookie } from "@/services/licensee/licenseeOriginCookie";
import { clearSuperAdminMarkerCookie } from "@/services/superAdmin/superAdminMarkerCookie";

/**
 * Normal Athena logout.
 * If the session came from a Master handoff, clear origin/marker cookies and do
 * NOT restore the Master session.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(
    new URL("/login", process.env.OPENROUTER_SITE_URL || "http://localhost:3000"),
  );
  clearLicenseeOriginCookie(response);
  clearLicenseeMasterMarkerCookie(response);
  clearSuperAdminMarkerCookie(response);
  return response;
}
