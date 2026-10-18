import { NextResponse } from "next/server";
import { resolveClientProspectIntelligenceAuthority } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(available: boolean, status = 200) {
  return NextResponse.json(
    { available },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Session-scoped nav flag only. Ignores every caller-supplied id.
 * Missing, reversed, foreign, and ambiguous conversions report unavailable.
 */
export async function GET() {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const authority =
      await resolveClientProspectIntelligenceAuthority(organizationId);
    return json(authority.ok === true);
  } catch {
    return json(false);
  }
}
