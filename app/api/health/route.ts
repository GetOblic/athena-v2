import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "Athena",
    version: "1.0.0-rc1",
    database: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing",
    openrouter: process.env.OPENROUTER_API_KEY ? "configured" : "missing",
    timestamp: new Date().toISOString(),
  });
}
