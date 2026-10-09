import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientQuoteDeps } from "@/services/clientQuote/clientQuotePersistence";
import { clientQuoteFailure } from "@/services/clientQuote/clientQuoteHttp";
import { toPublicClientQuote } from "@/services/clientQuote/clientQuotePublic";
import { reviseClientQuoteForMaster } from "@/services/clientQuote/clientQuoteService";

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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Quotation not found.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const quote = await reviseClientQuoteForMaster({
      masterUserId: user.id,
      quoteId: id.trim(),
      deps: createDefaultClientQuoteDeps(),
    });
    return json({ ok: true, quote: toPublicClientQuote(quote) }, 201);
  } catch (error) {
    const failure = clientQuoteFailure(error);
    if (failure.status >= 500) {
      console.error("[CLIENT_QUOTE_API] revise_failed", error);
    }
    return jsonError(failure.status, failure.code, failure.message);
  }
}
