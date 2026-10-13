import { NextResponse } from "next/server";
import { communityDiscoveryDb } from "@/services/communityDiscovery/communityDiscoveryDb";
import { communityDiscoveryAuthFailure } from "@/services/communityDiscovery/communityDiscoveryHttp";
import { createSupabaseOrganizationCommunitySaves } from "@/services/communityDiscovery/communityDiscoveryPersistence";
import { removeOrganizationCommunitySave } from "@/services/communityDiscovery/organizationCommunitySaves";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const { id } = await context.params;
    await removeOrganizationCommunitySave({
      organizationId,
      saveId: id,
      repository: createSupabaseOrganizationCommunitySaves(communityDiscoveryDb()),
    });
    return json({ ok: true });
  } catch (error) {
    const mapped = communityDiscoveryAuthFailure(error);
    if (mapped) {
      return json(
        { ok: false, error: { code: mapped.code, message: mapped.message } },
        mapped.status,
      );
    }
    console.error("[ATHENA_COMMUNITY_DISCOVERY] save_remove_failed");
    return json(
      {
        ok: false,
        error: {
          code: "REMOVE_FAILED",
          message: "The community could not be removed from Saved.",
        },
      },
      500,
    );
  }
}
