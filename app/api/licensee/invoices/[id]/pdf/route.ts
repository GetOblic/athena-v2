import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientInvoiceDeps } from "@/services/clientInvoice/clientInvoicePersistence";
import { clientInvoiceFailure } from "@/services/clientInvoice/clientInvoiceHttp";
import { loadIssuedClientInvoiceSnapshotForPdf } from "@/services/clientInvoice/pdf/clientInvoicePdfAccess";
import {
  buildClientInvoicePdfFilename,
  clientInvoicePdfDownloadHeaders,
} from "@/services/clientInvoice/pdf/clientInvoicePdfFilename";
import { renderIssuedClientInvoicePdf } from "@/services/clientInvoice/pdf/renderClientInvoicePdf";

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
  const failure = clientInvoiceFailure(error);
  if (failure.status >= 500) {
    console.error("[CLIENT_INVOICE_PDF] request_failed");
  }
  return jsonError(failure.status, failure.code, failure.message);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Invoice not found.");
  }
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const snapshot = await loadIssuedClientInvoiceSnapshotForPdf({
      masterUserId: userId,
      invoiceId: id.trim(),
      deps: createDefaultClientInvoiceDeps(),
    });
    let pdf: Buffer;
    try {
      pdf = await renderIssuedClientInvoicePdf(snapshot);
    } catch {
      console.error("[CLIENT_INVOICE_PDF] render_failed");
      return jsonError(
        500,
        "CLIENT_INVOICE_PDF_FAILED",
        "Could not prepare the invoice PDF.",
      );
    }
    const filename = buildClientInvoicePdfFilename({
      invoiceNumber: snapshot.invoiceNumber,
      issueDate: snapshot.issueDate,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: clientInvoicePdfDownloadHeaders(filename),
    });
  } catch (error) {
    return fail(error);
  }
}
