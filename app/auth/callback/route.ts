import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  console.log("AUTH CALLBACK URL:", request.url);
  console.log("AUTH CALLBACK CODE PRESENT:", Boolean(code));

  const siteUrl =
    process.env.OPENROUTER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  if (!code) {
    console.error("AUTH CALLBACK ERROR: missing code");
    return NextResponse.redirect(
      new URL("/login?message=Authentication link is invalid or expired", siteUrl),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("AUTH CALLBACK EXCHANGE ERROR:", error.message);
    return NextResponse.redirect(
      new URL(`/login?message=${encodeURIComponent(error.message)}`, siteUrl),
    );
  }

  console.log("AUTH CALLBACK SUCCESS");
  return NextResponse.redirect(new URL("/", siteUrl));
}
