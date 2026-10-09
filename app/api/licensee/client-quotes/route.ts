import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientQuoteDeps } from "@/services/clientQuote/clientQuotePersistence";
import {
  clientQuoteFailure,
  isClientQuoteHttpFailure,
  parseCreateClientQuoteBody,
} from "@/services/clientQuote/clientQuoteHttp";
import { toPublicClientQuote } from "@/services/clientQuote/clientQuotePublic";
import {
  createClientQuoteDraftForMaster,
  listClientQuotesForMaster,
} from "@/services/clientQuote/clientQuoteService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function fail(error: unknown) {
  const failure = clientQuoteFailure(error);
  if (failure.status >= 500) {
    console.error("[CLIENT_QUOTE_API]", error);
  }
  return jsonError(failure.status, failure.code, failure.message);
}

export async function GET() {
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const quotes = await listClientQuotesForMaster(
      userId,
      createDefaultClientQuoteDeps(),
    );
    return json({ ok: true, quotes: quotes.map(toPublicClientQuote) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as unknown;
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
  }

  const parsed = parseCreateClientQuoteBody(body);
  if (isClientQuoteHttpFailure(parsed)) {
    return jsonError(parsed.status, parsed.code, parsed.message);
  }

  try {
    const quote = await createClientQuoteDraftForMaster({
      masterUserId: userId,
      estimateId: parsed.estimateId,
      recipient: parsed.recipient,
      contentLanguage: parsed.contentLanguage,
      deps: createDefaultClientQuoteDeps(),
    });
    return json({ ok: true, quote: toPublicClientQuote(quote) }, 201);
  } catch (error) {
    return fail(error);
  }
}
