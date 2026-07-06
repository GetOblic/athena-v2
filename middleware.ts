import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const host = request.nextUrl.hostname;

  if (host === "phpstack-1560927-6533124.cloudwaysapps.com") {
    const redirectUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, "https://athena.getoblic.com");
    return Response.redirect(redirectUrl, 301);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
