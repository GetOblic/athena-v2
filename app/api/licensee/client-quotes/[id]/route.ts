import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientQuoteDeps } from "@/services/clientQuote/clientQuotePersistence";
import {
  clientQuoteFailure,
  isClientQuoteHttpFailure,
  parseUpdateClientQuoteBody,
} from "@/services/clientQuote/clientQuoteHttp";
import { toPublicClientQuote } from "@/services/clientQuote/clientQuotePublic";
import {
  getClientQuoteForMaster,
  maskClientQuoteForMaster,
  updateClientQuoteDraftForMaster,
} from "@/services/clientQuote/clientQuoteService";

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

function fail(error: unknown) {
  const failure = clientQuoteFailure(error);
  if (failure.status >= 500) {
    console.error("[CLIENT_QUOTE_API]", error);
  }
  return jsonError(failure.status, failure.code, failure.message);
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
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const quote = await getClientQuoteForMaster({
      masterUserId: userId,
      quoteId: id.trim(),
      deps: createDefaultClientQuoteDeps(),
    });
    return json({ ok: true, quote: toPublicClientQuote(quote) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Quotation not found.");
  }
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

  const parsed = parseUpdateClientQuoteBody(body);
  if (isClientQuoteHttpFailure(parsed)) {
    return jsonError(parsed.status, parsed.code, parsed.message);
  }

  try {
    const quote = await updateClientQuoteDraftForMaster({
      masterUserId: userId,
      quoteId: id.trim(),
      draft: parsed.draft,
      contentLanguage: parsed.contentLanguage,
      deps: createDefaultClientQuoteDeps(),
    });
    return json({ ok: true, quote: toPublicClientQuote(quote) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Quotation not found.");
  }
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const masked = await maskClientQuoteForMaster({
      masterUserId: userId,
      quoteId: id.trim(),
      deps: createDefaultClientQuoteDeps(),
    });
    return json({ ok: true, alreadyMasked: masked.alreadyMasked });
  } catch (error) {
    return fail(error);
  }
}
