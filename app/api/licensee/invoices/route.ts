import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultClientInvoiceDeps } from "@/services/clientInvoice/clientInvoicePersistence";
import { clientInvoiceFailure } from "@/services/clientInvoice/clientInvoiceHttp";
import { toPublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";
import { listClientInvoicesForMaster } from "@/services/clientInvoice/clientInvoiceService";

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
  const failure = clientInvoiceFailure(error);
  if (failure.status >= 500) {
    console.error("[CLIENT_INVOICE_API]", error);
  }
  return jsonError(failure.status, failure.code, failure.message);
}

export async function GET() {
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const invoices = await listClientInvoicesForMaster(
      userId,
      createDefaultClientInvoiceDeps(),
    );
    return json({ ok: true, invoices: invoices.map(toPublicClientInvoice) });
  } catch (error) {
    return fail(error);
  }
}
