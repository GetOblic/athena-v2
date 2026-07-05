import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    return NextResponse.redirect(new URL("/", siteUrl));
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

    return NextResponse.redirect(new URL("/", siteUrl));
  }

  return NextResponse.redirect(
    new URL("/login?message=Authentication link is invalid or expired", siteUrl),
  );
}
