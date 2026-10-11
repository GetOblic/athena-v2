import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleClientQuotePaymentLinks } from "@/services/clientQuotePayment/clientQuotePaymentApi";
import { parseClientQuotePaymentLinkBody } from "@/services/clientQuotePayment/clientQuotePaymentHttp";
import { createDefaultClientQuotePaymentLinkDeps } from "@/services/clientQuotePayment/clientQuotePaymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonError(status: number, code: string, message: string) {
  return json({ ok: false, error: { code, message } }, status);
}

async function masterUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Quotation not found.");
  }
  const userId = await masterUserId();
  if (!userId) return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  const result = await handleClientQuotePaymentLinks({
    method: "GET",
    quoteId: id,
    userId,
    deps: createDefaultClientQuotePaymentLinkDeps(),
    parseBody: parseClientQuotePaymentLinkBody,
  });
  return json(result.payload, result.status);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Quotation not found.");
  }
  const userId = await masterUserId();
  if (!userId) return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as unknown;
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const result = await handleClientQuotePaymentLinks({
    method: "POST",
    quoteId: id,
    userId,
    body,
    deps: createDefaultClientQuotePaymentLinkDeps(),
    parseBody: parseClientQuotePaymentLinkBody,
  });
  return json(result.payload, result.status);
}
