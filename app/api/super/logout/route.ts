import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearSuperAdminMarkerCookie } from "@/services/superAdmin/superAdminMarkerCookie";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const siteUrl =
    process.env.OPENROUTER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/super/login", siteUrl));
  clearSuperAdminMarkerCookie(response);
  return response;
}
