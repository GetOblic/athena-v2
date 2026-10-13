import { NextRequest, NextResponse } from "next/server";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { resolveProspectFunnelEnsureContext } from "@/services/prospects/prospectFunnelCanonicalDestinations";
import { createSupabaseProspectFunnelShortLinkStore } from "@/services/prospects/prospectFunnelShortLinkPersistence";
import { createProspectFunnelShortLinkWorker } from "@/services/prospects/prospectFunnelShortLinkWorker";
import { ensureProspectFunnelShortLinks } from "@/services/prospects/prospectFunnelShortLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: prospectId } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const resolved = await resolveProspectFunnelEnsureContext({
      organizationId,
      prospectId,
    });
    if (!resolved) {
      return json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "Prospect not found" },
        },
        404,
      );
    }

    const links = await ensureProspectFunnelShortLinks({
      organizationId: resolved.organizationId,
      prospectId: resolved.prospectId,
      destinations: resolved.destinations,
      store: createSupabaseProspectFunnelShortLinkStore(),
      worker: createProspectFunnelShortLinkWorker(),
    });

    return json({ ok: true, links });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    console.error("[PROSPECT_FUNNEL_LINKS] request_failed", {
      code: "REQUEST",
    });
    return json(
      {
        ok: false,
        error: {
          code: "UNAVAILABLE",
          message: "Prospect Funnel links could not be ensured.",
        },
      },
      503,
    );
  }
}
