import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientQuoteFailure } from "@/services/clientQuote/clientQuoteHttp";
import { createDefaultClientQuoteTemplateDeps } from "@/services/clientQuote/clientQuoteTemplatePersistence";
import { toPublicClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplatePublic";
import {
  maskClientQuoteTemplateForMaster,
  updateClientQuoteTemplateForMaster,
} from "@/services/clientQuote/clientQuoteTemplateService";

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
    console.error("[CLIENT_QUOTE_TEMPLATE_API]", error);
  }
  return jsonError(failure.status, failure.code, failure.message);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id.trim())) {
    return jsonError(404, "NOT_FOUND", "Template not found.");
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

  try {
    const template = await updateClientQuoteTemplateForMaster({
      masterUserId: userId,
      templateId: id.trim(),
      body,
      deps: createDefaultClientQuoteTemplateDeps(),
    });
    return json({ ok: true, template: toPublicClientQuoteTemplate(template) });
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
    return jsonError(404, "NOT_FOUND", "Template not found.");
  }
  const userId = await masterUserId();
  if (!userId) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }
  try {
    const masked = await maskClientQuoteTemplateForMaster({
      masterUserId: userId,
      templateId: id.trim(),
      deps: createDefaultClientQuoteTemplateDeps(),
    });
    return json({ ok: true, alreadyMasked: masked.alreadyMasked });
  } catch (error) {
    return fail(error);
  }
}
