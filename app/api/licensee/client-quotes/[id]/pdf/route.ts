import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientQuoteDeps } from "@/services/clientQuote/clientQuotePersistence";
import { loadIssuedClientQuoteSnapshotForPdf } from "@/services/clientQuote/pdf/clientQuotePdfAccess";
import {
  buildClientQuotePdfFilename,
  clientQuotePdfDownloadHeaders,
} from "@/services/clientQuote/pdf/clientQuotePdfFilename";
import { renderIssuedClientQuotePdf } from "@/services/clientQuote/pdf/renderClientQuotePdf";
import { clientQuoteFailure } from "@/services/clientQuote/clientQuoteHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    console.error("[CLIENT_QUOTE_PDF] request_failed");
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
    const snapshot = await loadIssuedClientQuoteSnapshotForPdf({
      masterUserId: userId,
      quoteId: id.trim(),
      deps: createDefaultClientQuoteDeps(),
    });
    let pdf: Buffer;
    try {
      pdf = await renderIssuedClientQuotePdf(snapshot);
    } catch {
      console.error("[CLIENT_QUOTE_PDF] render_failed");
      return jsonError(
        500,
        "CLIENT_QUOTE_PDF_FAILED",
        "Could not prepare the quotation PDF.",
      );
    }
    const filename = buildClientQuotePdfFilename({
      quoteNumber: snapshot.quoteNumber,
      issuedAt: snapshot.issuedAt,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: clientQuotePdfDownloadHeaders(filename),
    });
  } catch (error) {
    return fail(error);
  }
}
