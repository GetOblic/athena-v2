import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientInvoiceDeps } from "@/services/clientInvoice/clientInvoicePersistence";
import { clientInvoiceFailure } from "@/services/clientInvoice/clientInvoiceHttp";
import { toPublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";
import { issueClientInvoiceForMaster } from "@/services/clientInvoice/clientInvoiceService";

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
    return jsonError(404, "NOT_FOUND", "Invoice not found.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const invoice = await issueClientInvoiceForMaster({
      masterUserId: user.id,
      invoiceId: id.trim(),
      deps: createDefaultClientInvoiceDeps(),
    });
    return json({ ok: true, invoice: toPublicClientInvoice(invoice) });
  } catch (error) {
    const failure = clientInvoiceFailure(error);
    if (failure.status >= 500) {
      console.error("[CLIENT_INVOICE_API] issue_failed", error);
    }
    return jsonError(failure.status, failure.code, failure.message);
  }
}
