import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientInvoiceDeps } from "@/services/clientInvoice/clientInvoicePersistence";
import {
  clientInvoiceFailure,
  isClientInvoiceHttpFailure,
  parseUpdateClientInvoiceBody,
} from "@/services/clientInvoice/clientInvoiceHttp";
import { toPublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";
import {
  getClientInvoiceForMaster,
  maskClientInvoiceForMaster,
  updateClientInvoiceDraftForMaster,
} from "@/services/clientInvoice/clientInvoiceService";

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
  const failure = clientInvoiceFailure(error);
  if (failure.status >= 500) {
    console.error("[CLIENT_INVOICE_API]", error);
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
    const invoice = await getClientInvoiceForMaster({
      masterUserId: userId,
      invoiceId: id.trim(),
      deps: createDefaultClientInvoiceDeps(),
    });
    return json({ ok: true, invoice: toPublicClientInvoice(invoice) });
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
    return jsonError(404, "NOT_FOUND", "Invoice not found.");
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

  const parsed = parseUpdateClientInvoiceBody(body);
  if (isClientInvoiceHttpFailure(parsed)) {
    return jsonError(parsed.status, parsed.code, parsed.message);
  }

  try {
    const invoice = await updateClientInvoiceDraftForMaster({
      masterUserId: userId,
      invoiceId: id.trim(),
      draft: parsed.draft,
      contentLanguage: parsed.contentLanguage,
      currencyCode: parsed.currencyCode,
      deps: createDefaultClientInvoiceDeps(),
    });
    return json({ ok: true, invoice: toPublicClientInvoice(invoice) });
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
    return jsonError(404, "NOT_FOUND", "Invoice not found.");
  }
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const masked = await maskClientInvoiceForMaster({
      masterUserId: userId,
      invoiceId: id.trim(),
      deps: createDefaultClientInvoiceDeps(),
    });
    return json({ ok: true, alreadyMasked: masked.alreadyMasked });
  } catch (error) {
    return fail(error);
  }
}
